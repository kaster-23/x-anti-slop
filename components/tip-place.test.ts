import { describe, expect, test } from 'bun:test';
import { TIP_MAX_WIDTH, clampTipShift } from './tip-place';

describe('tooltip placement', () => {
  test('stays put when the bubble fits, and slides left when it would leave the viewport', () => {
    expect(TIP_MAX_WIDTH).toBe(320);
    expect(clampTipShift(40, 200, 1280)).toBe(0);
    expect(clampTipShift(1100, 320, 1280)).toBe(1280 - 8 - (1100 + 320));
    expect(clampTipShift(1100, 320, 1280)).toBeLessThan(0);
  });

  test('does not push the bubble off the left edge', () => {
    expect(clampTipShift(4, 400, 300)).toBe(4);
    expect(4 + clampTipShift(4, 400, 300)).toBe(8);
  });
});
