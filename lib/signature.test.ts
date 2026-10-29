import { describe, expect, test } from 'bun:test';
import { DEFAULT_SETTINGS } from './defaults';
import { questionSignature } from './signature';
import type { CustomFilter, Settings } from './types';

function withSettings(patch: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...patch,
    signals: { ...DEFAULT_SETTINGS.signals, ...patch.signals },
  };
}

function filter(fields: Partial<CustomFilter> = {}): CustomFilter {
  return {
    id: 'cf1',
    label: 'Crypto talk',
    instructions: 'The post is about cryptocurrency.',
    whenTrue: '',
    whenFalse: '',
    enabled: true,
    threshold: 0.7,
    ...fields,
  };
}

describe('questionSignature', () => {
  test('ignores a label edit and misses when a threshold changes', () => {
    const base = questionSignature(withSettings({
      customFilters: [filter()],
      minQuality: 1,
    }));
    const relabeled = questionSignature(withSettings({
      customFilters: [filter({ label: 'Tokens' })],
      minQuality: 1,
    }));
    expect(relabeled).toBe(base);
    expect(questionSignature(withSettings({
      customFilters: [filter()],
      minQuality: 1,
      signals: {
        ...DEFAULT_SETTINGS.signals,
        slop: { enabled: true, threshold: 0.95 },
      },
    }))).not.toBe(base);
  });

  test('changes when the question set changes', () => {
    const base = questionSignature(DEFAULT_SETTINGS);
    expect(questionSignature(withSettings({
      signals: {
        ...DEFAULT_SETTINGS.signals,
        ragebait: { enabled: false, threshold: 0.7 },
      },
    }))).not.toBe(base);
    expect(questionSignature(withSettings({ minQuality: 1 }))).not.toBe(base);
    expect(questionSignature(withSettings({ model: 'jev-1.13.0' }))).not.toBe(base);
    expect(questionSignature(withSettings({
      customFilters: [filter({ instructions: 'The post is about cryptocurrency.' })],
    }))).not.toBe(questionSignature(withSettings({
      customFilters: [filter({ instructions: 'The post is about sports.' })],
    })));
  });

  test('changes when the provider changes even if the model string does not', () => {
    const model = 'jev-1.14.0';
    const typesafe = questionSignature(withSettings({ provider: 'typesafe', model }));
    const openrouter = questionSignature(withSettings({ provider: 'openrouter', model }));
    expect(openrouter).not.toBe(typesafe);
  });
});
