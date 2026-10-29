import { describe, expect, test } from 'bun:test';
import { FILTER_CORPUS } from '../test/fixtures/filter-corpus';
import { newCustomFilter } from '../lib/defaults';
import { decidePost } from '../lib/rule-decision';
import { mismatches, scorePreset, settingsFor } from './eval-rules';

describe('preset rule eval', () => {
  test('the labeled corpus matches every preset', () => {
    expect(FILTER_CORPUS.length).toBeGreaterThanOrEqual(150);
    const rows = (['light', 'balanced', 'strict', 'zen'] as const).map((id) => scorePreset(id));
    expect(mismatches(rows)).toEqual([]);
    for (const row of rows) {
      expect(row.precision).toBe(1);
      expect(row.recall).toBe(1);
    }
  });

  test('a higher signal bar never hides more posts, and a higher quality floor never hides fewer', () => {
    const base = settingsFor('balanced');
    let previous = Number.POSITIVE_INFINITY;
    for (const threshold of [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]) {
      const settings = {
        ...base,
        signals: { ...base.signals, slop: { enabled: true, threshold } },
      };
      const hides = FILTER_CORPUS.filter((post) => decidePost(post, settings).hide).length;
      expect(hides).toBeLessThanOrEqual(previous);
      previous = hides;
    }

    previous = -1;
    for (const floor of [0, 0.5, 1, 1.5, 2, 2.5]) {
      const settings = { ...base, minQuality: floor };
      const hides = FILTER_CORPUS.filter((post) => decidePost(post, settings).hide).length;
      expect(hides).toBeGreaterThanOrEqual(previous);
      previous = hides;
    }
  });

  test('a custom filter hides only when the score clears its own bar', () => {
    const filter = { ...newCustomFilter(), id: 'crypto', label: 'Crypto shill', instructions: 'Is this a coin pitch?', enabled: true };
    const base = settingsFor('light');
    const post = FILTER_CORPUS.find((item) => item.id === 'custom-hit-1');
    expect(post).toBeTruthy();
    let previous = Number.POSITIVE_INFINITY;
    for (const threshold of [0.5, 0.7, 0.85, 0.95]) {
      const settings = { ...base, customFilters: [{ ...filter, threshold }] };
      const reading = {
        ...post!,
        model: { ...post!.model, custom: { cf_crypto: 0.9 } },
      };
      const hides = decidePost(reading, settings).hide ? 1 : 0;
      expect(hides).toBeLessThanOrEqual(previous);
      previous = hides;
    }
    const loose = decidePost(
      { ...post!, model: { ...post!.model, ads: 0.2, custom: { cf_crypto: 0.9 } } },
      { ...base, signals: { ...base.signals, slop: { enabled: false, threshold: 0.9 }, ads: { enabled: false, threshold: 0.9 } }, customFilters: [{ ...filter, threshold: 0.7 }] },
    );
    const tight = decidePost(
      { ...post!, model: { ...post!.model, ads: 0.2, custom: { cf_crypto: 0.9 } } },
      { ...base, signals: { ...base.signals, slop: { enabled: false, threshold: 0.9 }, ads: { enabled: false, threshold: 0.9 } }, customFilters: [{ ...filter, threshold: 0.95 }] },
    );
    expect(loose.hide).toBe(true);
    expect(tight.hide).toBe(false);
  });
});
