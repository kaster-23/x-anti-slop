import type { HideAnimation } from './card-style';

/** A handful of snaps at once. Anything past this hides in place. */
export const MAX_CONCURRENT_HIDES = 3;

/** One dust cloud stays inside this, even on a tall post. */
export const MAX_PARTICLES = 560;

export interface HideMotionInput {
  mode: HideAnimation;
  reducedMotion: boolean;
  /** Intersects the viewport. The prefetch margin does not count. */
  onScreen: boolean;
  /** The post was painted while its text was visible, not masked or already hidden. */
  seen: boolean;
  running: number;
}

export interface HideMotion {
  /** Run the selected effect, then collapse into the card. */
  animate: boolean;
  /** The particle disintegration. The blur effect is the other branch. */
  particles: boolean;
}

/**
 * A snap only plays for a verdict on a post the reader can already see.
 * Load, scroll-in, and reduced motion hide in place so nothing flashes.
 */
export function hideMotion(input: HideMotionInput): HideMotion {
  const allowed =
    input.mode !== 'off' &&
    !input.reducedMotion &&
    input.onScreen &&
    input.seen &&
    input.running < MAX_CONCURRENT_HIDES;
  return {
    animate: allowed,
    particles: allowed && input.mode === 'particles',
  };
}

export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

/** True when any pixel of the box sits in the viewport. */
export function isOnScreen(box: Box, viewport: { width: number; height: number }): boolean {
  if (box.width <= 0 || box.height <= 0) return false;
  if (viewport.width <= 0 || viewport.height <= 0) return false;
  return box.bottom > 0 && box.right > 0 && box.top < viewport.height && box.left < viewport.width;
}

/** How many dust specks a box gets. Empty and tiny boxes get none. */
export function particleBudget(width: number, height: number, cap = MAX_PARTICLES): number {
  if (width < 8 || height < 8 || cap <= 0) return 0;
  const target = Math.round((width * height) / 90);
  return Math.min(cap, Math.max(64, target));
}

/** 0 at the left edge and later toward the right, so the dust blows across. */
export function sweepDelay(x: number, width: number): number {
  if (!(width > 0)) return 0;
  const across = Math.min(1, Math.max(0, x / width));
  return across * 0.62;
}
