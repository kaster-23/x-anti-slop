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
  const next = writeQueue.then(async () => {
    const current = normalizeRepeatState(await repeatStore.getValue());
    const mutated = mutator(current);
    if (mutated === current) return current;
    const stored: RepeatState = { ...mutated, revision: current.revision + 1 };
    await repeatStore.setValue(stored);
    return stored;
  });
  writeQueue = next.catch(() => undefined);
  return next;
}

export async function loadRepeat(): Promise<RepeatState> {
  return normalizeRepeatState(await repeatStore.getValue());
}
