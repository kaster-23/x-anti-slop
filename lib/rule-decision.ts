import { slopThresholdsOf } from './defaults';
import { slopExceeds, type SlopCategory } from './detect/score';
import { prefilter, type PrefilterPost } from './prefilter';
import { hidingMatch } from './provider';
import type { Settings } from './types';

/** What a model call would return. The eval supplies these instead of the network. */
export interface ModelReading {
  slop?: number;
  ragebait?: number;
  ads?: number;
  /** 0–3. Omitted means the quality question was not asked. */
  quality?: number;
  categories?: Partial<Record<SlopCategory, number>>;
  botReply?: boolean;
  humanVeto?: boolean;
  /** Scores for custom-filter question ids already namespaced by the caller. */
  custom?: Record<string, number>;
}

export interface RulePost extends Omit<PrefilterPost, 'author'> {
  author?: string;
  /** The account was already set to hide the rest, on this device. */
  autoHide?: boolean;
  model?: ModelReading;
}

export interface RuleOutcome {
  hide: boolean;
  reason: string;
  stage: 'repeat' | 'local' | 'model';
}

const EMPTY_CATEGORIES: Record<SlopCategory, number> = {
  assistant: 0,
  profundity: 0,
  cadence: 0,
  circumvention: 0,
  vocabulary: 0,
  templates: 0,
};

/**
 * The same order the timeline uses: repeat auto-hide, then on-device rules,
 * then the model thresholds. No network.
 */
export function decidePost(post: RulePost, settings: Settings): RuleOutcome {
  if (post.autoHide) {
    return { hide: true, reason: 'Repeat', stage: 'repeat' };
  }

  const local = prefilter({ ...post, author: post.author ?? '' }, settings);
  if (local.action === 'hide') return { hide: true, reason: local.reason, stage: 'local' };
  if (local.action === 'show') return { hide: false, reason: local.reason, stage: 'local' };

  const reading = post.model ?? {};
  const scores: Record<string, number> = {
    slop: reading.slop ?? 0,
    ragebait: reading.ragebait ?? 0,
    ads: reading.ads ?? 0,
    ...reading.custom,
  };
  let best = hidingMatch(scores, settings);
  if (settings.signals.slop.enabled) {
    const hit = slopExceeds(
      {
        score: reading.slop ?? 0,
        categories: { ...EMPTY_CATEGORIES, ...reading.categories },
        humanVeto: reading.humanVeto === true,
        botReply: reading.botReply === true,
      },
      slopThresholdsOf(settings),
    );
    if (hit && (!best || hit.score > best.score)) best = { label: 'AI slop', score: hit.score };
  }
  if (best) return { hide: true, reason: best.label, stage: 'model' };

  if (
    settings.minQuality > 0 &&
    reading.quality !== undefined &&
    reading.quality < settings.minQuality
  ) {
    return { hide: true, reason: 'Low quality', stage: 'model' };
  }
  return { hide: false, reason: 'Kept', stage: 'model' };
}
