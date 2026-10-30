/** Free of extension-runtime imports, so build scripts and the eval harness
 *  can use these outside the browser. */
import { DEFAULT_AI_WRITTEN } from './ai-written';
import { DEFAULT_CARD_APPEARANCE } from './card-style';
import { djb2 } from './hash';
import {
  DEFAULT_REPLY_BOT_THRESHOLD,
  defaultCategorySettings,
  type SlopThresholds,
} from './detect/score';
import { DEFAULT_REPEAT_THRESHOLD } from './repeat';
import type { CustomFilter, Settings, Stats } from './types';

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,

  provider: 'typesafe',
  typesafeApiKey: '',
  openrouterApiKey: '',
  model: '',

  signals: {
    slop: { enabled: true, threshold: 0.7 },
    ragebait: { enabled: true, threshold: 0.7 },
    ads: { enabled: true, threshold: 0.6 },
  },

  slopCategories: defaultCategorySettings(),
  replyBotThreshold: DEFAULT_REPLY_BOT_THRESHOLD,
  slopWeights: null,
  labeling: true,
  aiWritten: { ...DEFAULT_AI_WRITTEN },
  hideAiWritten: false,

  minQuality: 0,

  customFilters: [],

  mediaFilters: {
    images: false,
    videos: false,
    gifs: false,
  },

  hidePromoted: false,
  hideMode: 'collapse',
  cards: DEFAULT_CARD_APPEARANCE,
  hideUntilChecked: false,
  allowlist: [],
  blocklist: [],
  repeatThreshold: DEFAULT_REPEAT_THRESHOLD,

  /** New installs match the Balanced preset. See lib/presets.ts. */
  preset: 'balanced',
  presetBase: 'balanced',
};

/**
 * The floor sits at 0.5 deliberately. Legitimate posts do reach the low 0.3s on
 * a signal — a genuine hiring post scored 0.31 for `ads` in the eval set — so a
 * lower bound would let the UI offer settings that hide real posts.
 */
export const THRESHOLD_MIN = 0.5;
export const THRESHOLD_MAX = 0.95;

/** Kept small so one request stays well inside Jev's 64k question budget. */
export const MAX_CUSTOM_FILTERS = 12;

export function newCustomFilter(): CustomFilter {
  return {
    id: djb2(`${Date.now()}:${Math.random()}`),
    label: '',
    instructions: '',
    whenTrue: '',
    whenFalse: '',
    enabled: true,
    threshold: 0.7,
  };
}

/** A filter with no label or instructions is a half-finished draft, not a question. */
export function isUsable(filter: CustomFilter): boolean {
  return filter.label.trim().length > 0 && filter.instructions.trim().length > 0;
}

export function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.signals.slop.threshold;
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, value));
}

export const EMPTY_STATS: Stats = {
  checked: 0,
  filtered: 0,
  settledLocally: 0,
  bySignal: {},
  inputTokens: 0,
  cost: 0,
};

export function activeKey(s: Settings): string {
  return s.provider === 'openrouter' ? s.openrouterApiKey : s.typesafeApiKey;
}

/** The bars the slop scorer reads. Signal thresholds for rage bait and ads stay outside. */
export function slopThresholdsOf(settings: Settings): SlopThresholds {
  return {
    score: settings.signals.slop.threshold,
    replyBot: settings.replyBotThreshold,
    categories: settings.slopCategories,
  };
}

/** Settings safe to hand to a content script or the popup. The key stays in storage. */
export function blankKeys(settings: Settings): Settings {
  return { ...settings, typesafeApiKey: '', openrouterApiKey: '' };
}
