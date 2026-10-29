import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_OVERLAY_PLACEMENT,
  OVERLAY_MARGIN,
  OVERLAY_RIGHT_RESERVE,
  clampOverlayPosition,
  defaultOverlayPosition,
  dragOverlayPosition,
  normalizeOverlayPlacement,
  placementAfterCollapse,
  placementAfterDrag,
  placementAfterReset,
  resolveOverlayPosition,
} from './overlay-place';

const PANEL = { width: 176, height: 140 };
const PILL = { width: 168, height: 32 };
const DESKTOP = { width: 1280, height: 800 };

describe('overlay position', () => {
  test('the default corner is the bottom-left, clear of the right-hand button column', () => {
    for (const width of [1024, 1280, 1440, 1920]) {
      const viewport = { width, height: 800 };
      for (const size of [PANEL, PILL]) {
        const point = defaultOverlayPosition(viewport, size);
        expect(point).toEqual({
          x: OVERLAY_MARGIN,
          y: viewport.height - size.height - OVERLAY_MARGIN,
        });
        expect(point.x + size.width).toBeLessThanOrEqual(width - OVERLAY_RIGHT_RESERVE);
        expect(point.y + size.height).toBeLessThanOrEqual(viewport.height);
      }
    }
  });

  test('clamps a drag to the viewport, including a panel taller than the screen', () => {
    expect(clampOverlayPosition({ x: -40, y: 9000 }, DESKTOP, PANEL)).toEqual({ x: 0, y: 660 });
    expect(clampOverlayPosition({ x: 2000, y: -5 }, DESKTOP, PANEL)).toEqual({
      x: DESKTOP.width - PANEL.width,
      y: 0,
    });
    expect(clampOverlayPosition({ x: 10, y: 10 }, { width: 100, height: 80 }, PANEL)).toEqual({
      x: 0,
      y: 0,
    });
    expect(dragOverlayPosition({ x: 16, y: 644 }, -100, 400, DESKTOP, PANEL)).toEqual({
      x: 0,
      y: 660,
    });
    expect(dragOverlayPosition({ x: 16, y: 20 }, Number.NaN, 8, DESKTOP, PANEL)).toEqual({
      x: 0,
      y: 28,
    });
  });

  test('a stored corner is what comes back, and a resize pulls it back on screen', () => {
    let placement = DEFAULT_OVERLAY_PLACEMENT;
    expect(resolveOverlayPosition(placement, DESKTOP, PANEL)).toEqual(
      defaultOverlayPosition(DESKTOP, PANEL),
    );

    const dragged = dragOverlayPosition(
      resolveOverlayPosition(placement, DESKTOP, PANEL),
      420,
      -180,
      DESKTOP,
      PANEL,
    );
    placement = placementAfterDrag(placement, dragged);
    expect(resolveOverlayPosition(placement, DESKTOP, PANEL)).toEqual(dragged);

    const phone = { width: 320, height: 480 };
    const clamped = resolveOverlayPosition(placement, phone, PANEL);
    expect(clamped).toEqual({
      x: phone.width - PANEL.width,
      y: phone.height - PANEL.height,
    });
    expect(clamped.x + PANEL.width).toBeLessThanOrEqual(phone.width);
    expect(clamped.y + PANEL.height).toBeLessThanOrEqual(phone.height);
  });

  test('reset forgets the corner and keeps the collapsed pill', () => {
    const parked = placementAfterCollapse(
      placementAfterDrag(DEFAULT_OVERLAY_PLACEMENT, { x: 400, y: 120 }),
      true,
    );
    const reset = placementAfterReset(parked);
    expect(reset).toEqual({ x: null, y: null, collapsed: true });
    expect(resolveOverlayPosition(reset, DESKTOP, PILL)).toEqual(defaultOverlayPosition(DESKTOP, PILL));
    expect(normalizeOverlayPlacement(reset)).toEqual(reset);
  });

  test('a partial or garbage stored value falls back to the default corner', () => {
    expect(normalizeOverlayPlacement(null)).toEqual(DEFAULT_OVERLAY_PLACEMENT);
    expect(normalizeOverlayPlacement({ x: 12, collapsed: true })).toEqual({
      x: null,
      y: null,
      collapsed: true,
    });
    expect(normalizeOverlayPlacement({ x: '12', y: 4, collapsed: 'yes' })).toEqual(
      DEFAULT_OVERLAY_PLACEMENT,
    );
    expect(normalizeOverlayPlacement({ x: Number.POSITIVE_INFINITY, y: 4 })).toEqual(
      DEFAULT_OVERLAY_PLACEMENT,
    );
    expect(normalizeOverlayPlacement({ x: 8, y: 9, collapsed: false, extra: true })).toEqual({
      x: 8,
      y: 9,
      collapsed: false,
    });
  });
});
