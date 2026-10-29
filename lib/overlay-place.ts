/** Inset from the viewport edges for the default spot. */
export const OVERLAY_MARGIN = 16;

/**
 * Column at the bottom-right kept clear of the default spot. X floats the
 * Grok and Messages buttons there; a panel parked on the bottom-left stays
 * to the left of this strip on desktop widths.
 */
export const OVERLAY_RIGHT_RESERVE = 104;

export interface OverlayPoint {
  x: number;
  y: number;
}

export interface OverlaySize {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/**
 * `x` and `y` are the panel's top-left in viewport pixels. Null means the
 * default corner, so a resize keeps it on the bottom-left instead of pinning
 * the first pixel it happened to occupy. `collapsed` is the header-only pill.
 */
export interface OverlayPlacement {
  x: number | null;
  y: number | null;
  collapsed: boolean;
}

export const DEFAULT_OVERLAY_PLACEMENT: OverlayPlacement = {
  x: null,
  y: null,
  collapsed: false,
};

export function defaultOverlayPosition(viewport: Viewport, size: OverlaySize): OverlayPoint {
  return clampOverlayPosition(
    {
      x: OVERLAY_MARGIN,
      y: viewport.height - size.height - OVERLAY_MARGIN,
    },
    viewport,
    size,
  );
}

/** Keeps the whole panel inside the viewport. A panel larger than the screen pins to the origin. */
export function clampOverlayPosition(
  point: OverlayPoint,
  viewport: Viewport,
  size: OverlaySize,
): OverlayPoint {
  const maxX = Math.max(0, viewport.width - Math.max(0, size.width));
  const maxY = Math.max(0, viewport.height - Math.max(0, size.height));
  return { x: clamp(point.x, 0, maxX), y: clamp(point.y, 0, maxY) };
}

export function dragOverlayPosition(
  start: OverlayPoint,
  dx: number,
  dy: number,
  viewport: Viewport,
  size: OverlaySize,
): OverlayPoint {
  return clampOverlayPosition({ x: start.x + dx, y: start.y + dy }, viewport, size);
}

/** Stored coordinates are used as-is once both exist. Otherwise the panel sits in the default corner. */
export function resolveOverlayPosition(
  placement: OverlayPlacement,
  viewport: Viewport,
  size: OverlaySize,
): OverlayPoint {
  if (placement.x === null || placement.y === null) return defaultOverlayPosition(viewport, size);
  return clampOverlayPosition({ x: placement.x, y: placement.y }, viewport, size);
}

export function placementAfterDrag(current: OverlayPlacement, point: OverlayPoint): OverlayPlacement {
  return { ...current, x: point.x, y: point.y };
}

/** Forgets a custom corner and leaves the collapsed pill as it was. */
export function placementAfterReset(current: OverlayPlacement): OverlayPlacement {
  return { ...current, x: null, y: null };
}

export function placementAfterCollapse(current: OverlayPlacement, collapsed: boolean): OverlayPlacement {
  return { ...current, collapsed };
}

/** Storage can hold an older or partial value. A single coordinate is not a position. */
export function normalizeOverlayPlacement(raw: unknown): OverlayPlacement {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_OVERLAY_PLACEMENT };
  const record = raw as Record<string, unknown>;
  const x = finiteOrNull(record.x);
  const y = finiteOrNull(record.y);
  const placed = x !== null && y !== null;
  return {
    x: placed ? x : null,
    y: placed ? y : null,
    collapsed: record.collapsed === true,
  };
}

function finiteOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}
