import { describe, expect, test } from 'bun:test';
import {
  HIDE_UNTIL_CHECKED_FAILSAFE_MS,
  PREFETCH_LEAD_MS,
  distanceToViewport,
  prefetchMarginPx,
  prefetchRootMargin,
} from './viewport';

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
  test('covers a cold call plus one warm p90 at one viewport per second', () => {
    expect(PREFETCH_LEAD_MS).toBe(200 + 128);
    expect(prefetchMarginPx(1000)).toBe(328);
    expect(prefetchRootMargin(1000)).toBe('328px 0px 328px 0px');
    expect(prefetchMarginPx(800.6)).toBe(263);
    expect(prefetchRootMargin(-20)).toBe('0px 0px 0px 0px');
  });

  test('the hide-until-checked failsafe outlasts a short request', () => {
    expect(HIDE_UNTIL_CHECKED_FAILSAFE_MS).toBeGreaterThanOrEqual(8_000);
  });
});
