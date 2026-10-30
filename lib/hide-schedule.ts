/**
 * When a visible post may play its hide effect.
 *
 * Particles and blur start only while 50–60% of the post is in view and that
 * has stayed for about 750ms. Leaving the band early cancels the wait, and the
 * next visit starts it over. A post already well above the viewport hides with
 * no effect. Reduced motion hides immediately. The caller collapses the cell
 * height after the effect finishes, not before.
 */

export const HIDE_RATIO_MIN = 0.5;
export const HIDE_RATIO_MAX = 0.6;
export const HIDE_DWELL_MS = 750;
/** Whole post this far above the viewport: the reader already passed it. */
export const HIDE_ABOVE_PX = 64;

export interface HideFrame {
  top: number;
  bottom: number;
  height: number;
  viewportHeight: number;
}

export type HideScheduleAction = 'wait' | 'play' | 'instant';

export interface HideSchedule {
  action: HideScheduleAction;
  /** Set while the post is inside the band and the dwell has not finished. */
  armedAt: number | null;
}

/** Share of the post's box that sits inside the viewport. */
export function visibleFraction(frame: HideFrame): number {
  if (!(frame.height > 0) || !(frame.viewportHeight > 0)) return 0;
  const top = Math.max(frame.top, 0);
  const bottom = Math.min(frame.bottom, frame.viewportHeight);
  return Math.min(1, Math.max(0, bottom - top) / frame.height);
}

export function inHideBand(fraction: number): boolean {
  return fraction >= HIDE_RATIO_MIN && fraction <= HIDE_RATIO_MAX + 1e-6;
}

export function passedAbove(frame: HideFrame): boolean {
  return frame.height > 0 && frame.bottom <= -HIDE_ABOVE_PX;
}

export function stepHideSchedule(input: {
  armedAt: number | null;
  now: number;
  frame: HideFrame;
  reducedMotion: boolean;
}): HideSchedule {
  if (input.reducedMotion || passedAbove(input.frame)) {
    return { action: 'instant', armedAt: null };
  }
  if (!inHideBand(visibleFraction(input.frame))) {
    return { action: 'wait', armedAt: null };
  }
  const armedAt = input.armedAt ?? input.now;
  if (input.now - armedAt >= HIDE_DWELL_MS) return { action: 'play', armedAt: null };
  return { action: 'wait', armedAt };
}
