import { prefilter, type PrefilterPost } from './prefilter';
import { QUEUE_CONCURRENCY } from './request-queue';
import type { Settings } from './types';
import { distanceToViewport } from './viewport';
import type { HeuristicScorer } from './heuristics';

export interface SimPost extends PrefilterPost {
  id: string;
  y: number;
  height: number;
}

export interface SimScenario {
  viewportHeight: number;
  /** Extra root margin above and below the screen. One viewport in the product. */
  prefetchMargin: number;
  scrollSpeedPxPerSec: number;
  /**
   * Service time for a model call. A number is the same for every call.
   * A function receives the post and how many model calls have already started
   * (0 is the cold call). Omitted uses {@link mockModelLatency}.
   */
  modelLatencyMs?: number | ((post: SimPost, callIndex: number) => number);
  concurrency?: number;
  settings: Settings;
  scorer?: HeuristicScorer;
  /** False when `modelLatencyMs` came from timed Jev calls. */
  mocked?: boolean;
}

/** First model call, before the connection is warm. */
export const MOCK_COLD_MS = 700;
/** Later calls. Deterministic samples inside the warm band. */
export const MOCK_WARM_MS = [250, 330, 410, 490, 580, 290, 370, 450, 530, 310, 390, 470, 550] as const;

export function mockModelLatency(callIndex: number): number {
  if (callIndex <= 0) return MOCK_COLD_MS;
  return MOCK_WARM_MS[(callIndex - 1) % MOCK_WARM_MS.length] ?? MOCK_WARM_MS[0];
}

export function typesafeKeyFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return env.TYPESAFE_API_KEY?.trim() ?? '';
}

export interface PostMeasurement {
  id: string;
  local: boolean;
  action: 'show' | 'hide' | 'model';
  reason?: string;
  enqueueAtMs: number;
  verdictAtMs: number;
  viewAtMs: number;
  /** enqueue → verdict. Local decisions are 0. */
  verdictMs: number;
  /** How late the verdict is relative to the post entering the viewport. 0 if it was ready. */
  userDelayMs: number;
}

export interface PipelineMeasurement {
  posts: number;
  settledLocally: number;
  modelPosts: number;
  localShare: number;
  medianVerdictMs: number;
  medianModelVerdictMs: number | null;
  medianUserDelayMs: number;
  readyBeforeView: number;
  readyBeforeViewShare: number;
  maxConcurrent: number;
  /** Model post ids in the order a worker started them. */
  modelStartOrder: string[];
  localReasons: Record<string, number>;
  decisions: PostMeasurement[];
  mocked: boolean;
}

interface Scheduled extends SimPost {
  prefetchAt: number;
  viewAt: number;
}

interface Waiting extends Scheduled {
  enqueuedAt: number;
}

interface Running {
  post: Waiting;
  doneAt: number;
}

/**
 * Scrolls a fixture timeline at a constant speed and runs the real prefilter.
 * Posts that need a model wait on a priority queue with the production
 * concurrency cap. Model service time comes from {@link mockModelLatency} unless
 * the scenario supplies another.
 */
export function simulateTimeline(posts: SimPost[], scenario: SimScenario): PipelineMeasurement {
  const concurrency = scenario.concurrency ?? QUEUE_CONCURRENCY;
  let modelCalls = 0;
  const entries: Scheduled[] = posts
    .map((post) => ({
      ...post,
      prefetchAt: timeAtScroll(post.y - scenario.viewportHeight - scenario.prefetchMargin, scenario),
      viewAt: timeAtScroll(post.y - scenario.viewportHeight, scenario),
    }))
    .sort((a, b) => a.prefetchAt - b.prefetchAt || a.y - b.y);

  const pending: Waiting[] = [];
  const running: Running[] = [];
  const decisions: PostMeasurement[] = [];
  const modelStartOrder: string[] = [];
  let maxConcurrent = 0;
  let now = 0;
  let index = 0;
  const guard = posts.length * 20 + 50;

  for (let step = 0; step < guard && decisions.length < posts.length; step++) {
    const upcoming = entries[index];
    const nextEntry = upcoming ? upcoming.prefetchAt : Infinity;
    let nextDone = Infinity;
    for (const job of running) nextDone = Math.min(nextDone, job.doneAt);
    if (nextEntry === Infinity && nextDone === Infinity && pending.length === 0 && running.length === 0) {
      break;
    }
    const t = Math.min(nextEntry, nextDone);
    if (!Number.isFinite(t)) break;
    now = t;

    for (let i = running.length - 1; i >= 0; i--) {
      const job = running[i];
      if (!job || job.doneAt > now) continue;
      running.splice(i, 1);
      decisions.push(measurement(job.post, 'model', undefined, job.post.enqueuedAt, job.doneAt));
    }

    while (index < entries.length) {
      const post = entries[index];
      if (!post || post.prefetchAt > now) break;
      index++;
      const decision = prefilter(post, scenario.settings, scenario.scorer);
      if (decision.action === 'model') {
        pending.push({ ...post, enqueuedAt: now });
      } else {
        decisions.push(measurement(post, decision.action, decision.reason, now, now));
      }
    }

    pending.sort((a, b) => priorityAt(a, now, scenario) - priorityAt(b, now, scenario) || a.y - b.y);
    while (running.length < concurrency && pending.length > 0) {
      const next = pending.shift();
      if (!next) break;
      modelStartOrder.push(next.id);
      const latency = serviceMs(scenario, next, modelCalls);
      modelCalls += 1;
      running.push({ post: next, doneAt: now + latency });
      maxConcurrent = Math.max(maxConcurrent, running.length);
    }
  }

  if (decisions.length !== posts.length) {
    throw new Error(`simulation settled ${decisions.length} of ${posts.length} posts`);
  }

  const local = decisions.filter((d) => d.local);
  const model = decisions.filter((d) => !d.local);
  const ready = decisions.filter((d) => d.verdictAtMs <= d.viewAtMs + 1e-6);
  const localReasons: Record<string, number> = {};
  for (const decision of local) {
    const reason = decision.reason ?? 'local';
    localReasons[reason] = (localReasons[reason] ?? 0) + 1;
  }

  return {
    posts: posts.length,
    settledLocally: local.length,
    modelPosts: model.length,
    localShare: posts.length === 0 ? 0 : local.length / posts.length,
    medianVerdictMs: median(decisions.map((d) => d.verdictMs)),
    medianModelVerdictMs: model.length === 0 ? null : median(model.map((d) => d.verdictMs)),
    medianUserDelayMs: median(decisions.map((d) => d.userDelayMs)),
    readyBeforeView: ready.length,
    readyBeforeViewShare: posts.length === 0 ? 0 : ready.length / posts.length,
    maxConcurrent,
    modelStartOrder,
    localReasons,
    decisions,
    mocked: scenario.mocked !== false,
  };
}

function serviceMs(scenario: SimScenario, post: SimPost, callIndex: number): number {
  const spec = scenario.modelLatencyMs;
  if (typeof spec === 'function') return spec(post, callIndex);
  if (typeof spec === 'number') return spec;
  return mockModelLatency(callIndex);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const right = sorted[mid] ?? 0;
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? right) + right) / 2;
  return right;
}

function measurement(
  post: Scheduled,
  action: PostMeasurement['action'],
  reason: string | undefined,
  enqueueAt: number,
  verdictAt: number,
): PostMeasurement {
  const verdictMs = Math.max(0, verdictAt - enqueueAt);
  const userDelayMs = Math.max(0, verdictAt - post.viewAt);
  return {
    id: post.id,
    local: action !== 'model',
    action,
    reason,
    enqueueAtMs: enqueueAt,
    verdictAtMs: verdictAt,
    viewAtMs: post.viewAt,
    verdictMs,
    userDelayMs,
  };
}

function timeAtScroll(scrollY: number, scenario: SimScenario): number {
  if (scrollY <= 0 || scenario.scrollSpeedPxPerSec <= 0) return 0;
  return (scrollY / scenario.scrollSpeedPxPerSec) * 1000;
}

function priorityAt(post: SimPost, t: number, scenario: SimScenario): number {
  const scroll = (scenario.scrollSpeedPxPerSec * t) / 1000;
  const top = post.y - scroll;
  return distanceToViewport({ top, bottom: top + post.height }, scenario.viewportHeight);
}
