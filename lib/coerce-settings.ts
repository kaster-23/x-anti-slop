/**
 * Turns a settings object from storage into a complete Settings value.
 * Saves from before a field existed pick up the default for that field.
 * The storage item stays `local:settings`; nothing here renames a key.
 */
import { DEFAULT_SETTINGS, clampThreshold } from './defaults';
import { SLOP_CATEGORIES, resolveWeights } from './detect/score';
import { resolvePresetSelection } from './presets';
import { clampRepeatThreshold } from './repeat';
import type { HideMode, Settings } from './types';

function isHideMode(value: unknown): value is HideMode {
  return value === 'collapse' || value === 'blur' || value === 'remove';
}

function mergeSignal(
  base: { enabled: boolean; threshold: number },
  saved: { enabled?: boolean; threshold?: number } | undefined,
): { enabled: boolean; threshold: number } {
  return {
    enabled: saved?.enabled ?? base.enabled,
    threshold: clampThreshold(saved?.threshold ?? base.threshold),
  };
}

export function coerceSettings(stored: Partial<Settings> | null | undefined): Settings {
  const source = stored ?? {};
  const merged: Settings = {
    ...DEFAULT_SETTINGS,
    ...source,
    signals: {
      slop: mergeSignal(DEFAULT_SETTINGS.signals.slop, source.signals?.slop),
      ragebait: mergeSignal(DEFAULT_SETTINGS.signals.ragebait, source.signals?.ragebait),
      ads: mergeSignal(DEFAULT_SETTINGS.signals.ads, source.signals?.ads),
    },
    mediaFilters: {
      images: source.mediaFilters?.images ?? DEFAULT_SETTINGS.mediaFilters.images,
      videos: source.mediaFilters?.videos ?? DEFAULT_SETTINGS.mediaFilters.videos,
      gifs: source.mediaFilters?.gifs ?? DEFAULT_SETTINGS.mediaFilters.gifs,
    },
    allowlist: Array.isArray(source.allowlist) ? source.allowlist : DEFAULT_SETTINGS.allowlist,
    blocklist: Array.isArray(source.blocklist) ? source.blocklist : DEFAULT_SETTINGS.blocklist,
    customFilters: Array.isArray(source.customFilters)
      ? source.customFilters
      : DEFAULT_SETTINGS.customFilters,
    slopCategories: { ...DEFAULT_SETTINGS.slopCategories },
    slopWeights: source.slopWeights ? resolveWeights(source.slopWeights) : null,
    hideMode: isHideMode(source.hideMode) ? source.hideMode : DEFAULT_SETTINGS.hideMode,
    replyBotThreshold: clampThreshold(
      source.replyBotThreshold ?? DEFAULT_SETTINGS.replyBotThreshold,
    ),
    repeatThreshold: clampRepeatThreshold(
      source.repeatThreshold ?? DEFAULT_SETTINGS.repeatThreshold,
    ),
  };

  for (const id of SLOP_CATEGORIES) {
    const saved = source.slopCategories?.[id];
    const fallback = DEFAULT_SETTINGS.slopCategories[id];
    if (!fallback) throw new Error(`missing default category ${id}`);
    merged.slopCategories[id] = {
      enabled: saved?.enabled ?? fallback.enabled,
      threshold: clampThreshold(saved?.threshold ?? fallback.threshold),
    };
  }

  const selection = resolvePresetSelection(merged, source);
  merged.preset = selection.preset;
  merged.presetBase = selection.presetBase;
  return merged;
}
