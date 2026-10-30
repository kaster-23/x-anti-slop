/** How long a slider or a text field waits before the storage write. */
export const AUTOSAVE_DEBOUNCE_MS = 300;

/** "Saved · just now" holds this long, then the line fades to the quiet copy. */
export const AUTOSAVE_QUIET_MS = 1800;

export const AUTOSAVE_HINT = 'Changes save automatically.';

const TEXT_OR_SLIDER = new Set([
  'model',
  'typesafeApiKey',
  'openrouterApiKey',
  'signals',
  'slopCategories',
  'minQuality',
  'repeatThreshold',
  'replyBotThreshold',
  'customFilters',
]);

/** Sliders and text fields wait. Toggles and preset picks write on the click. */
export function shouldDebounceSave(patch: object): boolean {
  return Object.keys(patch).some((key) => TEXT_OR_SLIDER.has(key));
}

export type AutosavePhase = 'idle' | 'saving' | 'saved' | 'quiet' | 'error';

export function autosaveText(phase: AutosavePhase): string {
  if (phase === 'saving') return 'Saving…';
  if (phase === 'saved') return 'Saved · just now';
  if (phase === 'quiet') return 'All changes saved';
  if (phase === 'error') return "Couldn't save";
  return '';
}

/**
 * A failed write retries once. The second failure is the error the Retry
 * button shows. A success clears the count.
 */
export function afterSave(tries: number, ok: boolean): { tries: number; retry: boolean; phase: AutosavePhase } {
  if (ok) return { tries: 0, retry: false, phase: 'saved' };
  if (tries < 1) return { tries: tries + 1, retry: true, phase: 'saving' };
  return { tries, retry: false, phase: 'error' };
}
