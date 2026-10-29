import { describe, expect, test } from 'bun:test';
import { HIDE_UNTIL_CHECKED_FAILSAFE_MS, distanceToViewport, prefetchRootMargin } from './viewport';

describe('distanceToViewport', () => {
  const vh = 800;

  test('ranks the centre of the screen ahead of an edge, and both ahead of off-screen posts', () => {
    const center = distanceToViewport({ top: 350, bottom: 450 }, vh);
    const edge = distanceToViewport({ top: 0, bottom: 40 }, vh);
    const below = distanceToViewport({ top: 900, bottom: 1000 }, vh);
    const above = distanceToViewport({ top: -400, bottom: -100 }, vh);
    expect(center).toBeLessThan(edge);
    expect(edge).toBeLessThan(0);
    expect(below).toBe(100);
    expect(above).toBe(100);
    expect(center).toBeLessThan(below);
  });
});

describe('prefetchRootMargin', () => {
  test('extends one viewport above and below', () => {
    expect(prefetchRootMargin(800)).toBe('800px 0px 800px 0px');
    expect(prefetchRootMargin(800.6)).toBe('801px 0px 801px 0px');
    expect(prefetchRootMargin(-20)).toBe('0px 0px 0px 0px');
  });

  test('the hide-until-checked failsafe outlasts a short request', () => {
    expect(HIDE_UNTIL_CHECKED_FAILSAFE_MS).toBeGreaterThanOrEqual(8_000);
  });
});
