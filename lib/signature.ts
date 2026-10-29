import { slopThresholdsOf } from './defaults';
import { resolveWeights, scoringFingerprint } from './detect/score';
import { djb2 } from './hash';
import { activeCustomFilters, buildQuestions, resolveModel } from './provider';
import type { Settings } from './types';

/**
 * Fingerprints everything that changes a verdict. Weights and thresholds are
 * included, so editing them misses the cache and the post is re-checked.
 */
export function questionSignature(settings: Settings): string {
  // The ids actually sent, so asking `ad` alongside slop invalidates an older entry.
  const asked = Object.keys(buildQuestions(settings)).sort().join(',');
  // Hashes the wording too, so editing a filter's text re-checks affected posts.
  const custom = activeCustomFilters(settings)
    .map((f) => `${f.id}:${f.instructions}:${f.whenTrue}:${f.whenFalse}:${f.threshold}`)
    .sort()
    .join('|');
  const thresholds = Object.entries(settings.signals)
    .map(([id, cfg]) => `${id}:${cfg.enabled ? 1 : 0}:${cfg.threshold}`)
    .join(',');
  return [
    settings.provider,
    asked,
    resolveModel(settings),
    djb2(custom),
    thresholds,
    `q${settings.minQuality}`,
    scoringFingerprint(resolveWeights(settings.slopWeights), slopThresholdsOf(settings)),
  ].join('|');
}
