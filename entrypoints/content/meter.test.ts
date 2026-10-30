import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { mountMeter, type MeterHooks } from './meter';
import type { OverlayPlacement } from '../../lib/overlay-place';

function desktop(): Window {
  return new Window({ width: 1280, height: 800 });
}

interface PanelNode {
  style: { left: string; top: string };
  classList: { contains(token: string): boolean };
  hidden: boolean;
  textContent: string | null;
  getAttribute(name: string): string | null;
  click(): void;
  dispatchEvent(event: object): boolean;
  getBoundingClientRect(): { width: number; height: number };
  querySelector(selector: string): PanelNode | null;
}

function node(win: Window, selector: string): PanelNode {
  const found = win.document.querySelector(selector);
  if (!found) throw new Error(`missing ${selector}`);
  return found as unknown as PanelNode;
}

function pointOf(root: PanelNode): { x: number; y: number } {
  return {
    x: Number.parseFloat(root.style.left),
    y: Number.parseFloat(root.style.top),
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function hooks(partial: Partial<MeterHooks> & { saved?: OverlayPlacement[] } = {}): MeterHooks & {
  saved: OverlayPlacement[];
} {
  const saved = partial.saved ?? [];
  return {
    saved,
    alive: partial.alive ?? (() => true),
    loadPlacement: partial.loadPlacement ?? (async () => ({ x: null, y: null, collapsed: false })),
    savePlacement:
      partial.savePlacement ??
      (async (placement) => {
        saved.push(placement);
      }),
    watchPlacement: partial.watchPlacement ?? (() => () => {}),
  };
}

function silenceWarn(): { logs: unknown[][]; restore: () => void } {
  const logs: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    logs.push(args);
  };
  return { logs, restore: () => (console.warn = original) };
}

describe('timeline overlay', () => {
  test('restores a stored corner and the collapsed pill', async () => {
    const win = desktop();
    const meter = mountMeter(win.document as unknown as Document, {
      ...hooks(),
      loadPlacement: async () => ({ x: 360, y: 48, collapsed: true }),
    });
    await flush();
    const root = node(win, '.ct-meter');
    const toggle = node(win, 'button.ct-meter-toggle');
    expect(root.classList.contains('is-collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('ct-meter-details');
    expect(root.querySelector('.ct-meter-title')?.textContent).toBe('X-AntiSlop');
    expect(root.querySelector('.ct-meter-count')?.hidden).toBe(true);
    expect(pointOf(root)).toEqual({ x: 360, y: 48 });
    meter.remove();
  });

  test('dragging clamps to the viewport and is what gets stored', async () => {
    const win = desktop();
    const memory = hooks();
    const meter = mountMeter(win.document as unknown as Document, memory);
    await flush();
    const root = node(win, '.ct-meter');
    const header = node(win, '.ct-meter-header');
    const before = pointOf(root);

    const pointer = (type: string, x: number, y: number) =>
      new win.PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0 });
    header.dispatchEvent(pointer('pointerdown', before.x + 8, before.y + 8));
    win.dispatchEvent(pointer('pointermove', before.x + 8 - 4000, before.y + 8 - 4000));
    win.dispatchEvent(pointer('pointerup', before.x + 8 - 4000, before.y + 8 - 4000));

    expect(pointOf(root)).toEqual({ x: 0, y: 0 });
    expect(memory.saved.at(-1)).toMatchObject({ x: 0, y: 0, collapsed: false });
    meter.remove();
  });

  test('a drag that stays on screen stores that corner', async () => {
    const win = desktop();
    const memory = hooks();
    const meter = mountMeter(win.document as unknown as Document, memory);
    await flush();
    const root = node(win, '.ct-meter');
    const header = node(win, '.ct-meter-header');
    const before = pointOf(root);
    const dx = 220;
    const dy = -40;
    header.dispatchEvent(
      new win.PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 20,
        clientY: 20,
        pointerId: 1,
        button: 0,
      }),
    );
    win.dispatchEvent(
      new win.PointerEvent('pointermove', {
        bubbles: true,
        clientX: 20 + dx,
        clientY: 20 + dy,
        pointerId: 1,
      }),
    );
    win.dispatchEvent(
      new win.PointerEvent('pointerup', {
        bubbles: true,
        clientX: 20 + dx,
        clientY: 20 + dy,
        pointerId: 1,
      }),
    );
    expect(pointOf(root)).toEqual({ x: before.x + dx, y: before.y + dy });
    expect(memory.saved.at(-1)).toMatchObject({ x: before.x + dx, y: before.y + dy });
    meter.remove();
  });

  test('a resize pulls a parked panel back inside the viewport', async () => {
    const win = desktop();
    const memory = hooks();
    const meter = mountMeter(win.document as unknown as Document, memory);
    await flush();
    const root = node(win, '.ct-meter');
    const header = node(win, '.ct-meter-header');
    const before = pointOf(root);
    header.dispatchEvent(
      new win.PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, pointerId: 1, button: 0 }),
    );
    win.dispatchEvent(
      new win.PointerEvent('pointermove', { bubbles: true, clientX: 10 + 900, clientY: 10, pointerId: 1 }),
    );
    win.dispatchEvent(
      new win.PointerEvent('pointerup', { bubbles: true, clientX: 10 + 900, clientY: 10, pointerId: 1 }),
    );
    expect(pointOf(root).x).toBe(before.x + 900);
    win.happyDOM.setViewport({ width: 220, height: 800 });
    win.dispatchEvent(new win.Event('resize'));
    const left = pointOf(root).x;
    const box = root.getBoundingClientRect().width || 176;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + box).toBeLessThanOrEqual(win.innerWidth + 0.5);
    expect(left).toBeLessThan(before.x + 900);
    meter.remove();
  });

  test('double-clicking the header resets the corner and keeps the counts collapsed', async () => {
    const win = desktop();
    const memory = hooks({
      loadPlacement: async () => ({ x: 300, y: 80, collapsed: true }),
    });
    const meter = mountMeter(win.document as unknown as Document, memory);
    await flush();
    const header = node(win, '.ct-meter-header');
    const root = node(win, '.ct-meter');
    header.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
    await flush();
    expect(pointOf(root).x).toBe(16);
    expect(root.classList.contains('is-collapsed')).toBe(true);
    expect(memory.saved.at(-1)).toMatchObject({ x: null, y: null, collapsed: true });
    meter.remove();
  });

  test('a double-click after a drag puts the panel back on the bottom-left', async () => {
    const win = desktop();
    const memory = hooks();
    const meter = mountMeter(win.document as unknown as Document, memory);
    await flush();
    const header = node(win, '.ct-meter-header');
    const root = node(win, '.ct-meter');
    header.dispatchEvent(
      new win.PointerEvent('pointerdown', { bubbles: true, clientX: 30, clientY: 30, pointerId: 1, button: 0 }),
    );
    win.dispatchEvent(
      new win.PointerEvent('pointermove', { bubbles: true, clientX: 200, clientY: 80, pointerId: 1 }),
    );
    win.dispatchEvent(
      new win.PointerEvent('pointerup', { bubbles: true, clientX: 200, clientY: 80, pointerId: 1 }),
    );
    expect(pointOf(root).x).toBeGreaterThan(16);
    await new Promise((resolve) => setTimeout(resolve, 60));
    header.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
    await flush();
    expect(pointOf(root).x).toBe(16);
    expect(memory.saved.at(-1)).toMatchObject({ x: null, y: null });
    meter.remove();
  });

  test('the header button collapses to the X-AntiSlop pill and expands again', async () => {
    const win = desktop();
    const memory = hooks();
    const meter = mountMeter(win.document as unknown as Document, memory);
    await flush();
    const root = node(win, '.ct-meter');
    const toggle = node(win, 'button.ct-meter-toggle');
    meter.update({ checked: 19, hidden: 10, settledLocally: 7, cost: 0.004 });
    toggle.click();
    await flush();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(root.classList.contains('is-collapsed')).toBe(true);
    expect(root.querySelector('.ct-meter-title')?.textContent).toBe('X-AntiSlop');
    expect(root.querySelector('.ct-meter-count')?.textContent).toBe('10');
    expect(root.querySelector('.ct-meter-body')?.hidden).toBe(true);
    expect(memory.saved.at(-1)).toMatchObject({ collapsed: true });
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(root.classList.contains('is-collapsed')).toBe(false);
    meter.remove();
  });

  test('an invalidated context does not throw or log, and a real save error still does', async () => {
    const win = desktop();
    const quiet = silenceWarn();
    try {
      const dead = mountMeter(win.document as unknown as Document, {
        ...hooks(),
        alive: () => true,
        loadPlacement: async () => {
          throw new Error('Extension context invalidated.');
        },
        savePlacement: async () => {
          throw new Error('Extension context invalidated.');
        },
        watchPlacement: () => {
          throw new Error('Extension context invalidated.');
        },
      });
      await flush();
      node(win, 'button.ct-meter-toggle').click();
      await flush();
      expect(quiet.logs).toEqual([]);
      dead.remove();

      const loud = mountMeter(win.document as unknown as Document, {
        ...hooks(),
        savePlacement: async () => {
          throw new Error('rejected apikey_secret');
        },
      });
      await flush();
      node(win, 'button.ct-meter-toggle').click();
      await flush();
      expect(quiet.logs).toHaveLength(1);
      expect(quiet.logs[0]?.[0]).toBe('[x-anti-slop] could not save overlay position');
      expect(String(quiet.logs[0]?.[1])).not.toContain('apikey_secret');
      expect(String(quiet.logs[0]?.[1])).toContain('[redacted]');
      loud.remove();
    } finally {
      quiet.restore();
    }
  });

  test('a dead runtime does not touch storage', async () => {
    const win = desktop();
    let loaded = false;
    const meter = mountMeter(win.document as unknown as Document, {
      ...hooks(),
      alive: () => false,
      loadPlacement: async () => {
        loaded = true;
        return { x: 1, y: 2, collapsed: false };
      },
    });
    await flush();
    expect(loaded).toBe(false);
    expect(pointOf(node(win, '.ct-meter')).x).toBe(16);
    meter.remove();
  });

  test('a settings-page reset moves an open timeline back to the default corner', async () => {
    const win = desktop();
    let onStored: (value: unknown) => void = () => {};
    const meter = mountMeter(win.document as unknown as Document, {
      ...hooks(),
      loadPlacement: async () => ({ x: 500, y: 90, collapsed: false }),
      watchPlacement: (onChange) => {
        onStored = onChange;
        return () => {};
      },
    });
    await flush();
    const root = node(win, '.ct-meter');
    expect(pointOf(root)).toEqual({ x: 500, y: 90 });
    onStored({ x: null, y: null, collapsed: false });
    expect(pointOf(root).x).toBe(16);
    expect(root.classList.contains('is-collapsed')).toBe(false);
    meter.remove();
  });

  test('the animated border stays on the collapsed pill and pauses when the tab is hidden', async () => {
    const win = desktop();
    const meter = mountMeter(win.document as unknown as Document, hooks());
    await flush();
    const root = node(win, '.ct-meter');
    expect(root.getAttribute('data-ct-border')).toBe('on');
    node(win, 'button.ct-meter-toggle').click();
    expect(root.classList.contains('is-collapsed')).toBe(true);
    expect(root.getAttribute('data-ct-border')).toBe('on');
    meter.setAnimatedBorder(false);
    expect(root.getAttribute('data-ct-border')).toBe('off');
    expect(root.classList.contains('is-border-paused')).toBe(false);
    meter.setAnimatedBorder(true);
    Object.defineProperty(win.document, 'hidden', { configurable: true, get: () => true });
    win.document.dispatchEvent(new win.Event('visibilitychange'));
    expect(root.getAttribute('data-ct-border')).toBe('on');
    expect(root.classList.contains('is-border-paused')).toBe(true);
    meter.remove();
  });
});
