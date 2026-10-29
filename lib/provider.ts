import { isUsable } from './defaults';
import { redactSecrets } from './redact';
import type { CustomFilter, ProviderId, SignalId, Settings, TweetInput } from './types';

/**
 * Jev is reachable two ways. Both take the identical `{model, state, questions}`
 * body and return the identical `{model, answers, usage}` response, so the only
 * per-provider differences are the URL and the model id namespace.
 */
export const PROVIDERS: Record<
  ProviderId,
  {
    label: string;
    name: string;
    url: string;
    defaultModel: string;
    keysUrl: string;
    keyPrefix: string;
  }
> = {
  typesafe: {
    label: 'TypeSafe (direct)',
    name: 'TypeSafe',
    url: 'https://api.typesafe.ai/v1/systemone',
    // Versioned id. As of the Oct 2026 models docs, `jev-latest` aliases this.
    defaultModel: 'jev-1.14.0',
    keysUrl: 'https://console.typesafe.ai/settings/keys',
    keyPrefix: 'apikey_',
  },
  openrouter: {
    label: 'OpenRouter',
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/alpha/decisions',
    // OpenRouter's current model id. `~typesafe/jev-latest` is the floating alias.
    defaultModel: 'typesafe/jev-1.14',
    keysUrl: 'https://openrouter.ai/keys',
    keyPrefix: 'sk-or-',
  },
};

const MAX_RETRY_DELAY_MS = 30_000;
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Every request gets a timeout: the wait holds a concurrency slot, so a hung
 * connection would otherwise stall classification until the tab is closed.
 */
function requestSignal(external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  if (!external) return timeout;
  return typeof AbortSignal.any === 'function'
    ? AbortSignal.any([external, timeout])
    : external;
}

/** $0.042 per million input tokens; output tokens are free. */
const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

type NoulQuestion = {
  type: 'noul';
  instructions: string;
  criteria?: { true: string; false: string };
};
type ScoreQuestion = { type: 'score'; instructions: string; criteria: string[] };
type Question = NoulQuestion | ScoreQuestion;

/** Jev rejects a score question whose criteria has an 11th level with a 422. */
export const MAX_SCORE_LEVELS = 10;

export function capScoreCriteria(levels: readonly string[]): string[] {
  return levels.slice(0, MAX_SCORE_LEVELS);
}

/** Question names the live model was scored under. Settings still say slop/ads. */
const API_QUESTION: Record<SignalId, string> = {
  slop: 'ai_slop',
  ragebait: 'ragebait',
  ads: 'ad',
};

const SIGNAL_QUESTIONS: Record<SignalId, NoulQuestion> = {
  slop: {
    type: 'noul',
    instructions:
      "The post is low-effort AI-generated or engagement-farming 'slop': formulaic thread-bait, " +
      'hollow motivational platitudes, listicles of truisms, engagement-baiting questions, ' +
      'or text that reads as machine-written filler.',
    criteria: {
      true: 'Formulaic engagement bait or machine-written filler with no specific substance',
      false: 'A genuine post with specific, concrete substance, however casual',
    },
  },
  ragebait: {
    type: 'noul',
    instructions:
      'The post is rage bait: engineered to provoke outrage, tribal anger, or moral panic ' +
      'rather than to inform.',
    criteria: {
      true: 'Inflammatory, dunk-y, or manufactured outrage designed to farm angry replies',
      false: 'Calm or informative, even when it discusses a contentious topic',
    },
  },
  ads: {
    type: 'noul',
    instructions:
      'The post is advertising or promotion: a paid ad, sponsored content, an affiliate or ' +
      'dropshipping pitch, crypto or giveaway shilling, or a thinly veiled sales pitch.',
    criteria: {
      true: 'Primarily selling or promoting something',
      false: 'Not promotional, even if it mentions a product the author likes',
    },
  },
};

export const QUALITY_LEVELS = [
  'Worthless noise',
  'Low value filler',
  'Mildly interesting',
  'Genuinely informative or insightful',
];

const QUALITY_QUESTION: ScoreQuestion = {
  type: 'score',
  instructions: 'The overall informational value of this post to a thoughtful reader.',
  criteria: QUALITY_LEVELS,
};

/** Namespaced so a user's filter can never collide with a built-in signal. */
export const CUSTOM_PREFIX = 'cf_';

export function customKey(filter: CustomFilter): string {
  return CUSTOM_PREFIX + filter.id;
}

export function toQuestion(filter: CustomFilter): Question {
  return {
    type: 'noul',
    instructions: filter.instructions.trim(),
    criteria: {
      true: filter.whenTrue.trim() || 'The statement is true of this post',
      false: filter.whenFalse.trim() || 'The statement is not true of this post',
    },
  };
}

export function activeCustomFilters(settings: Settings): CustomFilter[] {
  return (settings.customFilters ?? []).filter((f) => f.enabled && isUsable(f));
}

export function buildQuestions(settings: Settings): Record<string, Question> {
  const questions: Record<string, Question> = {};
  for (const [id, cfg] of Object.entries(settings.signals)) {
    if (!cfg.enabled) continue;
    questions[API_QUESTION[id as SignalId]] = SIGNAL_QUESTIONS[id as SignalId];
  }
  // Engagement-bait slop often comes back as `ad`, so the slop filter asks both.
  if (settings.signals.slop.enabled) questions.ad = SIGNAL_QUESTIONS.ads;
  if (settings.minQuality > 0) {
    questions.quality = { ...QUALITY_QUESTION, criteria: capScoreCriteria(QUALITY_QUESTION.criteria) };
  }
  for (const filter of activeCustomFilters(settings)) {
    questions[customKey(filter)] = toQuestion(filter);
  }
  return questions;
}

/**
 * Long threads and quote chains are cut to this. Warm calls on ordinary posts
 * are ~100ms; a pasted chain is not worth the extra tokens.
 */
export const MAX_STATE_CHARS = 4_000;

function squash(value: string): string {
  return value.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return '';
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** The `state` field is the tweet text, not a structured record. */
export function buildState(tweet: Pick<TweetInput, 'text' | 'quotedText'>): string {
  const text = squash(tweet.text);
  const quote = squash(tweet.quotedText ?? '');
  if (!quote) return clip(text, MAX_STATE_CHARS);
  return clip(`${text}\n\nQuoted:\n${quote}`, MAX_STATE_CHARS);
}

const SCORE_LABEL: Record<SignalId, string> = {
  slop: 'AI slop',
  ragebait: 'Rage bait',
  ads: 'Promotional',
};

/**
 * Hide when slop or ad clears the slop bar. A high ad score with slop turned
 * on is still a hide: that is how engagement-bait slop comes back.
 */
export function hidingMatch(
  scores: Record<string, number>,
  settings: Settings,
): { label: string; score: number } | null {
  let best: { label: string; score: number } | null = null;
  const consider = (label: string, score: number | undefined, threshold: number) => {
    if (score === undefined || score < threshold) return;
    if (!best || score > best.score) best = { label, score };
  };

  if (settings.signals.slop.enabled) {
    const bar = settings.signals.slop.threshold;
    consider(SCORE_LABEL.slop, scores.slop, bar);
    consider('Ad', scores.ads, bar);
  }
  if (settings.signals.ragebait.enabled) {
    consider(SCORE_LABEL.ragebait, scores.ragebait, settings.signals.ragebait.threshold);
  }
  if (settings.signals.ads.enabled) {
    consider(SCORE_LABEL.ads, scores.ads, settings.signals.ads.threshold);
  }
  for (const filter of activeCustomFilters(settings)) {
    consider(filter.label.trim(), scores[customKey(filter)], filter.threshold);
  }
  return best;
}

/**
 * Noul answers are `{ type: 'noul', noul }` and have no confidence field.
 * Score answers carry `score`. Question ids `ai_slop` and `ad` map back onto
 * the settings keys `slop` and `ads`.
 */
export function readScores(answers: Record<string, Partial<Answer>> | undefined): {
  scores: Record<string, number>;
  quality?: number;
} {
  const scores: Record<string, number> = {};
  let quality: number | undefined;
  for (const [key, answer] of Object.entries(answers ?? {})) {
    if (!answer) continue;
    if (answer.type === 'score' && typeof answer.score === 'number') {
      if (key === 'quality') quality = answer.score;
      continue;
    }
    const noul = 'noul' in answer ? answer.noul : undefined;
    if (typeof noul !== 'number') continue;
    const id = key === 'ai_slop' ? 'slop' : key === 'ad' ? 'ads' : key;
    scores[id] = noul;
  }
  return { scores, quality };
}

export interface NoulAnswer {
  type: 'noul';
  noul: number;
}
export interface ScoreAnswer {
  type: 'score';
  score: number;
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
}
export type Answer = NoulAnswer | ScoreAnswer;

export interface SystemOneResponse {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export function costOf(inputTokens: number): number {
  return inputTokens * USD_PER_INPUT_TOKEN;
}

/** Floating names. Sending one would let a later release move the thresholds. */
const FLOATING_MODELS = new Set([
  'jev-latest',
  'jev-preview',
  'typesafe/jev-latest',
  '~typesafe/jev-latest',
]);

export function resolveModel(settings: { provider: ProviderId; model: string }): string {
  const requested = settings.model.trim();
  if (!requested || FLOATING_MODELS.has(requested)) return PROVIDERS[settings.provider].defaultModel;
  return requested;
}

interface CallOptions {
  provider: ProviderId;
  apiKey: string;
  model: string;
  state: unknown;
  questions: Record<string, Question>;
  signal?: AbortSignal;
}

/**
 * Delay before another attempt, or null when the call should fail open.
 * 429 and 529 wait for `retry-after` when it is present and short enough to
 * hold a concurrency slot. A longer `retry-after` is not retried early.
 * 422 is a bug in the request and is never retried.
 */
export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
  if (header === null || header.trim() === '') return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(header);
  if (Number.isFinite(when)) return Math.max(0, when - now);
  return null;
}

export function nextRetryDelay(
  status: number,
  retryAfterHeader: string | null,
  attempt: number,
  now = Date.now(),
): number | null {
  if (attempt >= 3) return null;
  if (status !== 429 && status !== 529 && status < 500) return null;
  const headerMs = parseRetryAfter(retryAfterHeader, now);
  if ((status === 429 || status === 529) && headerMs !== null) {
    if (headerMs > MAX_RETRY_DELAY_MS) return null;
    return headerMs;
  }
  return 400 * 2 ** attempt;
}

/** Retries 429/529/5xx. 401 is a bad key. 422 is a bug. Both fail open. */
export async function callSystemOne(
  opts: CallOptions,
  attempt = 0,
): Promise<SystemOneResponse> {
  const provider = PROVIDERS[opts.provider];
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.apiKey}`,
  };
  // OpenRouter attributes traffic to an app via these; both are optional.
  if (opts.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/kaster-23/x-anti-slop';
    headers['X-Title'] = 'x-anti-slop';
  }

  let res: Response;
  try {
    res = await fetch(provider.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: opts.model,
        state: opts.state,
        questions: opts.questions,
      }),
      signal: requestSignal(opts.signal),
    });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    if ((err as Error).name === 'TimeoutError') {
      throw new ProviderError(`No response after ${REQUEST_TIMEOUT_MS / 1000}s`, 0, true);
    }
    throw new ProviderError(redactSecrets(`Network error: ${(err as Error).message}`), 0, true);
  }

  if (res.ok) return (await res.json()) as SystemOneResponse;

  if (res.status === 422) {
    const detail = redactSecrets(await errorDetail(res));
    console.error('[x-anti-slop] 422 from Jev. This is a bug in the request, not the key.', detail);
    throw new ProviderError(
      'The filter request was rejected (422). This is a bug in the extension, not your key.',
      422,
      false,
    );
  }

  const retryAfter = res.headers.get('retry-after');
  const delay = nextRetryDelay(res.status, retryAfter, attempt);
  if (delay !== null) {
    const headerMs = parseRetryAfter(retryAfter);
    const wait = headerMs !== null && (res.status === 429 || res.status === 529)
      ? delay
      : delay + Math.random() * 200;
    await new Promise((r) => setTimeout(r, wait));
    return callSystemOne(opts, attempt + 1);
  }

  throw new ProviderError(await describeError(res), res.status, false);
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.error?.message ?? body?.message ?? body?.detail ?? '';
    return typeof detail === 'string' ? detail : JSON.stringify(detail);
  } catch {
    return '';
  }
}

async function describeError(res: Response): Promise<string> {
  const detail = await errorDetail(res);
  switch (res.status) {
    case 401:
      return 'Check your key. The provider rejected it (401).';
    case 403:
      return 'The provider refused this key (403).';
    case 429:
    case 529:
      return 'Rate limited by the provider. Slow down or try again shortly.';
    default:
      return redactSecrets(detail ? `${res.status}: ${detail}` : `Request failed (${res.status})`);
  }
}

/**
 * Scores one custom filter against a sample post, so a filter can be checked
 * before it starts hiding things.
 */
export async function testFilter(
  settings: Settings,
  apiKey: string,
  filter: CustomFilter,
  text: string,
): Promise<{ ok: true; score: number } | { ok: false; error: string }> {
  try {
    const res = await callSystemOne({
      provider: settings.provider,
      apiKey,
      model: resolveModel(settings),
      state: buildState({ text }),
      questions: { probe: toQuestion(filter) },
    });
    const answer = res.answers.probe;
    if (answer?.type !== 'noul') return { ok: false, error: 'Unexpected answer type' };
    return { ok: true, score: answer.noul };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** The cheapest round trip that still proves the key works. */
export async function testCredentials(
  provider: ProviderId,
  apiKey: string,
  model: string,
): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
  try {
    const res = await callSystemOne({
      provider,
      apiKey,
      model: model.trim() || PROVIDERS[provider].defaultModel,
      state: 'hello',
      questions: {
        ping: {
          type: 'noul',
          instructions: 'This text is a greeting.',
          criteria: { true: 'It is a greeting', false: 'It is not a greeting' },
        },
      },
    });
    return { ok: true, model: res.model };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
