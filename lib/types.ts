import type { CategorySetting, SlopCategory, SlopWeights } from './detect/score';

export type ProviderId = 'typesafe' | 'openrouter';

/** Filters that require a model call. */
export type SignalId = 'slop' | 'ragebait' | 'ads';

/** Filters resolved locally from the DOM, with no model call. */
export type MediaFilterId = 'images' | 'videos' | 'gifs';

export type HideMode = 'collapse' | 'blur' | 'remove';

/** Named starting points. `custom` is stored separately, on {@link Settings.preset}. */
export type PresetId = 'light' | 'balanced' | 'strict' | 'zen';

/**
 * A yes/no question the user wrote themselves. Jev takes arbitrary instructions
 * and evaluates every question in one request against the same post, so each
 * extra filter costs only its own instruction text — roughly 100 tokens.
 */
export interface CustomFilter {
  id: string;
  /** Shown in the UI, and as the reason on a filtered post. */
  label: string;
  instructions: string;
  /** Optional, but pins down both ends of the scale and improves accuracy a lot. */
  whenTrue: string;
  whenFalse: string;
  enabled: boolean;
  threshold: number;
}

export interface Settings {
  enabled: boolean;

  provider: ProviderId;
  /** Stored per provider so switching back and forth doesn't lose a key. */
  typesafeApiKey: string;
  openrouterApiKey: string;
  /** Empty string means "use the provider default". */
  model: string;

  signals: Record<SignalId, { enabled: boolean; threshold: number }>;

  /**
   * Per writing-style bucket. A bucket hides the post when its strongest tell
   * clears this bar, even if the combined slop score does not.
   */
  slopCategories: Record<SlopCategory, CategorySetting>;

  /**
   * Combined-score threshold for a bot-style reply inside a thread.
   * Lower than the AI-slop signal threshold. Each bucket's bar drops by the
   * same gap while that reply is being judged.
   */
  replyBotThreshold: number;

  /** Null uses the hand-set starting weights. A fit from labels replaces them. */
  slopWeights: SlopWeights | null;

  /** Show AI / Human marks on posts, and store them locally. */
  labeling: boolean;

  /** Drop anything rated below this on the 0-3 quality scale. 0 disables. */
  minQuality: number;

  customFilters: CustomFilter[];

  mediaFilters: Record<MediaFilterId, boolean>;
  hidePromoted: boolean;
  hideMode: HideMode;

  /** Mask posts until a verdict arrives, so filtered posts never flash into view. */
  hideUntilChecked: boolean;
  /** Accounts that skip every filter. */
  allowlist: string[];
  /** Accounts hidden with no model call. Edited by the user, not inferred. */
  blocklist: string[];
  /**
   * Hidden posts from one account before the timeline suggests hiding the rest.
   * The extension never mutes or blocks; those stay on X's own confirmation.
   */
  repeatThreshold: number;

  /**
   * Which named preset matches the filter knobs. `custom` means they match none.
   * Older saves omit this; it is filled in on load and is not a new storage key.
   */
  preset: PresetId | 'custom';
  /**
   * The preset Custom mode resets to. Kept when the knobs no longer match a preset,
   * so "Reset to Balanced" still knows which card the user started from.
   */
  presetBase: PresetId;
}

export interface TweetInput {
  id: string;
  author: string;
  authorName: string;
  text: string;
  hasImage: boolean;
  hasVideo: boolean;
  isReply: boolean;
  isQuote: boolean;
  quotedText?: string;
  /**
   * Distance from the viewport in px. Lower runs first. Missing means the post
   * is already on screen.
   */
  priority?: number;
  /** Text of the post this one answers, when that post is on the page. */
  parentText?: string;
}

export interface Verdict {
  id: string;
  /** Probability per question id, 0-1. Built-in signals and custom filters. */
  scores: Record<string, number>;
  /** 0-3, higher is better. */
  quality?: number;
  /** Style-question and local-count features, present when the slop scorer ran. */
  features?: Record<string, number>;
  /** Strongest tell in each writing-style bucket, 0-1. */
  categoryScores?: Partial<Record<SlopCategory, number>>;
  /** A confident human tell vetoed the slop score. */
  humanVeto?: boolean;
  /** Bot-style reply inside a thread: the lower threshold applies. */
  botReply?: boolean;
  filtered: boolean;
  /** Shown to the user, e.g. "AI slop (92%)". */
  reason?: string;
  /** Set when classification failed; the post is left visible. */
  error?: string;
  cached?: boolean;
  /** USD for this fresh model call. Omitted on cache hits and local decisions. */
  cost?: number;
}

export type Message =
  | { type: 'classify'; tweets: TweetInput[] }
  | {
      type: 'recordLocal';
      decisions: Array<{ id: string; filtered: boolean; reason: string }>;
    }
  | { type: 'getSettings' }
  | { type: 'getPublicSettings' }
  | { type: 'settingsChanged' }
  | { type: 'getStats' }
  | { type: 'resetStats' }
  | { type: 'clearCache' }
  | { type: 'getError' }
  | { type: 'dismissError' }
  | { type: 'testKey'; provider: ProviderId; apiKey: string; model: string }
  | { type: 'testFilter'; filter: CustomFilter; text: string }
  | {
      type: 'labelPost';
      id: string;
      label: 0 | 1;
      features: Record<string, number>;
      text: string;
      author: string;
    }
  | { type: 'getLabels' }
  | { type: 'clearLabels' };

export interface Stats {
  checked: number;
  filtered: number;
  /** Decisions made without a model call: lists, short posts, counts, promoted, media. */
  settledLocally: number;
  bySignal: Record<string, number>;
  inputTokens: number;
  /** USD. */
  cost: number;
}
