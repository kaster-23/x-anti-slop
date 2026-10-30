import { describe, expect, test } from 'bun:test';
import {
  HIDE_DWELL_MS,
  inHideBand,
  passedAbove,
  stepHideSchedule,
  visibleFraction,
  type HideFrame,
} from './hide-schedule';

const view = 800;

function frame(top: number, height = 200): HideFrame {
  return { top, bottom: top + height, height, viewportHeight: view };
}

describe('hide effect scheduler', () => {
  test('the band is half to three fifths of the post, and above the viewport is already passed', () => {
    expect(visibleFraction(frame(0, 200))).toBe(1);
    expect(visibleFraction(frame(700, 200))).toBeCloseTo(0.5);
    expect(visibleFraction(frame(680, 200))).toBeCloseTo(0.6);
    expect(inHideBand(0.49)).toBe(false);
    expect(inHideBand(0.5)).toBe(true);
    expect(inHideBand(0.6)).toBe(true);
    expect(inHideBand(0.61)).toBe(false);
    expect(passedAbove(frame(-300, 200))).toBe(true);
    expect(passedAbove(frame(-20, 200))).toBe(false);
  });

  test('plays only after the post has stayed in the band for about 750ms', () => {
    const band = frame(700, 200);
    const armed = stepHideSchedule({ armedAt: null, now: 1_000, frame: band, reducedMotion: false });
    expect(armed).toEqual({ action: 'wait', armedAt: 1_000 });
    const early = stepHideSchedule({
      armedAt: armed.armedAt,
      now: 1_000 + HIDE_DWELL_MS - 1,
      frame: band,
      reducedMotion: false,
    });
    expect(early.action).toBe('wait');
    expect(early.armedAt).toBe(1_000);
    const ready = stepHideSchedule({
      armedAt: early.armedAt,
      now: 1_000 + HIDE_DWELL_MS,
      frame: band,
      reducedMotion: false,
    });
    expect(ready.action).toBe('play');
  });

  test('leaving the band early cancels the wait, and the next visit starts over', () => {
    const band = frame(700, 200);
    const armed = stepHideSchedule({ armedAt: null, now: 0, frame: band, reducedMotion: false });
    const left = stepHideSchedule({
      armedAt: armed.armedAt,
      now: 400,
      frame: frame(0, 200),
      reducedMotion: false,
    });
    expect(left).toEqual({ action: 'wait', armedAt: null });
    const again = stepHideSchedule({ armedAt: left.armedAt, now: 900, frame: band, reducedMotion: false });
    expect(again).toEqual({ action: 'wait', armedAt: 900 });
    const tooSoon = stepHideSchedule({
      armedAt: again.armedAt,
      now: 900 + HIDE_DWELL_MS - 1,
      frame: band,
      reducedMotion: false,
    });
    expect(tooSoon.action).toBe('wait');
  });

  test('hides instantly once the post is well above the viewport, and for reduced motion', () => {
    const above = stepHideSchedule({
      armedAt: 0,
      now: 200,
      frame: frame(-400, 200),
      reducedMotion: false,
    });
    expect(above.action).toBe('instant');
    const reduced = stepHideSchedule({
      armedAt: null,
      now: 0,
      frame: frame(700, 200),
      reducedMotion: true,
    });
    expect(reduced.action).toBe('instant');
  });
});
