import { describe, expect, test } from 'bun:test';
import { coerceSettings } from './coerce-settings';
import { DEFAULT_SETTINGS } from './defaults';
import { SLOP_CATEGORIES } from './detect/score';
import {
  PRESETS,
  closestPreset,
  customSnapshot,
  detectPreset,
  getPreset,
  nextPresetIndex,
  presetChangePatch,
  presetPatch,
  presetValuesOf,
  resolvePresetSelection,
  samePresetValues,
} from './presets';
import type { PresetId, Settings } from './types';

function withPreset(id: PresetId, extra: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...presetPatch(id), ...extra };
}

/** A save from before the preset fields existed. */
function withoutPreset(settings: Settings): Partial<Settings> {
  const copy: Partial<Settings> = { ...settings };
  delete copy.preset;
  delete copy.presetBase;
  return copy;
}

describe('preset definitions', () => {
  test('covers the four named presets and keeps Balanced equal to the historical defaults', () => {
    expect(PRESETS.map((preset) => preset.id)).toEqual(['light', 'balanced', 'strict', 'zen']);
    expect(presetValuesOf(DEFAULT_SETTINGS)).toEqual(getPreset('balanced').values);
    expect(detectPreset(DEFAULT_SETTINGS)).toBe('balanced');
    expect(DEFAULT_SETTINGS.preset).toBe('balanced');
    expect(DEFAULT_SETTINGS.presetBase).toBe('balanced');
  });

  test('gives every preset a one-line description and a distinct set of knobs', () => {
    const seen = new Set<string>();
    for (const preset of PRESETS) {
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(20);
      expect(preset.description).not.toMatch(/\n/);
      const key = JSON.stringify(preset.values);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test('Light only arms obvious slop, Strict lowers the bars, and Zen hides aggressively', () => {
    const light = getPreset('light').values;
    const balanced = getPreset('balanced').values;
    const strict = getPreset('strict').values;
    const zen = getPreset('zen').values;

    expect(light.signals.slop.enabled).toBe(true);
    expect(light.signals.slop.threshold).toBeGreaterThan(balanced.signals.slop.threshold);
    expect(light.signals.ragebait.enabled).toBe(false);
    expect(light.signals.ads.enabled).toBe(false);
    expect(light.hidePromoted).toBe(false);
    expect(light.repeatThreshold).toBeGreaterThan(balanced.repeatThreshold);

    expect(strict.signals.ragebait.enabled).toBe(true);
    expect(strict.signals.ads.enabled).toBe(true);
    expect(strict.signals.slop.threshold).toBeLessThan(balanced.signals.slop.threshold);
    expect(strict.signals.ragebait.threshold).toBeLessThan(balanced.signals.ragebait.threshold);
    expect(strict.signals.ads.threshold).toBeLessThan(balanced.signals.ads.threshold);
    expect(strict.repeatThreshold).toBeLessThan(balanced.repeatThreshold);
    for (const id of SLOP_CATEGORIES) {
      expect(strict.slopCategories[id]?.threshold).toBeLessThan(
        balanced.slopCategories[id]?.threshold ?? 1,
      );
    }

    expect(zen.hidePromoted).toBe(true);
    expect(zen.signals.ragebait.enabled).toBe(true);
    expect(zen.signals.ads.enabled).toBe(true);
    expect(zen.signals.slop.threshold).toBeLessThanOrEqual(strict.signals.slop.threshold);
    expect(zen.slopCategories.cadence?.threshold).toBeLessThan(
      strict.slopCategories.cadence?.threshold ?? 1,
    );
    expect(zen.minQuality).toBeGreaterThan(0);
    expect(zen.hideUntilChecked).toBe(true);
    expect(zen.repeatThreshold).toBe(1);
    expect(getPreset('zen').description).toContain('Adds model calls and may delay posts');
    expect(zen.mediaFilters).toEqual({ images: false, videos: false, gifs: false });
  });

  test('applying a preset clones its values and leaves personal settings out of the patch', () => {
    const patch = presetPatch('strict');
    expect(patch.preset).toBe('strict');
    expect(patch.presetBase).toBe('strict');
    expect(patch.signals?.slop.threshold).toBe(0.6);
    expect(patch).not.toHaveProperty('typesafeApiKey');
    expect(patch).not.toHaveProperty('openrouterApiKey');
    expect(patch).not.toHaveProperty('allowlist');
    expect(patch).not.toHaveProperty('blocklist');
    expect(patch).not.toHaveProperty('customFilters');
    expect(patch).not.toHaveProperty('slopWeights');
    expect(patch).not.toHaveProperty('labeling');
    expect(patch).not.toHaveProperty('enabled');

    patch.signals!.slop.threshold = 0.5;
    expect(getPreset('strict').values.signals.slop.threshold).toBe(0.6);
  });
});

describe('preset detection', () => {
  test('recognises each preset, including a threshold that is only a float hair off', () => {
    for (const preset of PRESETS) {
      expect(detectPreset(withPreset(preset.id))).toBe(preset.id);
    }
    const fuzzy = withPreset('balanced');
    fuzzy.signals = {
      ...fuzzy.signals,
      slop: { ...fuzzy.signals.slop, threshold: 0.7 + 1e-8 },
    };
    expect(detectPreset(fuzzy)).toBe('balanced');
  });

  test('returns null when any owned knob differs', () => {
    expect(detectPreset(withPreset('balanced', { hidePromoted: false }))).toBeNull();
    expect(detectPreset(withPreset('light', { repeatThreshold: 7 }))).toBeNull();
    const buckets = withPreset('strict');
    buckets.slopCategories = {
      ...buckets.slopCategories,
      cadence: { ...buckets.slopCategories.cadence, enabled: false },
    };
    expect(detectPreset(buckets)).toBeNull();
  });

  test('ignores personal fields, so a fitted weight or an allowlist does not leave the preset', () => {
    const settings = withPreset('zen', {
      typesafeApiKey: 'apikey_test',
      allowlist: ['friend'],
      blocklist: ['spammer'],
      labeling: false,
      slopWeights: { bias: -1, w: { reads_as_model: 4 } },
      customFilters: [
        {
          id: 'cf',
          label: 'Crypto',
          instructions: 'The post is about crypto.',
          whenTrue: '',
          whenFalse: '',
          enabled: true,
          threshold: 0.7,
        },
      ],
    });
    expect(detectPreset(settings)).toBe('zen');
  });
});

describe('preset focus', () => {
  test('arrow keys choose a neighbor and do not wrap the meaning into a settings write', () => {
    expect(nextPresetIndex(4, 0, 'ArrowRight')).toBe(1);
    expect(nextPresetIndex(4, 0, 'ArrowDown')).toBe(1);
    expect(nextPresetIndex(4, 0, 'ArrowLeft')).toBe(3);
    expect(nextPresetIndex(4, 3, 'ArrowRight')).toBe(0);
    expect(nextPresetIndex(4, 2, 'Home')).toBe(0);
    expect(nextPresetIndex(4, 0, 'End')).toBe(3);
    expect(nextPresetIndex(4, 1, 'Enter')).toBeNull();
    expect(nextPresetIndex(4, 1, ' ')).toBeNull();
  });
});

describe('custom switching', () => {
  test('editing a preset knob switches to Custom based on that preset', () => {
    const current = withPreset('light');
    const patch = presetChangePatch(current, { hidePromoted: true });
    expect(patch.preset).toBe('custom');
    expect(patch.presetBase).toBe('light');
    expect(patch.hidePromoted).toBe(true);
    expect(detectPreset({ ...current, ...patch })).toBeNull();
  });

  test('keeps the original base while already custom', () => {
    const current = withPreset('strict', { preset: 'custom', presetBase: 'strict', repeatThreshold: 4 });
    const patch = presetChangePatch(current, { minQuality: 1 });
    expect(patch.preset).toBe('custom');
    expect(patch.presetBase).toBe('strict');
  });

  test('snaps onto a preset when the edit lands exactly on one', () => {
    const current = withPreset('balanced', {
      preset: 'custom',
      presetBase: 'light',
      hidePromoted: false,
    });
    const patch = presetChangePatch(current, { hidePromoted: true });
    expect(patch.preset).toBe('balanced');
    expect(patch.presetBase).toBe('balanced');
    expect(samePresetValues(presetValuesOf({ ...current, ...patch }), getPreset('balanced').values)).toBe(
      true,
    );
  });

  test('leaves the mode alone when the edit is not a filter knob', () => {
    const current = withPreset('zen');
    expect(presetChangePatch(current, { allowlist: ['friend'] })).toEqual({ allowlist: ['friend'] });
    expect(presetChangePatch(current, { labeling: false })).toEqual({ labeling: false });
    expect(presetChangePatch(current, { slopWeights: null })).toEqual({ slopWeights: null });
    expect(presetChangePatch(current, { typesafeApiKey: 'apikey_test' })).toEqual({
      typesafeApiKey: 'apikey_test',
    });
  });

  test('a snapshot of Custom can be written back after a preset is applied', () => {
    const current = withPreset('light', {
      preset: 'custom',
      presetBase: 'light',
      hidePromoted: true,
      allowlist: ['friend'],
    });
    const snapshot = customSnapshot(current);
    expect(snapshot.preset).toBe('custom');
    expect(snapshot.presetBase).toBe('light');
    expect(snapshot.hidePromoted).toBe(true);
    expect(snapshot).not.toHaveProperty('allowlist');
    expect(snapshot).not.toHaveProperty('typesafeApiKey');
    const restored = { ...withPreset('balanced'), ...snapshot, allowlist: current.allowlist };
    expect(detectPreset(restored)).toBeNull();
    expect(restored.preset).toBe('custom');
    expect(restored.presetBase).toBe('light');
    expect(restored.allowlist).toEqual(['friend']);
  });

  test('reset patch restores the base preset', () => {
    const current = withPreset('light', { preset: 'custom', presetBase: 'light', hidePromoted: true });
    const reset = presetPatch(current.presetBase);
    const next = { ...current, ...reset };
    expect(detectPreset(next)).toBe('light');
    expect(next.allowlist).toEqual(current.allowlist);
    expect(next.typesafeApiKey).toBe(current.typesafeApiKey);
  });
});

describe('migration', () => {
  test('a save with no preset fields lands on Balanced when the knobs still match', () => {
    const settings = coerceSettings(withoutPreset(DEFAULT_SETTINGS));
    expect(settings.preset).toBe('balanced');
    expect(settings.presetBase).toBe('balanced');
    expect(settings.typesafeApiKey).toBe('');
    expect(settings.signals.slop.threshold).toBe(0.7);
  });

  test('a save that matches a preset exactly selects that preset', () => {
    const settings = coerceSettings(withoutPreset(withPreset('zen')));
    expect(settings.preset).toBe('zen');
    expect(settings.presetBase).toBe('zen');
  });

  test('a customized save with no preset fields becomes Custom based on the closest preset', () => {
    const settings = coerceSettings(withoutPreset(withPreset('balanced', { hidePromoted: false })));
    expect(settings.preset).toBe('custom');
    expect(settings.presetBase).toBe('balanced');
    expect(closestPreset(settings)).toBe('balanced');
    expect(settings.hidePromoted).toBe(false);
  });

  test('keeps a stored base when the knobs match no preset', () => {
    const stored = withPreset('strict', {
      preset: 'custom',
      presetBase: 'strict',
      repeatThreshold: 9,
    });
    const settings = coerceSettings(stored);
    expect(detectPreset(settings)).toBeNull();
    expect(settings.preset).toBe('custom');
    expect(settings.presetBase).toBe('strict');
  });

  test('an exact match wins over a stale custom base', () => {
    const stored = withPreset('zen', { preset: 'custom', presetBase: 'light' });
    const selection = resolvePresetSelection(stored, stored);
    expect(selection).toEqual({ preset: 'zen', presetBase: 'zen' });
    expect(coerceSettings(stored).preset).toBe('zen');
  });

  test('preserves the API key, lists, and fitted weights while filling new fields', () => {
    const stored = {
      ...withPreset('light'),
      typesafeApiKey: 'apikey_test',
      openrouterApiKey: 'sk-or-test',
      allowlist: ['@friend'],
      blocklist: ['@spammer'],
      slopWeights: { bias: -2, w: { humor: -3 } },
      labeling: false,
    };
    const settings = coerceSettings(withoutPreset(stored));
    expect(settings.preset).toBe('light');
    expect(settings.typesafeApiKey).toBe('apikey_test');
    expect(settings.openrouterApiKey).toBe('sk-or-test');
    expect(settings.allowlist).toEqual(['@friend']);
    expect(settings.blocklist).toEqual(['@spammer']);
    expect(settings.slopWeights?.bias).toBe(-2);
    expect(settings.slopWeights?.w.humor).toBe(-3);
    expect(settings.labeling).toBe(false);
  });

  test('fills knobs that an older save never had, without dropping a partial signal', () => {
    const settings = coerceSettings({
      signals: { slop: { enabled: true, threshold: 0.9 }, ragebait: { enabled: true, threshold: 0.7 }, ads: { enabled: true, threshold: 0.6 } },
      hidePromoted: true,
    });
    expect(settings.signals.ads.threshold).toBe(0.6);
    expect(settings.slopCategories.assistant?.enabled).toBe(true);
    expect(settings.replyBotThreshold).toBe(DEFAULT_SETTINGS.replyBotThreshold);
    expect(settings.repeatThreshold).toBe(DEFAULT_SETTINGS.repeatThreshold);
    expect(settings.preset).toBe('custom');
    expect(settings.mediaFilters).toEqual(DEFAULT_SETTINGS.mediaFilters);
  });

  test('clamps a threshold that was saved below the slider floor before comparing presets', () => {
    const settings = coerceSettings({
      ...withPreset('zen'),
      signals: {
        ...getPreset('zen').values.signals,
        slop: { enabled: true, threshold: 0.2 },
      },
    });
    expect(settings.signals.slop.threshold).toBe(0.5);
    expect(settings.preset).toBe('zen');
  });
});
