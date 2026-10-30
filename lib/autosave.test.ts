import { describe, expect, test } from 'bun:test';
import { AUTOSAVE_DEBOUNCE_MS, afterSave, autosaveText, shouldDebounceSave } from './autosave';

describe('autosave', () => {
  test('names each phase, and waits on sliders and text', () => {
    expect(AUTOSAVE_DEBOUNCE_MS).toBe(300);
    expect(autosaveText('saving')).toBe('Saving…');
    expect(autosaveText('saved')).toBe('Saved · just now');
    expect(autosaveText('quiet')).toBe('All changes saved');
    expect(autosaveText('error')).toBe("Couldn't save");
    expect(shouldDebounceSave({ signals: {} })).toBe(true);
    expect(shouldDebounceSave({ model: 'jev' })).toBe(true);
    expect(shouldDebounceSave({ hidePromoted: true })).toBe(false);
    expect(shouldDebounceSave({ hideMode: 'blur' })).toBe(false);
  });

  test('retries a failed write once, then stops on the error', () => {
    expect(afterSave(0, false)).toEqual({ tries: 1, retry: true, phase: 'saving' });
    expect(afterSave(1, false)).toEqual({ tries: 1, retry: false, phase: 'error' });
    expect(afterSave(1, true)).toEqual({ tries: 0, retry: false, phase: 'saved' });
  });
});
