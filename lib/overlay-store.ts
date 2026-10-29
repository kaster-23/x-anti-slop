import { storage } from '#imports';
import {
  DEFAULT_OVERLAY_PLACEMENT,
  normalizeOverlayPlacement,
  placementAfterReset,
  type OverlayPlacement,
} from './overlay-place';

/** One item so a drag and a collapse cannot land in two keys and overwrite each other. */
export const overlayStore = storage.defineItem<OverlayPlacement>('local:overlayPosition', {
  fallback: DEFAULT_OVERLAY_PLACEMENT,
});

let writeQueue: Promise<unknown> = Promise.resolve();

export async function loadOverlayPlacement(): Promise<OverlayPlacement> {
  return normalizeOverlayPlacement(await overlayStore.getValue());
}

/** Replaces the stored placement. Callers pass the full value, including a collapse they want to keep. */
export function saveOverlayPlacement(next: OverlayPlacement): Promise<OverlayPlacement> {
  const placement = normalizeOverlayPlacement(next);
  const job = writeQueue.then(async () => {
    await overlayStore.setValue(placement);
    return placement;
  });
  writeQueue = job.catch(() => undefined);
  return job;
}

/** Puts the panel back on the default corner. The collapsed state stays. */
export function resetOverlayPosition(): Promise<OverlayPlacement> {
  const job = writeQueue.then(async () => {
    const current = normalizeOverlayPlacement(await overlayStore.getValue());
    const next = placementAfterReset(current);
    await overlayStore.setValue(next);
    return next;
  });
  writeQueue = job.catch(() => undefined);
  return job;
}
