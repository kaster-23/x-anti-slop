import { describe, expect, test } from 'bun:test';
import { DEFAULT_SETTINGS } from './defaults';
import { simulateTimeline } from './pipeline-sim';
import { QUEUE_CONCURRENCY } from './request-queue';
import { measureRecordedTimeline } from './timeline-fixture';
import type { Settings } from './types';

function settings(): Settings {
  return { ...DEFAULT_SETTINGS, allowlist: [], blocklist: [] };
}

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
    expect(byId.get('promo-1')?.reason).toBe('Promoted');
    expect(byId.get('model-1')?.action).toBe('model');
    expect(byId.get('model-13')?.action).toBe('model');
    expect(byId.get('quote-1')?.action).toBe('model');
    expect(result.settledLocally).toBe(22);
    expect(result.modelPosts).toBe(14);
    expect(result.localShare).toBeCloseTo(22 / 36);
    // Local posts are the majority and settle in the same turn they are
    // prefetched, so the median across every post is 0. Model posts take the
    // mock round trip and, at this scroll speed, finish before they are seen.
    expect(result.medianVerdictMs).toBe(0);
    expect(result.medianModelVerdictMs).toBe(280);
    expect(result.medianUserDelayMs).toBe(0);
    expect(result.readyBeforeView).toBe(36);
    expect(result.maxConcurrent).toBe(2);
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
