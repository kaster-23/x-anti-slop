/**
 * Local-share and time-to-verdict for the fixture timeline.
 *
 * Jev is mocked: there is no API key in this environment, and the model leg is
 * a fixed latency through the same concurrency cap the worker uses. Re-run
 * with `pnpm measure` after changing the prefilter or the queue.
 */
import { QUEUE_CONCURRENCY } from '../lib/request-queue';
import { REQUEST_TIMEOUT_MS } from '../lib/provider';
import {
  FIXTURE_SCENARIO,
  measureRecordedTimeline,
} from '../lib/timeline-fixture';

const result = measureRecordedTimeline();
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
console.log(
  `model=mock latency=${FIXTURE_SCENARIO.modelLatencyMs}ms concurrency=${QUEUE_CONCURRENCY} timeout=${REQUEST_TIMEOUT_MS}ms`,
);
console.log(
  `scenario viewport=${FIXTURE_SCENARIO.viewportHeight}px margin=${FIXTURE_SCENARIO.prefetchMargin}px speed=${FIXTURE_SCENARIO.scrollSpeedPxPerSec}px/s`,
);

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
