import { storage } from '#imports';
import {
  buildQuestions,
  buildState,
  callSystemOne,
  costOf,
  hidingMatch,
  readScores,
  resolveModel,
  toSlopPost,
} from './provider';
import { localSignature } from './prefilter';
import { questionSignature } from './signature';
import { redactSecrets } from './redact';
import { QUEUE_CONCURRENCY, RequestQueue } from './request-queue';
import { aiWrittenHide, aiWrittenScore } from './ai-written';
import { activeKey, slopThresholdsOf } from './defaults';
import { EMPTY_STATS, statsStore } from './settings';
import { featureVector, judgeSlop, resolveWeights, slopExceeds, type SlopCategory } from './detect/score';
import type { Settings, Stats, TweetInput, Verdict } from './types';

const CACHE_LIMIT = 5000;
const LOCAL_COUNTED_LIMIT = 5000;
/** Four attempts at 2s plus the capped gaps between them. */
const SLOT_BUDGET_MS = 12_000;

const queue = new RequestQueue<CacheEntry>({
  concurrency: QUEUE_CONCURRENCY,
  timeoutMs: SLOT_BUDGET_MS,
});

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
  /** Present only on a fresh model response. Not a reason to re-send the post. */
  cost?: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CacheEntry>>();
/** Bumped by clearCache so a request already on the wire cannot refill the cache. */
let cacheEpoch = 0;
/** Orders cache writes so an older in-flight request cannot replace a newer one. */
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
  cacheEpoch += 1;
  cache.clear();
  committedSeq.clear();
  // Drop the map so a caller that starts after the clear does not join a
  // request that was already in flight and then skip the network.
  inFlight.clear();
  clearTimeout(flushTimer);
  flushTimer = undefined;
  await cacheStore.setValue({});
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

  // Ads and rage bait use their own bars. A high ad score also hides when slop
  // is on. The style score adds category bars and the lower reply-bot bar.
  let best = hidingMatch(entry.scores, settings);
  if (settings.signals.slop.enabled) {
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
    if (hit && (!best || hit.score > best.score)) best = { label: 'AI slop', score: hit.score };
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
  if (!verdict.filtered) {
    const authored = aiWrittenHide(aiWrittenScore(entry.scores), settings);
    if (authored) {
      verdict.filtered = true;
      verdict.reason = `${authored.label} (${Math.round(authored.score * 100)}%)`;
    }
  }
  return verdict;
}

/**
 * Usage is accumulated in memory and flushed on a short timer. Writing straight
 * through would lose counts: up to four classifications finish at
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
    console.warn(
      '[x-anti-slop] stats write failed',
      redactSecrets(err instanceof Error ? err.message : String(err)),
    );
  }
}

function emptyDelta(): Stats {
  return { checked: 0, filtered: 0, settledLocally: 0, bySignal: {}, inputTokens: 0, cost: 0 };
}

function mergeInto(target: Stats, delta: Stats) {
  target.checked += delta.checked ?? 0;
  target.filtered += delta.filtered ?? 0;
  target.settledLocally = (target.settledLocally ?? 0) + (delta.settledLocally ?? 0);
  target.inputTokens += delta.inputTokens ?? 0;
  target.cost += delta.cost ?? 0;
  for (const [label, count] of Object.entries(delta.bySignal ?? {})) {
    target.bySignal[label] = (target.bySignal[label] ?? 0) + count;
  }
}

async function mergeStats(delta: Stats) {
  const stored = coerceStats(await statsStore.getValue());
  const merged = { ...stored, bySignal: { ...stored.bySignal } };
  mergeInto(merged, delta);
  await statsStore.setValue(merged);
}

export function coerceStats(stored: Partial<Stats> | null | undefined): Stats {
  return {
    checked: stored?.checked ?? 0,
    filtered: stored?.filtered ?? 0,
    settledLocally: stored?.settledLocally ?? 0,
    bySignal: stored?.bySignal ?? {},
    inputTokens: stored?.inputTokens ?? 0,
    cost: stored?.cost ?? 0,
  };
}

export interface LocalDecision {
  id: string;
  filtered: boolean;
  reason?: string;
}

const countedStore = storage.defineItem<string[]>('local:localCounted', { fallback: [] });
let countedIds = new Set<string>();
let countedLoading: Promise<void> | undefined;
let countedTimer: ReturnType<typeof setTimeout> | undefined;
let localWriteQueue: Promise<unknown> = Promise.resolve();

function ensureCounted(): Promise<void> {
  countedLoading ??= (async () => {
    const stored = await countedStore.getValue();
    countedIds = new Set(stored ?? []);
  })();
  return countedLoading;
}

function scheduleCountedFlush() {
  if (countedTimer !== undefined) return;
  countedTimer = setTimeout(() => {
    countedTimer = undefined;
    const trimmed = [...countedIds].slice(-LOCAL_COUNTED_LIMIT);
    countedIds = new Set(trimmed);
    void countedStore.setValue(trimmed).catch((err) => {
      console.warn(
        '[x-anti-slop] local counter write failed',
        redactSecrets(err instanceof Error ? err.message : String(err)),
      );
    });
  }, 2000);
}

export function rememberLocalDecisions(
  decisions: readonly LocalDecision[],
  settings: Settings,
): Promise<void> {
  const run = localWriteQueue.then(() => writeLocalDecisions(decisions, settings));
  localWriteQueue = run.catch(() => undefined);
  return run;
}

async function writeLocalDecisions(
  decisions: readonly LocalDecision[],
  settings: Settings,
): Promise<void> {
  await ensureCounted();
  const sig = localSignature(settings);
  let fresh = 0;
  let hidden = 0;
  const bySignal: Record<string, number> = {};
  const seen = new Set<string>();

  for (const decision of decisions) {
    if (!decision.id || seen.has(decision.id)) continue;
    seen.add(decision.id);
    const key = `${sig}:${decision.id}`;
    if (countedIds.has(key)) continue;
    countedIds.add(key);
    fresh++;
    if (decision.filtered) {
      hidden++;
      const label = (decision.reason ?? 'Local').replace(/\s*\(.*\)$/, '');
      bySignal[label] = (bySignal[label] ?? 0) + 1;
    }
  }

  if (fresh === 0) return;
  scheduleCountedFlush();
  pending ??= emptyDelta();
  mergeInto(pending, {
    checked: fresh,
    filtered: hidden,
    settledLocally: fresh,
    bySignal,
    inputTokens: 0,
    cost: 0,
  });
  if (statsTimer !== undefined) return;
  statsTimer = setTimeout(() => {
    statsTimer = undefined;
    statsQueue = statsQueue.then(flushStats).catch(() => undefined);
  }, 1000);
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

/**
 * One post, one request. The style bank rides in that same call. A 30-question
 * request has the same warm latency as a 3-question one, so the questions are
 * not split. Returns the score entry, not a verdict.
 */
async function fetchEntry(
  tweet: TweetInput,
  settings: Settings,
  sig: string,
  seq: number,
  epoch: number,
  signal: AbortSignal,
): Promise<CacheEntry> {
  const post = toSlopPost(tweet);
  const questions = buildQuestions(settings, post);
  const res = await callSystemOne({
    provider: settings.provider,
    apiKey: activeKey(settings),
    model: resolveModel(settings),
    state: buildState(tweet),
    questions,
    signal,
  });

  const read = readScores(res.answers);
  const entry: CacheEntry = {
    scores: read.scores,
    quality: read.quality,
    sig,
    at: Date.now(),
    cost: costOf(res.usage?.input_tokens ?? 0),
  };

  if (settings.signals.slop.enabled) {
    const weights = resolveWeights(settings.slopWeights);
    const styleAnswers: Record<string, { type: 'noul'; noul: number } | { type: 'score'; score: number }> = {};
    for (const [key, answer] of Object.entries(res.answers)) {
      if (answer.type === 'noul') styleAnswers[key] = { type: 'noul', noul: answer.noul };
      else if (answer.type === 'score') styleAnswers[key] = { type: 'score', score: answer.score };
    }
    const features = featureVector(styleAnswers, post);
    const judged = judgeSlop(features, weights, post, slopThresholdsOf(settings));
    entry.scores.slop = judged.score;
    entry.categoryScores = judged.categories;
    entry.humanVeto = judged.humanVeto;
    entry.botReply = judged.botReply;
    entry.features = features;
  }

  // A clear, or a newer question set for this post, wins over a response that
  // was already in flight.
  if (epoch === cacheEpoch && seq >= (committedSeq.get(tweet.id) ?? 0)) {
    committedSeq.set(tweet.id, seq);
    cache.set(tweet.id, entry);
    scheduleFlush();
  }

  const verdict = decide(tweet.id, entry, settings);
  recordUsage(res.usage?.input_tokens ?? 0, verdict.filtered, verdict.reason);
  return entry;
}

async function classifyTweet(tweet: TweetInput, settings: Settings, sig: string): Promise<Verdict> {
  const hit = cache.get(tweet.id);
  if (hit?.sig === sig) return { ...decide(tweet.id, hit, settings), cached: true };

  if (Object.keys(buildQuestions(settings)).length === 0) {
    return { id: tweet.id, scores: {}, filtered: false };
  }

  // Same tweet and question set share one request. A second enqueue only
  // moves a still-queued post forward. A different question set is a new call.
  const flightKey = `${tweet.id}\0${sig}`;
  let pendingFlight = inFlight.get(flightKey);
  if (!pendingFlight) {
    const seq = ++nextSeq;
    const epoch = cacheEpoch;
    // The epoch is part of the queue id so a cache clear cannot join a request
    // that was already in flight under the previous cache.
    const promise = queue
      .enqueue({
        id: `${flightKey}\0${epoch}`,
        priority: tweet.priority ?? 0,
        run: (signal) => fetchEntry(tweet, settings, sig, seq, epoch, signal),
      })
      .then((outcome) => {
        if (!outcome.ok) throw new Error(outcome.error);
        return outcome.value;
      });
    const tracked = promise.finally(() => {
      if (inFlight.get(flightKey) === tracked) inFlight.delete(flightKey);
    });
    inFlight.set(flightKey, tracked);
    pendingFlight = tracked;
  }

  try {
    const entry = await pendingFlight;
    const verdict = decide(tweet.id, entry, settings);
    return entry.cost === undefined ? verdict : { ...verdict, cost: entry.cost };
  } catch (err) {
    return {
      id: tweet.id,
      scores: {},
      filtered: false,
      error: redactSecrets((err as Error).message || 'Classification failed'),
    };
  }
}

export async function classify(
  tweets: TweetInput[],
  settings: Settings,
): Promise<Verdict[]> {
  await ensureCache();
  const sig = questionSignature(settings);
  const verdicts = await Promise.all(tweets.map((tweet) => classifyTweet(tweet, settings, sig)));

  // Settled once per batch: a batch that reached the API at all clears the
  // banner, one that could not raises it.
  const attempted = verdicts.filter((v) => !v.cached);
  if (attempted.length > 0) {
    settleError(attempted.find((v) => v.error)?.error ?? null);
  }
  return verdicts;
}
