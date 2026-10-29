export interface VerticalRect {
  top: number;
  bottom: number;
}

/**
 * Distance from the viewport, in px. Smaller is closer, and in-view posts are
 * negative so they sort ahead of anything still off screen. Among posts already
 * on screen, the one nearer the vertical centre wins.
 */
export function distanceToViewport(rect: VerticalRect, viewportHeight: number): number {
  const height = Math.max(viewportHeight, 1);
  if (rect.bottom >= 0 && rect.top <= height) {
    const center = (rect.top + rect.bottom) / 2;
    return -height + Math.abs(center - height / 2);
  }
  if (rect.top > height) return rect.top - height;
  return -rect.bottom;
}

/** Live TypeSafe Jev: about 200ms cold, then 107ms median and 128ms p90 warm. */
export const JEV_COLD_MS = 200;
export const JEV_WARM_MEDIAN_MS = 107;
export const JEV_WARM_P90_MS = 128;

/**
 * How long before a post reaches the fold we want its verdict. One cold call,
 * plus one warm p90 in case that post waits on a busy worker.
 */
export const PREFETCH_LEAD_MS = JEV_COLD_MS + JEV_WARM_P90_MS;

/**
 * Pixels of lookahead for a brisk scroll of one viewport per second.
 * Pixel margins, because percentage rootMargins have been unreliable on the viewport.
 */
export function prefetchMarginPx(viewportHeight: number): number {
  const height = Math.max(0, viewportHeight);
  return Math.round((height * PREFETCH_LEAD_MS) / 1000);
}

export function prefetchRootMargin(viewportHeight: number): string {
  const px = prefetchMarginPx(viewportHeight);
  return `${px}px 0px ${px}px 0px`;
}

/**
 * Hide-until-checked unmasks on its own if the worker never answers. The worker
 * gives the slot 12s, so this sits just past that. A shorter failsafe would
 * show the post and then hide it when the late verdict arrived.
 */
export const HIDE_UNTIL_CHECKED_FAILSAFE_MS = 13_000;
