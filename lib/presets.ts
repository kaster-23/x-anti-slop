/**
 * Named presets for the filter knobs.
 *
 * A preset is a complete set of values for every knob that changes what gets
 * hidden: signal thresholds, writing-style buckets, promoted and media toggles,
 * the repeat-offender bar, hide mode, the related switches, and whether
 * AI-written posts are hidden. It does not touch the API key, provider, model,
 * allowlist, blocklist, filters the user wrote, the on/off switch, fitted
 * weights, the AI/Human marking tools, or the AI-written label (on/off and
 * the display floor). Those belong to the person, not to the preset.
 * Every preset leaves “also hide AI-written posts” off.
 *
 * Balanced is the historical default, so a settings object saved before presets
 * existed lands on Balanced when nothing was customized.
 */
import { DEFAULT_SETTINGS } from './defaults';
import { SLOP_CATEGORIES, type SlopCategory } from './detect/score';
import { REPEAT_THRESHOLD_MAX } from './repeat';
import type { HideMode, MediaFilterId, PresetId, Settings, SignalId } from './types';

export interface PresetValues {
  signals: Settings['signals'];
  slopCategories: Settings['slopCategories'];
  replyBotThreshold: number;
  minQuality: number;
  mediaFilters: Settings['mediaFilters'];
  hidePromoted: boolean;
  hideMode: HideMode;
  hideUntilChecked: boolean;
  repeatThreshold: number;
  /** Off on every named preset. Authorship alone does not hide a post. */
  hideAiWritten: boolean;
}

export interface Preset {
  id: PresetId;
  name: string;
  /** One line, plain language, about what the preset hides. */
  description: string;
  /** What still shows up. Two to four short lines. */
  willSee: readonly string[];
  /** What gets hidden. Two to four short lines. */
  wontSee: readonly string[];
  values: PresetValues;
}

const SIGNAL_IDS: readonly SignalId[] = ['slop', 'ragebait', 'ads'];
const MEDIA_IDS: readonly MediaFilterId[] = ['images', 'videos', 'gifs'];

/** Fields whose edits move the user off a named preset and into Custom. */
export const PRESET_VALUE_KEYS = [
  'signals',
  'slopCategories',
  'replyBotThreshold',
  'minQuality',
  'mediaFilters',
  'hidePromoted',
  'hideMode',
  'hideUntilChecked',
  'repeatThreshold',
  'hideAiWritten',
] as const satisfies readonly (keyof PresetValues)[];

const MEDIA_OFF: PresetValues['mediaFilters'] = { images: false, videos: false, gifs: false };

function categories(thresholds: Record<SlopCategory, number>): PresetValues['slopCategories'] {
  return Object.fromEntries(
    SLOP_CATEGORIES.map((id) => {
      const threshold = thresholds[id];
      if (threshold === undefined) throw new Error(`missing category threshold ${id}`);
      return [id, { enabled: true, threshold }];
    }),
  ) as PresetValues['slopCategories'];
}

function cloneValues(values: PresetValues): PresetValues {
  return {
    signals: {
      slop: { ...values.signals.slop },
      ragebait: { ...values.signals.ragebait },
      ads: { ...values.signals.ads },
    },
    slopCategories: Object.fromEntries(
      SLOP_CATEGORIES.map((id) => {
        const setting = values.slopCategories[id];
        if (!setting) throw new Error(`missing category ${id}`);
        return [id, { enabled: setting.enabled, threshold: setting.threshold }];
      }),
    ) as PresetValues['slopCategories'],
    replyBotThreshold: values.replyBotThreshold,
    minQuality: values.minQuality,
    mediaFilters: { ...values.mediaFilters },
    hidePromoted: values.hidePromoted,
    hideMode: values.hideMode,
    hideUntilChecked: values.hideUntilChecked,
    repeatThreshold: values.repeatThreshold,
    hideAiWritten: values.hideAiWritten,
  };
}

/** The knobs a preset owns, read off a full settings object. */
export function presetValuesOf(settings: Settings): PresetValues {
  return cloneValues({
    signals: settings.signals,
    slopCategories: settings.slopCategories,
    replyBotThreshold: settings.replyBotThreshold,
    minQuality: settings.minQuality,
    mediaFilters: settings.mediaFilters,
    hidePromoted: settings.hidePromoted,
    hideMode: settings.hideMode,
    hideUntilChecked: settings.hideUntilChecked,
    repeatThreshold: settings.repeatThreshold,
    hideAiWritten: settings.hideAiWritten,
  });
}

function balancedValues(): PresetValues {
  return presetValuesOf(DEFAULT_SETTINGS);
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'light',
    name: 'Light',
    description: 'Hides only obvious filler. Rage bait, ads, promoted posts, and useful AI-written posts stay up.',
    willSee: [
      'Arguments, news, product launches, and ads',
      'Useful posts, including ones written with AI',
      'Short replies and posts with a few emoji or links',
    ],
    wontSee: [
      'Obvious filler, whoever wrote it',
      'Hashtag piles, emoji piles, link dumps, and all-caps shouting',
    ],
    values: {
      signals: {
        slop: { enabled: true, threshold: 0.9 },
        ragebait: { enabled: false, threshold: 0.9 },
        ads: { enabled: false, threshold: 0.9 },
      },
      slopCategories: categories({
        assistant: 0.9,
        profundity: 0.9,
        cadence: 0.95,
        circumvention: 0.95,
        vocabulary: 0.95,
        templates: 0.95,
      }),
      replyBotThreshold: 0.8,
      minQuality: 0,
      mediaFilters: { ...MEDIA_OFF },
      hidePromoted: false,
      hideMode: 'collapse',
      hideUntilChecked: false,
      repeatThreshold: 8,
      hideAiWritten: false,
    },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Hides clear filler, rage bait, and ads. A useful post stays, including one written with AI.',
    willSee: [
      'News, technical posts, and real arguments',
      'A useful post, even when an AI wrote it',
      'Posts with a few emoji, hashtags, or source links',
    ],
    wontSee: [
      'Filler, rage bait, and pitches, whoever wrote them',
      'Get-rich, casino, and empty engagement bait',
      'Hashtag piles, emoji piles, link dumps, and shouting',
    ],
    values: balancedValues(),
  },
  {
    id: 'strict',
    name: 'Strict',
    description: 'Hides more slop, rage bait, and ads, and flags repeat accounts sooner.',
    willSee: [
      'Posts with specific names, numbers, or a real point',
      'A useful draft, even when a model wrote it',
      'A sharp criticism that brings evidence',
    ],
    wontSee: [
      'Borderline filler, quieter rage bait, and softer pitches',
      'Bot-style replies that only agree or pivot',
      'Repeat accounts after two slop or ad hides',
    ],
    values: {
      signals: {
        slop: { enabled: true, threshold: 0.6 },
        ragebait: { enabled: true, threshold: 0.6 },
        ads: { enabled: true, threshold: 0.55 },
      },
      slopCategories: categories({
        assistant: 0.65,
        profundity: 0.65,
        cadence: 0.7,
        circumvention: 0.75,
        vocabulary: 0.85,
        templates: 0.85,
      }),
      replyBotThreshold: 0.5,
      minQuality: 0,
      mediaFilters: { ...MEDIA_OFF },
      hidePromoted: false,
      hideMode: 'collapse',
      hideUntilChecked: false,
      repeatThreshold: 2,
      hideAiWritten: false,
    },
  },
  {
    id: 'zen',
    name: 'Zen',
    description:
      'Hides borderline slop, engagement bait, promoted posts, and low-value posts. Adds model calls and may delay posts.',
    willSee: [
      'Specific, useful posts, including ones written with AI',
      'A normal reply that actually answers',
    ],
    wontSee: [
      'Borderline slop, bait, and low-value filler',
      'Every post X marks as promoted',
      'New posts until a verdict arrives',
    ],
    values: {
      signals: {
        slop: { enabled: true, threshold: 0.5 },
        ragebait: { enabled: true, threshold: 0.5 },
        ads: { enabled: true, threshold: 0.5 },
      },
      // Cadence covers engagement closes. The bar sits near the floor so that bait goes too.
      slopCategories: categories({
        assistant: 0.55,
        profundity: 0.55,
        cadence: 0.55,
        circumvention: 0.6,
        vocabulary: 0.75,
        templates: 0.75,
      }),
      replyBotThreshold: 0.5,
      minQuality: 1.5,
      mediaFilters: { ...MEDIA_OFF },
      hidePromoted: true,
      hideMode: 'collapse',
      hideUntilChecked: true,
      repeatThreshold: 1,
      hideAiWritten: false,
    },
  },
];

const PRESET_IDS: readonly PresetId[] = PRESETS.map((preset) => preset.id);

export function isPresetId(value: unknown): value is PresetId {
  return typeof value === 'string' && (PRESET_IDS as readonly string[]).includes(value);
}

export function getPreset(id: PresetId): Preset {
  const preset = PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error(`Unknown preset ${id}`);
  return preset;
}

export function presetName(id: PresetId): string {
  return getPreset(id).name;
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

export function samePresetValues(a: PresetValues, b: PresetValues): boolean {
  for (const id of SIGNAL_IDS) {
    const left = a.signals[id];
    const right = b.signals[id];
    if (left.enabled !== right.enabled || !near(left.threshold, right.threshold)) return false;
  }
  for (const id of SLOP_CATEGORIES) {
    const left = a.slopCategories[id];
    const right = b.slopCategories[id];
    if (!left || !right) return false;
    if (left.enabled !== right.enabled || !near(left.threshold, right.threshold)) return false;
  }
  if (!near(a.replyBotThreshold, b.replyBotThreshold)) return false;
  if (!near(a.minQuality, b.minQuality)) return false;
  if (a.hidePromoted !== b.hidePromoted) return false;
  if (a.hideMode !== b.hideMode) return false;
  if (a.hideUntilChecked !== b.hideUntilChecked) return false;
  if (a.repeatThreshold !== b.repeatThreshold) return false;
  if (a.hideAiWritten !== b.hideAiWritten) return false;
  for (const id of MEDIA_IDS) {
    if (a.mediaFilters[id] !== b.mediaFilters[id]) return false;
  }
  return true;
}

/** The preset whose knobs match, or null when the settings are custom. */
export function detectPreset(settings: Settings): PresetId | null {
  const values = presetValuesOf(settings);
  for (const preset of PRESETS) {
    if (samePresetValues(values, preset.values)) return preset.id;
  }
  return null;
}

/**
 * How far the knobs sit from a preset. Used only to pick a "based on" label
 * for saves that predate presets and match none of them. A boolean mismatch
 * costs more than a small nudge of a threshold.
 */
export function presetDistance(settings: Settings, id: PresetId): number {
  const values = presetValuesOf(settings);
  const target = getPreset(id).values;
  const booleanPenalty = 0.4;
  let distance = 0;
  for (const signal of SIGNAL_IDS) {
    distance += Math.abs(values.signals[signal].threshold - target.signals[signal].threshold);
    if (values.signals[signal].enabled !== target.signals[signal].enabled) distance += booleanPenalty;
  }
  for (const category of SLOP_CATEGORIES) {
    const left = values.slopCategories[category];
    const right = target.slopCategories[category];
    if (!left || !right) {
      distance += 1;
      continue;
    }
    distance += Math.abs(left.threshold - right.threshold);
    if (left.enabled !== right.enabled) distance += booleanPenalty;
  }
  distance += Math.abs(values.replyBotThreshold - target.replyBotThreshold);
  distance += Math.abs(values.minQuality - target.minQuality) / 3;
  distance += Math.abs(values.repeatThreshold - target.repeatThreshold) / REPEAT_THRESHOLD_MAX;
  if (values.hidePromoted !== target.hidePromoted) distance += booleanPenalty;
  if (values.hideUntilChecked !== target.hideUntilChecked) distance += booleanPenalty;
  if (values.hideAiWritten !== target.hideAiWritten) distance += booleanPenalty;
  if (values.hideMode !== target.hideMode) distance += booleanPenalty;
  for (const media of MEDIA_IDS) {
    if (values.mediaFilters[media] !== target.mediaFilters[media]) distance += booleanPenalty;
  }
  return distance;
}

/** Closest preset. Balanced wins an exact tie so a near-default save stays with it. */
export function closestPreset(settings: Settings): PresetId {
  let best: PresetId = 'balanced';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const preset of PRESETS) {
    const distance = presetDistance(settings, preset.id);
    const tie = Math.abs(distance - bestDistance) < 1e-9;
    if (distance < bestDistance - 1e-9 || (tie && preset.id === 'balanced')) {
      best = preset.id;
      bestDistance = distance;
    }
  }
  return best;
}

export interface PresetSelection {
  preset: PresetId | 'custom';
  presetBase: PresetId;
}

/**
 * Decides Custom vs a named preset for a settings object that may have been
 * saved before these fields existed. An exact knob match wins over a stale
 * stored label. Otherwise the stored base is kept, and a missing base falls
 * back to the closest preset.
 */
export function resolvePresetSelection(
  settings: Settings,
  stored?: { preset?: unknown; presetBase?: unknown },
): PresetSelection {
  const detected = detectPreset(settings);
  if (detected) return { preset: detected, presetBase: detected };
  if (isPresetId(stored?.presetBase)) return { preset: 'custom', presetBase: stored.presetBase };
  if (isPresetId(stored?.preset)) return { preset: 'custom', presetBase: stored.preset };
  return { preset: 'custom', presetBase: closestPreset(settings) };
}

/** Values to merge into settings when the user picks a card. Keys and lists are absent. */
export function presetPatch(id: PresetId): Partial<Settings> {
  const values = cloneValues(getPreset(id).values);
  return {
    ...values,
    preset: id,
    presetBase: id,
  };
}

function patchTouchesPreset(patch: Partial<Settings>): boolean {
  return PRESET_VALUE_KEYS.some((key) => patch[key] !== undefined);
}

/** Knobs to restore if the user undoes applying a preset over Custom. */
export function customSnapshot(settings: Settings): Partial<Settings> {
  return {
    ...presetValuesOf(settings),
    preset: 'custom',
    presetBase: settings.presetBase,
  };
}

/**
 * Which preset button an arrow key should move focus to.
 * Applying the preset is a separate click, Enter, or Space.
 */
export function nextPresetIndex(count: number, index: number, key: string): number | null {
  if (count <= 0) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return index <= 0 ? count - 1 : index - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/**
 * Folds a settings edit into Custom when it moves a preset knob, and snaps back
 * onto a card when the result matches one exactly. Edits outside the preset
 * (lists, keys, fitted weights) keep the current mode.
 */
export function presetChangePatch(current: Settings, patch: Partial<Settings>): Partial<Settings> {
  if (!patchTouchesPreset(patch)) return patch;
  const detected = detectPreset({ ...current, ...patch });
  if (detected) return { ...patch, preset: detected, presetBase: detected };
  const presetBase = current.preset === 'custom' ? current.presetBase : current.preset;
  return { ...patch, preset: 'custom', presetBase };
}
