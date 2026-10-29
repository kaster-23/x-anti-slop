import { storage } from '#imports';
import { EMPTY_REPEAT_STATE, normalizeRepeatState, type RepeatState } from './repeat';

export const repeatStore = storage.defineItem<RepeatState>('local:repeatOffenders', {
  fallback: EMPTY_REPEAT_STATE,
});

/**
 * One read-modify-write at a time in this context. A burst of hidden posts, or
 * a slider-style settings save, would otherwise each read the same value and
 * overwrite one another. The stored revision is one past the value just read,
 * which lets another open tab ignore the echo of a write it already applied.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

export function updateRepeat(mutator: (state: RepeatState) => RepeatState): Promise<RepeatState> {
  const next = writeQueue.then(() => persistRepeat(mutator));
  writeQueue = next.catch(() => undefined);
  return next;
}

/**
 * The settings page and the timeline each have their own queue. A plain
 * read-modify-write lets the later writer replace the earlier one. The write
 * id is checked after the save, and the mutator runs again on whatever landed.
 */
async function persistRepeat(mutator: (state: RepeatState) => RepeatState): Promise<RepeatState> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = normalizeRepeatState(await repeatStore.getValue());
    const mutated = mutator(current);
    if (mutated === current) return current;
    const writeId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const stored: RepeatState = { ...mutated, revision: current.revision + 1, writeId };
    await repeatStore.setValue(stored);
    const seen = normalizeRepeatState(await repeatStore.getValue());
    if (seen.writeId === writeId) return seen;
  }
  return normalizeRepeatState(await repeatStore.getValue());
}

export async function loadRepeat(): Promise<RepeatState> {
  return normalizeRepeatState(await repeatStore.getValue());
}
