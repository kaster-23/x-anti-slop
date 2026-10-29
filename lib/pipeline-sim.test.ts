import { describe, expect, test } from 'bun:test';
import { DEFAULT_SETTINGS } from './defaults';
import { MOCK_WARM_MS, mockModelLatency, simulateTimeline, typesafeKeyFromEnv } from './pipeline-sim';
import { QUEUE_CONCURRENCY } from './request-queue';
import { measureRecordedTimeline } from './timeline-fixture';
import type { Settings } from './types';

function settings(): Settings {
  return { ...DEFAULT_SETTINGS, allowlist: [], blocklist: [] };
}

describe('mock model latency', () => {
  test('uses a 200ms cold call, then warm samples with median 107 and p90 128', () => {
    expect(mockModelLatency(0)).toBe(200);
    const sorted = [...MOCK_WARM_MS].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    expect(sorted[mid]).toBe(107);
    const rank = Math.ceil(0.9 * sorted.length);
    expect(sorted[rank - 1]).toBe(128);
    const warm: readonly number[] = MOCK_WARM_MS;
    for (let call = 1; call < 20; call++) {
      expect(warm).toContain(mockModelLatency(call));
    }
  });

  test('reads a TypeSafe key from the environment and ignores blanks', () => {
    expect(typesafeKeyFromEnv({})).toBe('');
    expect(typesafeKeyFromEnv({ TYPESAFE_API_KEY: '   ' })).toBe('');
    expect(typesafeKeyFromEnv({ TYPESAFE_API_KEY: ' apikey_test ' })).toBe('apikey_test');
  });
});

describe('simulateTimeline', () => {
  test('starts the closer model post first when both are already inside the margin', () => {
    const text = 'one two three four five six words';
    const result = simulateTimeline(
      [
        { id: 'far', author: '@a', text, y: 5_000, height: 100 },
        { id: 'near', author: '@b', text, y: 0, height: 100 },
      ],
      {
        viewportHeight: 800,
        prefetchMargin: 10_000,
        scrollSpeedPxPerSec: 1_000,
        modelLatencyMs: 50,
        concurrency: 1,
        settings: settings(),
      },
    );
    expect(result.modelStartOrder).toEqual(['near', 'far']);
    expect(result.maxConcurrent).toBe(1);
    expect(result.mocked).toBe(true);
  });

  test('keeps at most four model calls in flight', () => {
    const text = 'one two three four five six words';
    const posts = Array.from({ length: 10 }, (_, i) => ({
      id: `p-${i}`,
      author: '@a',
      text,
      y: i * 10,
      height: 8,
    }));
    const result = simulateTimeline(posts, {
      viewportHeight: 800,
      prefetchMargin: 10_000,
      scrollSpeedPxPerSec: 5_000,
      modelLatencyMs: 100,
      settings: settings(),
    });
    expect(result.maxConcurrent).toBe(QUEUE_CONCURRENCY);
    expect(result.maxConcurrent).toBeLessThanOrEqual(4);
    expect(result.modelPosts).toBe(10);
  });
});

describe('recorded fixture timeline', () => {
  const result = measureRecordedTimeline();
  const byId = new Map(result.decisions.map((d) => [d.id, d]));

  test('settles the scripted local cases and sends the rest to the mock model', () => {
    expect(result.posts).toBe(36);
    expect(result.settledLocally + result.modelPosts).toBe(result.posts);
    expect(byId.get('short-1')?.reason).toBe('Short post');
    expect(byId.get('allow-1')?.reason).toBe('Allowlisted');
    expect(byId.get('allow-2')?.reason).toBe('Allowlisted');
    expect(byId.get('block-1')?.reason).toBe('Blocked account');
    expect(byId.get('hash-1')?.reason).toMatch(/Hashtag spam/);
    expect(byId.get('emoji-1')?.reason).toMatch(/Emoji spam/);
    expect(byId.get('shout-1')?.reason).toBe('Shouting');
    expect(byId.get('links-1')?.reason).toMatch(/Link dump/);
    expect(byId.get('promo-1')?.action).toBe('model');
    expect(byId.get('model-1')?.action).toBe('model');
    expect(byId.get('model-13')?.action).toBe('model');
    expect(byId.get('quote-1')?.action).toBe('model');
    expect(result.settledLocally).toBe(20);
    expect(result.modelPosts).toBe(16);
    expect(result.localShare).toBeCloseTo(20 / 36);
    expect(result.mocked).toBe(true);
    const firstModel = result.modelStartOrder[0];
    expect(byId.get(firstModel ?? '')?.verdictMs).toBe(200);
    expect(result.medianVerdictMs).toBe(0);
    expect(result.medianModelVerdictMs).toBeCloseTo(107, 0);
    expect(result.medianUserDelayMs).toBe(0);
    expect(result.readyBeforeView).toBe(36);
    expect(result.maxConcurrent).toBe(1);
    for (const decision of result.decisions) {
      if (!decision.local) expect(decision.verdictMs).toBeGreaterThan(0);
    }
  });

  test('local decisions are instant and the queue stays inside the cap', () => {
    for (const decision of result.decisions) {
      if (decision.local) expect(decision.verdictMs).toBe(0);
    }
    expect(result.maxConcurrent).toBeLessThanOrEqual(QUEUE_CONCURRENCY);
    expect(result.medianVerdictMs).toBeGreaterThanOrEqual(0);
    expect(result.medianUserDelayMs).toBeGreaterThanOrEqual(0);
    expect(result.readyBeforeView).toBeLessThanOrEqual(result.posts);
  });
});
