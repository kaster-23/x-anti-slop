/**
 * Local-share and time-to-verdict for the fixture timeline.
 *
 * Without TYPESAFE_API_KEY, Jev is mocked from live timings: 200ms cold, then
 * warm samples whose median is 107ms and whose p90 is 128ms. With a key, those
 * service times are
 * real TypeSafe round trips, then replayed on the same scroll.
 *
 *   pnpm measure
 *   TYPESAFE_API_KEY=… pnpm measure
 */
import { prefilter } from '../lib/prefilter';
import {
  REQUEST_TIMEOUT_MS,
  buildQuestions,
  buildState,
  callSystemOne,
  resolveModel,
} from '../lib/provider';
import { redactSecrets } from '../lib/redact';
import { QUEUE_CONCURRENCY, RequestQueue } from '../lib/request-queue';
import {
  mockModelLatency,
  simulateTimeline,
  typesafeKeyFromEnv,
  type SimPost,
} from '../lib/pipeline-sim';
import {
  FIXTURE_POSTS,
  FIXTURE_SCENARIO,
  FIXTURE_SETTINGS,
  layoutTimeline,
} from '../lib/timeline-fixture';
import type { Settings } from '../lib/types';

const posts = laidOut();
const apiKey = typesafeKeyFromEnv();

let latencies: Map<string, number> | null = null;
if (apiKey) {
  try {
    latencies = await timeLive(posts, apiKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(redactSecrets(message));
    process.exit(1);
  }
}
const result = simulateTimeline(posts, {
  ...FIXTURE_SCENARIO,
  settings: FIXTURE_SETTINGS,
  mocked: latencies === null,
  modelLatencyMs: latencies
    ? (post, callIndex) => latencies.get(post.id) ?? mockModelLatency(callIndex)
    : undefined,
});

const pct = (share: number) => `${(share * 100).toFixed(1)}%`;
const ms = (value: number | null) => (value === null ? 'n/a' : `${round(value)}ms`);

const reasons = Object.entries(result.localReasons)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([reason, count]) => `${reason}=${count}`)
  .join(', ');

console.log(`posts=${result.posts}`);
console.log(`settled_locally=${result.settledLocally}`);
console.log(`local_share=${pct(result.localShare)}`);
console.log(`model_posts=${result.modelPosts}`);
console.log(`median_verdict=${ms(result.medianVerdictMs)}`);
console.log(`median_model_verdict=${ms(result.medianModelVerdictMs)}`);
console.log(`median_user_delay=${ms(result.medianUserDelayMs)}`);
console.log(`ready_before_view=${result.readyBeforeView} (${pct(result.readyBeforeViewShare)})`);
console.log(`max_concurrent=${result.maxConcurrent}`);
console.log(`local_reasons=${reasons}`);
if (latencies) {
  const samples = [...latencies.values()].sort((a, b) => a - b);
  const cold = samples[0] ?? 0;
  console.log(
    `model=live provider=typesafe samples=${samples.length} fastest=${ms(cold)} slowest=${ms(samples[samples.length - 1] ?? null)} concurrency=${QUEUE_CONCURRENCY} timeout=${REQUEST_TIMEOUT_MS}ms`,
  );
} else {
  console.log(
    `model=mock cold=${mockModelLatency(0)}ms warm_median=107ms warm_p90=128ms concurrency=${QUEUE_CONCURRENCY} timeout=${REQUEST_TIMEOUT_MS}ms`,
  );
}
console.log(
  `scenario viewport=${FIXTURE_SCENARIO.viewportHeight}px margin=${FIXTURE_SCENARIO.prefetchMargin}px speed=${FIXTURE_SCENARIO.scrollSpeedPxPerSec}px/s`,
);

function laidOut(): SimPost[] {
  return layoutTimeline(FIXTURE_POSTS).map((post) => ({
    id: post.id,
    author: post.author,
    text: post.text,
    quotedText: post.quotedText,
    y: post.y,
    height: post.height,
    promoted: post.promoted,
    hasImage: post.hasImage,
    hasVideo: post.hasVideo,
    hasGif: post.hasGif,
  }));
}

/**
 * Times one cold call, then the remaining model posts. Durations are service
 * times; the scroll replay assigns them back onto the same posts.
 */
async function timeLive(timeline: SimPost[], key: string): Promise<Map<string, number>> {
  const settings: Settings = { ...FIXTURE_SETTINGS, provider: 'typesafe', typesafeApiKey: key };
  const modelPosts = timeline.filter((post) => prefilter(post, settings).action === 'model');
  const questions = buildQuestions(settings);
  const model = resolveModel(settings);
  const durations = new Map<string, number>();

  // The first post in scroll order is issued alone so the sample is cold.
  // The rest run at the worker's concurrency, which is the warm regime.
  const [cold, ...warm] = modelPosts;
  if (!cold) return durations;
  durations.set(cold.id, await timeOne(cold));

  const queue = new RequestQueue<number>({ concurrency: QUEUE_CONCURRENCY });
  const outcomes = await Promise.all(
    warm.map((post, index) =>
      queue.enqueue({
        id: post.id,
        priority: index,
        run: async () => {
          const elapsed = await timeOne(post);
          durations.set(post.id, elapsed);
          return elapsed;
        },
      }),
    ),
  );
  const failed = outcomes.find((outcome) => !outcome.ok);
  if (failed && !failed.ok) throw new Error(failed.error);

  return durations;

  async function timeOne(post: SimPost): Promise<number> {
    const started = performance.now();
    try {
      await callSystemOne({
        provider: 'typesafe',
        apiKey: key,
        model,
        state: buildState(post),
        questions,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Jev call failed for ${post.id}: ${redactSecrets(message)}`, { cause: err });
    }
    return performance.now() - started;
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
