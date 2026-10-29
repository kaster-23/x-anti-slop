import { describe, expect, test } from 'bun:test';
import { fitFromLabels, precisionRecall } from './fit';
import { DEFAULT_WEIGHTS, weightedProbability } from './score';

describe('fitFromLabels', () => {
  test('learns a separable signal and ignores a feature that does not separate', () => {
    const rows = [];
    for (let i = 0; i < 12; i++) {
      rows.push({
        label: 1 as const,
        features: { reads_as_model: 1, em_dash: i % 2 },
      });
      rows.push({
        label: 0 as const,
        features: { reads_as_model: 0, em_dash: (i + 1) % 2 },
      });
    }
    const result = fitFromLabels(rows, { iterations: 800 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.weights.w.reads_as_model).toBeGreaterThan(0);
    expect(Math.abs(result.weights.w.em_dash ?? 0)).toBeLessThan(Math.abs(result.weights.w.reads_as_model ?? 0));
    // Untouched tells keep the hand-set weight.
    expect(result.weights.w.humor).toBe(DEFAULT_WEIGHTS.w.humor);

    const ai = weightedProbability({ reads_as_model: 1 }, result.weights);
    const human = weightedProbability({ reads_as_model: 0 }, result.weights);
    expect(ai).toBeGreaterThan(human);
    expect(result.precisionAtDefault).not.toBeNull();
    if (result.precisionAtDefault !== null) expect(result.precisionAtDefault).toBeGreaterThan(0.9);
  });

  test('refuses a one-class set', () => {
    const result = fitFromLabels([{ label: 1, features: { reads_as_model: 1 } }]);
    expect(result.ok).toBe(false);
  });

  test('precision is zero when nothing is flagged', () => {
    const stats = precisionRecall([0.1, 0.2], [1, 0], 0.7);
    expect(stats.flagged).toBe(0);
    expect(stats.precision).toBeNaN();
    expect(stats.recall).toBe(0);
  });
});
