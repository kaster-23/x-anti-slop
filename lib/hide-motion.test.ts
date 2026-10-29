import { describe, expect, test } from 'bun:test';
import { coerceSettings } from './coerce-settings';
import { DEFAULT_CARD_APPEARANCE, normalizeHideAnimation } from './card-style';
import {
  MAX_CONCURRENT_HIDES,
  MAX_PARTICLES,
  hideMotion,
  isOnScreen,
  particleBudget,
  sweepDelay,
} from './hide-motion';

const view = { width: 1280, height: 800 };
const visible = { animate: true, particles: true };
const still = { animate: false, particles: false };

function box(top: number, height = 120, left = 200, width = 500) {
  return { top, bottom: top + height, left, right: left + width, width, height };
}

describe('hide animation', () => {
  test('plays particles only for a seen post that is on screen', () => {
    expect(
      hideMotion({
        mode: 'particles',
        reducedMotion: false,
        onScreen: true,
        seen: true,
        running: 0,
      }),
    ).toEqual(visible);
    expect(
      hideMotion({
        mode: 'blur',
        reducedMotion: false,
        onScreen: true,
        seen: true,
        running: 0,
      }),
    ).toEqual({ animate: true, particles: false });
  });

  test('skips reduced motion, off, offscreen, unseen, and a full animation queue', () => {
    const base = { mode: 'particles' as const, reducedMotion: false, onScreen: true, seen: true, running: 0 };
    expect(hideMotion({ ...base, reducedMotion: true })).toEqual(still);
    expect(hideMotion({ ...base, mode: 'off' })).toEqual(still);
    expect(hideMotion({ ...base, onScreen: false })).toEqual(still);
    expect(hideMotion({ ...base, seen: false })).toEqual(still);
    expect(hideMotion({ ...base, running: MAX_CONCURRENT_HIDES })).toEqual(still);
    expect(hideMotion({ ...base, running: MAX_CONCURRENT_HIDES - 1 })).toEqual(visible);
  });

  test('offscreen means outside the viewport, including a box that only touches the edge', () => {
    expect(isOnScreen(box(100), view)).toBe(true);
    expect(isOnScreen(box(-40, 80), view)).toBe(true);
    expect(isOnScreen(box(900), view)).toBe(false);
    expect(isOnScreen(box(-120, 120), view)).toBe(false);
    expect(isOnScreen(box(100, 0), view)).toBe(false);
  });

  test('particle counts stay inside the cap', () => {
    expect(particleBudget(0, 400)).toBe(0);
    expect(particleBudget(400, 200)).toBe(MAX_PARTICLES);
    expect(particleBudget(900, 2000)).toBe(MAX_PARTICLES);
    expect(particleBudget(40, 40)).toBe(64);
  });

  test('the sweep starts at the left edge and reaches the right edge later', () => {
    expect(sweepDelay(0, 400)).toBe(0);
    expect(sweepDelay(400, 400)).toBeCloseTo(0.62);
    expect(sweepDelay(100, 400)).toBeLessThan(sweepDelay(300, 400));
  });

  test('an older save gets particles, and a bad value is rejected', () => {
    expect(normalizeHideAnimation(undefined)).toBe('particles');
    expect(normalizeHideAnimation('blur')).toBe('blur');
    expect(normalizeHideAnimation('off')).toBe('off');
    expect(normalizeHideAnimation('snap')).toBe('particles');
    expect(coerceSettings({}).cards.hideAnimation).toBe('particles');
    expect(coerceSettings({ cards: { hideAnimation: 'off' } }).cards.hideAnimation).toBe('off');
    expect(coerceSettings({ cards: { hideAnimation: 'blur' } }).cards.colorCoding).toBe(
      DEFAULT_CARD_APPEARANCE.colorCoding,
    );
  });
});
