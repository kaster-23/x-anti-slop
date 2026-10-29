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

/**
 * IntersectionObserver rootMargin that reaches about one viewport above and
 * below the screen. Pixel values, because percentage margins have been unreliable
 * against the viewport root.
 */
export function prefetchRootMargin(viewportHeight: number): string {
  const px = Math.max(0, Math.round(viewportHeight));
  return `${px}px 0px ${px}px 0px`;
}

/**
 * Hide-until-checked unmasks on its own if the worker never answers. This covers
 * three timed-out attempts plus the capped gaps between them.
 */
export const HIDE_UNTIL_CHECKED_FAILSAFE_MS = 8_000;
