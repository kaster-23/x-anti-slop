import { formatCost } from '@/lib/provider';
import { reportContentFailure, runContentTask } from '@/lib/extension-context';
import {
  DEFAULT_OVERLAY_PLACEMENT,
  dragOverlayPosition,
  normalizeOverlayPlacement,
  placementAfterCollapse,
  placementAfterDrag,
  placementAfterReset,
  resolveOverlayPosition,
  type OverlayPlacement,
  type OverlayPoint,
  type OverlaySize,
  type Viewport,
} from '@/lib/overlay-place';

export interface MeterCounts {
  checked: number;
  hidden: number;
  settledLocally: number;
  cost: number;
}

export interface Meter {
  update(counts: MeterCounts): void;
  setVisible(visible: boolean): void;
  remove(): void;
}

export interface MeterHooks {
  /** False once this content script's extension context is dead. */
  alive: () => boolean;
  loadPlacement: () => Promise<unknown>;
  savePlacement: (placement: OverlayPlacement) => Promise<unknown>;
  watchPlacement: (onChange: (value: unknown) => void) => () => void;
}

/** Movement below this is a click, not a drag, so a double-click can still reset. */
const DRAG_THRESHOLD_PX = 4;

/**
 * Small fixed panel for the timeline currently open. Counts are for this page,
 * not the lifetime totals in the popup. The header drags; the button collapses.
 */
export function mountMeter(doc: Document, hooks: MeterHooks): Meter {
  const view = doc.defaultView;
  const root = doc.createElement('div');
  root.className = 'ct-meter';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-label', 'X-AntiSlop counts for this timeline');

  const header = doc.createElement('div');
  header.className = 'ct-meter-header';
  header.title = 'Drag to move. Double-click to reset position.';

  const brand = doc.createElement('div');
  brand.className = 'ct-meter-brand';
  const title = doc.createElement('span');
  title.className = 'ct-meter-title';
  title.textContent = 'X-AntiSlop';
  const count = doc.createElement('span');
  count.className = 'ct-meter-count';
  count.hidden = true;
  count.textContent = '0';
  brand.append(title, count);

  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ct-meter-toggle';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-controls', 'ct-meter-details');
  toggle.setAttribute('aria-label', 'Collapse timeline counts');
  toggle.textContent = '\u2212';

  header.append(brand, toggle);

  const body = doc.createElement('div');
  body.className = 'ct-meter-body';
  body.id = 'ct-meter-details';
  const checked = addRow(doc, body, 'Checked');
  const hidden = addRow(doc, body, 'Hidden');
  const local = addRow(doc, body, 'Settled locally');
  const cost = addRow(doc, body, 'Est. cost');
  // Zero cost is blank, same as after the first update. Don't flash a 0.
  cost.textContent = '';
  if (cost.parentElement) cost.parentElement.hidden = true;

  root.append(header, body);
  // On body, so color inherits X's page text instead of the OS canvas color.
  (doc.body ?? doc.documentElement).append(root);

  let placement: OverlayPlacement = { ...DEFAULT_OVERLAY_PLACEMENT };
  let latest: MeterCounts = { checked: 0, hidden: 0, settledLocally: 0, cost: 0 };
  let unwatch = () => {};
  let revision = 0;
  let drag: {
    pointerId: number;
    origin: OverlayPoint;
    clientX: number;
    clientY: number;
    moved: boolean;
  } | null = null;
  /**
   * A long drag can still emit a dblclick when the press was the second click.
   * Ignore only that immediate event. A later double-click is a reset.
   */
  let ignoreResetUntil = 0;

  const readViewport = (): Viewport => ({
    width: view?.innerWidth ?? 0,
    height: view?.innerHeight ?? 0,
  });

  const measure = (): OverlaySize => {
    const rect = root.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return { width: rect.width, height: rect.height };
    // Hidden, or not laid out yet. The CSS width is 176; the height is the rows or the pill.
    return placement.collapsed ? { width: 168, height: 32 } : { width: 176, height: 118 };
  };

  const place = (point: OverlayPoint) => {
    root.style.left = `${Math.round(point.x)}px`;
    root.style.top = `${Math.round(point.y)}px`;
    // `bottom` is only the stylesheet default. Leaving it set stretches the panel.
    root.style.bottom = 'auto';
    root.style.right = 'auto';
  };

  const paint = (rememberClamp = false) => {
    const point = resolveOverlayPosition(placement, readViewport(), measure());
    place(point);
    if (!rememberClamp || placement.x === null || placement.y === null) return;
    const rounded = { x: Math.round(point.x), y: Math.round(point.y) };
    if (rounded.x === placement.x && rounded.y === placement.y) return;
    placement = placementAfterDrag(placement, rounded);
    persist(placement);
  };

  const render = () => {
    const collapsed = placement.collapsed;
    root.classList.toggle('is-collapsed', collapsed);
    body.hidden = collapsed;
    count.textContent = latest.hidden.toLocaleString();
    count.hidden = !collapsed || latest.hidden <= 0;
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.setAttribute('aria-label', collapsed ? 'Expand timeline counts' : 'Collapse timeline counts');
    toggle.textContent = collapsed ? '+' : '\u2212';
    paint(false);
  };

  const persist = (next: OverlayPlacement) => {
    const snapshot = next;
    void runContentTask(hooks.alive(), () => hooks.savePlacement(snapshot), 'could not save overlay position');
  };

  const commit = (next: OverlayPlacement) => {
    placement = next;
    render();
    persist(placement);
  };

  const showStored = (value: unknown) => {
    if (!hooks.alive()) return;
    placement = normalizeOverlayPlacement(value);
    render();
  };

  const onResize = () => {
    if (drag) return;
    paint(true);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.clientX;
    const dy = event.clientY - drag.clientY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    root.classList.add('is-dragging');
    const next = dragOverlayPosition(drag.origin, dx, dy, readViewport(), measure());
    const rounded = { x: Math.round(next.x), y: Math.round(next.y) };
    placement = placementAfterDrag(placement, rounded);
    place(rounded);
    event.preventDefault();
  };

  const endDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved = drag.moved;
    drag = null;
    root.classList.remove('is-dragging');
    view?.removeEventListener('pointermove', onPointerMove);
    view?.removeEventListener('pointerup', endDrag);
    view?.removeEventListener('pointercancel', endDrag);
    if (typeof header.releasePointerCapture === 'function' && header.hasPointerCapture?.(event.pointerId)) {
      try {
        header.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    }
    if (!moved) return;
    ignoreResetUntil = Date.now() + 50;
    // The move already clamped the corner. Save that, not the pre-drag default.
    persist(placement);
  };

  header.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || isButtonTarget(event.target)) return;
    if (!view) return;
    event.preventDefault();
    event.stopPropagation();
    const origin = resolveOverlayPosition(placement, readViewport(), measure());
    drag = {
      pointerId: event.pointerId,
      origin: { x: Math.round(origin.x), y: Math.round(origin.y) },
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false,
    };
    if (typeof header.setPointerCapture === 'function') {
      try {
        header.setPointerCapture(event.pointerId);
      } catch {
        /* window listeners follow the pointer when capture is unavailable */
      }
    }
    view.addEventListener('pointermove', onPointerMove, { passive: false });
    view.addEventListener('pointerup', endDrag);
    view.addEventListener('pointercancel', endDrag);
  });

  header.addEventListener('dblclick', (event) => {
    if (Date.now() < ignoreResetUntil) return;
    if (isButtonTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    commit(placementAfterReset(placement));
  });

  toggle.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    commit(placementAfterCollapse(placement, !placement.collapsed));
  });

  // X listens on the document for presses inside the timeline. Keep them here.
  root.addEventListener('pointerdown', (event) => event.stopPropagation());
  root.addEventListener('click', (event) => event.stopPropagation());
  root.addEventListener('dblclick', (event) => event.stopPropagation());

  render();

  if (view) {
    view.addEventListener('resize', onResize);
    view.visualViewport?.addEventListener('resize', onResize);
  }

  if (hooks.alive()) {
    try {
      unwatch = hooks.watchPlacement((value) => {
        try {
          revision += 1;
          if (drag) return;
          showStored(value);
        } catch (err) {
          reportContentFailure('could not apply overlay position', err, hooks.alive());
        }
      });
    } catch (err) {
      reportContentFailure('could not watch overlay position', err, hooks.alive());
    }
  }

  const loadRevision = revision;
  void runContentTask(
    hooks.alive(),
    async () => {
      const value = await hooks.loadPlacement();
      if (!hooks.alive() || revision !== loadRevision) return;
      showStored(value);
    },
    'could not load overlay position',
  );

  return {
    update(counts) {
      latest = counts;
      checked.textContent = counts.checked.toLocaleString();
      hidden.textContent = counts.hidden.toLocaleString();
      local.textContent = counts.settledLocally.toLocaleString();
      const costLabel = formatCost(counts.cost);
      cost.textContent = costLabel;
      if (cost.parentElement) cost.parentElement.hidden = costLabel === '';
      count.textContent = counts.hidden.toLocaleString();
      count.hidden = !placement.collapsed || counts.hidden <= 0;
    },
    setVisible(visible) {
      root.hidden = !visible;
      if (visible) paint(false);
    },
    remove() {
      view?.removeEventListener('resize', onResize);
      view?.visualViewport?.removeEventListener('resize', onResize);
      view?.removeEventListener('pointermove', onPointerMove);
      view?.removeEventListener('pointerup', endDrag);
      view?.removeEventListener('pointercancel', endDrag);
      drag = null;
      try {
        unwatch();
      } catch (err) {
        reportContentFailure('could not stop overlay watch', err, hooks.alive());
      }
      root.remove();
    },
  };
}

function addRow(doc: Document, parent: HTMLElement, label: string): HTMLElement {
  const row = doc.createElement('div');
  row.className = 'ct-meter-row';
  const name = doc.createElement('span');
  name.textContent = label;
  const value = doc.createElement('b');
  value.textContent = '0';
  row.append(name, value);
  parent.append(row);
  return value;
}

/** Realm-safe: content-script `instanceof Element` is not reliable for every target. */
function isButtonTarget(target: EventTarget | null): boolean {
  let node: unknown = target;
  if (node && typeof node === 'object' && !('closest' in node) && 'parentElement' in node) {
    node = (node as { parentElement: unknown }).parentElement;
  }
  if (!node || typeof node !== 'object' || !('closest' in node)) return false;
  const closest = (node as { closest?: unknown }).closest;
  if (typeof closest !== 'function') return false;
  return closest.call(node, 'button') != null;
}
