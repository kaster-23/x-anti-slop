import { djb2 } from './hash';
import { activeCustomFilters, resolveModel } from './provider';
import type { Settings } from './types';

/**
 * Fingerprints everything that changes which questions we ask, so stale cache
 * entries stop matching and get re-checked. Thresholds are applied when an
 * entry is read, so editing one does not change the fingerprint.
 */
export function questionSignature(settings: Settings): string {
  const on = Object.entries(settings.signals)
    .filter(([, c]) => c.enabled)
    .map(([id]) => id)
    .sort();
  // Hashes the wording too, so editing a filter's text re-checks affected posts.
  const custom = activeCustomFilters(settings)
    .map((f) => `${f.id}:${f.instructions}:${f.whenTrue}:${f.whenFalse}`)
    .sort()
    .join('|');
  return [
    settings.provider,
    on.join(','),
    `q${settings.minQuality > 0 ? 1 : 0}`,
    resolveModel(settings),
    djb2(custom),
  ].join('|');
}
