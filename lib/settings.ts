import { storage } from '#imports';
import { coerceSettings } from './coerce-settings';
import { DEFAULT_SETTINGS, EMPTY_STATS, blankKeys } from './defaults';
import { clampRepeatThreshold } from './repeat';
import type { Settings, Stats } from './types';

export { DEFAULT_SETTINGS, EMPTY_STATS, activeKey } from './defaults';

export const settingsStore = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export const statsStore = storage.defineItem<Stats>('local:stats', {
  fallback: EMPTY_STATS,
});

/**
 * Merges stored settings over the defaults so a settings object written by an
 * older version of the extension still gets fields added later.
 */
export async function loadSettings(): Promise<Settings> {
  return coerceSettings(await settingsStore.getValue());
}

/**
 * Writes are serialised because saving is a read-modify-write across an await:
 * dragging a slider fires a burst of changes, and unqueued they would each read
 * the same pre-drag value and clobber one another.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

export function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = writeQueue.then(async () => {
    const merged = { ...(await loadSettings()), ...patch };
    merged.repeatThreshold = clampRepeatThreshold(merged.repeatThreshold);
    await settingsStore.setValue(merged);
    // Callers other than the options page must not observe the key.
    return blankKeys(merged);
  });
  writeQueue = next.catch(() => undefined);
  return next;
}
