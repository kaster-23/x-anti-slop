import { storage } from '#imports';
import {
  activeCustomFilters,
  buildQuestions,
  buildState,
  callSystemOne,
  costOf,
  customKey,
  resolveModel,
  toSlopPost,
  type NoulAnswer,
  type ScoreAnswer,
} from './provider';
import { djb2 } from './hash';
import { activeKey, slopThresholdsOf } from './defaults';
import { EMPTY_STATS, statsStore } from './settings';
import {
  featureVector,
  judgeSlop,
  resolveWeights,
  scoringFingerprint,
  slopExceeds,
  type SlopCategory,
} from './detect/score';
import type { Settings, SignalId, Stats, TweetInput, Verdict } from './types';

const SIGNAL_LABELS: Record<SignalId, string> = {
  slop: 'AI slop',
  ragebait: 'Rage bait',
  ads: 'Promotional',
};

/** Jev allows 1200 req/min, so this is well inside the limit. */
const MAX_CONCURRENCY = 6;
const CACHE_LIMIT = 5000;

interface CacheEntry {
  scores: Record<string, number>;
  quality?: number;
  categoryScores?: Partial<Record<SlopCategory, number>>;
  humanVeto?: boolean;
  botReply?: boolean;
  features?: Record<string, number>;
  /** Question set, weights, and thresholds that produced this. A mismatch re-checks. */
  sig: string;
  at: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<Verdict>>();
let nextSeq = 0;
const committedSeq = new Map<string, number>();
let cacheLoading: Promise<void> | undefined;
let flushTimer: ReturnType<typeof setTimeout> | undefined;

const cacheStore = storage.defineItem<Record<string, CacheEntry>>('local:verdictCache', {
  fallback: {},
});

function ensureCache(): Promise<void> {
  cacheLoading ??= (async () => {
    const stored = await cacheStore.getValue();
    for (const [id, entry] of Object.entries(stored ?? {})) cache.set(id, entry);
  })();
  return cacheLoading;
}

/**
 * An MV3 service worker can be torn down at any moment, so the cache is written
 * out shortly after each batch rather than on a long interval that may never
 * fire. Losing a write only costs a re-check, never correctness.
 */
function scheduleFlush() {
  if (flushTimer !== undefined) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    void flushCache();
  }, 2000);
}

async function flushCache() {
  const entries = [...cache.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, CACHE_LIMIT);
  cache.clear();
  for (const [id, entry] of entries) cache.set(id, entry);
  await cacheStore.setValue(Object.fromEntries(entries));
}

export async function clearCache() {
  cache.clear();
  committedSeq.clear();
  clearTimeout(flushTimer);
  flushTimer = undefined;
  await cacheStore.setValue({});
}

/** Fingerprints everything that changes a verdict, so stale cache entries
 *  stop matching and get re-checked. */
function questionSignature(settings: Settings): string {
  const on = Object.entries(settings.signals)
    .filter(([, c]) => c.enabled)
    .map(([id]) => id)
    .sort();
  // Hashes the wording too, so editing a filter's text re-checks affected posts.
  const custom = activeCustomFilters(settings)
    .map((f) => `${f.id}:${f.instructions}:${f.whenTrue}:${f.whenFalse}`)
    .sort()
    .join('|');
  const thresholds = Object.entries(settings.signals)
    .map(([id, cfg]) => `${id}:${cfg.enabled ? 1 : 0}:${cfg.threshold}`)
    .join(',');
  const customThresholds = activeCustomFilters(settings)
    .map((f) => `${f.id}@${f.threshold}`)
    .sort()
    .join(',');
  const weights = resolveWeights(settings.slopWeights);
  return [
    on.join(','),
    `q${settings.minQuality}`,
    resolveModel(settings),
    djb2(custom),
    thresholds,
    customThresholds,
    scoringFingerprint(weights, slopThresholdsOf(settings)),
  ].join('|');
}

function decide(id: string, entry: CacheEntry, settings: Settings): Verdict {
  const verdict: Verdict = {
    id,
    scores: entry.scores,
    quality: entry.quality,
    features: entry.features,
    categoryScores: entry.categoryScores,
    humanVeto: entry.humanVeto,
    botReply: entry.botReply,
    filtered: false,
  };

  // The strongest signal over its threshold becomes the reason shown.
  let best: { label: string; score: number } | null = null;
  for (const [signal, cfg] of Object.entries(settings.signals)) {
    if (!cfg.enabled) continue;
    if (signal === 'slop') {
      const hit = slopExceeds(
        {
          score: entry.scores.slop ?? 0,
          categories: {
            assistant: 0,
            profundity: 0,
            cadence: 0,
            circumvention: 0,
            vocabulary: 0,
            templates: 0,
            ...entry.categoryScores,
          },
          humanVeto: entry.humanVeto === true,
          botReply: entry.botReply === true,
        },
        slopThresholdsOf(settings),
      );
      if (!hit) continue;
      if (!best || hit.score > best.score) best = { label: SIGNAL_LABELS.slop, score: hit.score };
      continue;
    }
    const score = entry.scores[signal as SignalId];
    if (score === undefined || score < cfg.threshold) continue;
    if (!best || score > best.score) {
      best = { label: SIGNAL_LABELS[signal as SignalId], score };
    }
  }

  for (const filter of activeCustomFilters(settings)) {
    const score = entry.scores[customKey(filter)];
    if (score === undefined || score < filter.threshold) continue;
    if (!best || score > best.score) best = { label: filter.label.trim(), score };
  }

  if (best) {
    verdict.filtered = true;
    verdict.reason = `${best.label} (${Math.round(best.score * 100)}%)`;
    return verdict;
  }

  if (settings.minQuality > 0 && entry.quality !== undefined && entry.quality < settings.minQuality) {
    verdict.filtered = true;
    verdict.reason = `Low quality (${entry.quality.toFixed(1)}/3)`;
  }
  return verdict;
}

/**
 * Usage is accumulated in memory and flushed on a short timer. Writing straight
 * through would lose counts: up to MAX_CONCURRENCY classifications finish at
 * once, and each would read the same stored total before adding one to it.
 */
let pending: Stats | null = null;
let statsTimer: ReturnType<typeof setTimeout> | undefined;
let statsQueue: Promise<unknown> = Promise.resolve();

function recordUsage(inputTokens: number, filtered: boolean, reason?: string) {
  pending ??= emptyDelta();
  pending.checked += 1;
  pending.inputTokens += inputTokens;
  pending.cost += costOf(inputTokens);
  if (filtered) {
    pending.filtered += 1;
    if (reason) {
      const label = reason.replace(/\s*\(.*\)$/, '');
      pending.bySignal[label] = (pending.bySignal[label] ?? 0) + 1;
    }
  }

  if (statsTimer !== undefined) return;
  statsTimer = setTimeout(() => {
    statsTimer = undefined;
    statsQueue = statsQueue.then(flushStats).catch(() => undefined);
  }, 1000);
}

async function flushStats() {
  const delta = pending;
  pending = null;
  if (!delta) return;

  try {
    await mergeStats(delta);
  } catch (err) {
    // Put the counts back so the next flush retries them rather than losing them.
    mergeInto((pending ??= emptyDelta()), delta);
    console.warn('[x-anti-slop] stats write failed', err);
  }
}

function emptyDelta(): Stats {
  return { checked: 0, filtered: 0, bySignal: {}, inputTokens: 0, cost: 0 };
}

function mergeInto(target: Stats, delta: Stats) {
  target.checked += delta.checked;
  target.filtered += delta.filtered;
  target.inputTokens += delta.inputTokens;
  target.cost += delta.cost;
  for (const [label, count] of Object.entries(delta.bySignal)) {
    target.bySignal[label] = (target.bySignal[label] ?? 0) + count;
  }
}

async function mergeStats(delta: Stats) {
  const stored = (await statsStore.getValue()) ?? EMPTY_STATS;
  const merged = { ...stored, bySignal: { ...stored.bySignal } };
  mergeInto(merged, delta);
  await statsStore.setValue(merged);
}

/**
 * #2: resetting has to drop the buffered delta too, or the next flush adds the
 * counts the user just cleared straight back on.
 */
export async function resetStats() {
  pending = null;
  clearTimeout(statsTimer);
  statsTimer = undefined;
  statsQueue = statsQueue.then(() => statsStore.setValue(EMPTY_STATS));
  await statsQueue;
}

/**
 * A failing key or a network outage otherwise shows up only as posts quietly
 * never being filtered, which is indistinguishable from a clean timeline.
 */
export const errorStore = storage.defineItem<{ message: string; at: number } | null>(
  'local:lastError',
  { fallback: null },
);

/**
 * Errors go stale: one dropped request should not still be greeting the user
 * days later. Anything older than this is treated as resolved on read.
 */
export const ERROR_TTL_MS = 10 * 60 * 1000;

export async function readError(): Promise<{ message: string; at: number } | null> {
  const stored = await errorStore.getValue();
  if (!stored) return null;
  return Date.now() - stored.at < ERROR_TTL_MS ? stored : null;
}

/**
 * Serialised, and only ever settled once per batch. Writing per-request from
 * both the success and failure paths let a single success inside a partly
 * rate-limited batch erase the very error worth showing.
 */
let errorQueue: Promise<unknown> = Promise.resolve();

function settleError(message: string | null) {
  errorQueue = errorQueue
    .then(async () => {
      if (message) return errorStore.setValue({ message, at: Date.now() });
      if ((await errorStore.getValue()) !== null) await errorStore.setValue(null);
    })
    .catch(() => undefined);
}

let active = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  // Loops rather than waking straight into the slot: a caller arriving in the
  // gap between the release and this microtask could otherwise take it first.
  while (active >= MAX_CONCURRENCY) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/**
 * One post, one request. The style bank is about 30 questions on that post's
 * text. A smoke test put a 30-question call at the same warm latency as a
 * 3-question call (~80–125 ms) and about 1,070 input tokens, so the questions
 * are not split across requests. Several posts in one state would make the
 * questions ambiguous about which post they refer to.
 */
async function classifyOne(tweet: TweetInput, settings: Settings, seq: number): Promise<Verdict> {
  const post = toSlopPost(tweet);
  const questions = buildQuestions(settings, post);
  if (Object.keys(questions).length === 0) {
    return { id: tweet.id, scores: {}, filtered: false };
  }

  const res = await withSlot(() =>
    callSystemOne({
      provider: settings.provider,
      apiKey: activeKey(settings),
      model: resolveModel(settings),
      state: buildState(tweet),
      questions,
    }),
  );

  const entry: CacheEntry = { scores: {}, sig: questionSignature(settings), at: Date.now() };
  for (const [key, answer] of Object.entries(res.answers)) {
    if (key === 'quality' && answer.type === 'score') {
      entry.quality = (answer as ScoreAnswer).score;
    } else if (answer.type === 'noul' && (key === 'ragebait' || key === 'ads' || key.startsWith('cf_'))) {
      entry.scores[key] = (answer as NoulAnswer).noul;
    }
  }

  if (settings.signals.slop.enabled) {
    const weights = resolveWeights(settings.slopWeights);
    const styleAnswers: Record<string, NoulAnswer | ScoreAnswer> = {};
    for (const [key, answer] of Object.entries(res.answers)) {
      if (answer.type === 'noul' || answer.type === 'score') styleAnswers[key] = answer;
    }
    const features = featureVector(styleAnswers, post);
    const judged = judgeSlop(features, weights, post, slopThresholdsOf(settings));
    entry.scores.slop = judged.score;
    entry.categoryScores = judged.categories;
    entry.humanVeto = judged.humanVeto;
    entry.botReply = judged.botReply;
    entry.features = features;
  }

  // A slower request for an older question set must not replace a newer score.
  if (seq >= (committedSeq.get(tweet.id) ?? 0)) {
    committedSeq.set(tweet.id, seq);
    cache.set(tweet.id, entry);
    scheduleFlush();
  }

  const verdict = decide(tweet.id, entry, settings);
  recordUsage(res.usage?.input_tokens ?? 0, verdict.filtered, verdict.reason);
  return verdict;
}

export async function classify(
  tweets: TweetInput[],
  settings: Settings,
): Promise<Verdict[]> {
  await ensureCache();
  const sig = questionSignature(settings);

  const verdicts = await Promise.all(
    tweets.map(async (tweet) => {
      const hit = cache.get(tweet.id);
      if (hit && hit.sig === sig) return { ...decide(tweet.id, hit, settings), cached: true };

      const flightKey = `${tweet.id}\0${sig}`;
      const pending = inFlight.get(flightKey);
      if (pending) return pending;

      const seq = ++nextSeq;
      const promise = classifyOne(tweet, settings, seq)
        .catch((err): Verdict => ({
          id: tweet.id,
          scores: {},
          filtered: false,
          error: (err as Error).message,
        }))
        .finally(() => {
          if (inFlight.get(flightKey) === promise) inFlight.delete(flightKey);
        });

      inFlight.set(flightKey, promise);
      return promise;
    }),
  );

  // Settled once per batch: a batch that reached the API at all clears the
  // banner, one that could not raises it.
  const attempted = verdicts.filter((v) => !v.cached);
  if (attempted.length > 0) {
    settleError(attempted.find((v) => v.error)?.error ?? null);
  }
  return verdicts;
}
