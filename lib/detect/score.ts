// Ported from slop-filter (https://github.com/adamnroman/slop-filter).
// Copyright (c) 2026 Adam Roman. MIT License. See LICENSE-third-party.
//
// The weighted sum, the hard rules, and the human veto are slop-filter's.
// Per-category thresholds and the lower bar for bot-style thread replies are
// this port: the sum still produces one probability, and a bucket can also
// hide a post on its own when its strongest tell clears that bucket's bar.

import { djb2 } from '../hash';
import { STYLE_QUESTIONS, type SlopPost, type StyleQuestion } from './questions';
import { localFeatures, wordCount } from './stylometry';

export const SLOP_LOGIC_VERSION = 1;

const HARD_RULE_BAR = 0.75;
export const HARD_RULES = [
  'unprompted_pivot',
  'assistant_residue',
  'announced_insight',
  'compressed_coinage',
  'spotlight_formula',
] as const;

const HUMAN_VETO_BAR = 0.75;
export const HUMAN_TELLS = [
  'invented_words',
  'emphatic_repetition',
  'stretched_typing',
  'human_slips',
  'humor',
  'unpolished_prose',
] as const;

/** Writing-style buckets. Vocabulary and templates are local counts; the rest are Jev tells. */
export const SLOP_CATEGORY_FEATURES = {
  assistant: ['assistant_residue', 'sycophantic_opener', 'unprompted_pivot'],
  profundity: [
    'announced_insight',
    'invented_label',
    'stakes_inflation',
    'vague_authority',
    'parallel_triad',
    'verbless_fragments',
    'compressed_coinage',
    'frame_presupposition',
    'spotlight_formula',
  ],
  cadence: [
    'reads_as_model',
    'uniform_cadence',
    'synonym_cycling',
    'manufactured_punchlines',
    'subject_drop',
    'engagement_close',
    'bow_tie_closer',
    'paint_words',
  ],
  circumvention: ['colon_semicolon_pivot', 'performed_casualness'],
  vocabulary: ['vocab_always', 'vocab_cluster', 'vocab_density'],
  templates: ['template_structure'],
} as const;

export type SlopCategory = keyof typeof SLOP_CATEGORY_FEATURES;

export const SLOP_CATEGORIES = Object.keys(SLOP_CATEGORY_FEATURES) as SlopCategory[];

export interface SlopWeights {
  bias: number;
  w: Record<string, number>;
}

// Hand-set starting point from slop-filter, plus template_structure for the
// local template count. Labels replace this. With no tell on either side the
// post is human, so the bias sits well below the threshold.
export const DEFAULT_WEIGHTS: SlopWeights = {
  bias: -5,
  w: {
    reads_as_model: 2.5,
    assistant_residue: 2,
    sycophantic_opener: 0.8,
    unprompted_pivot: 3,
    contrast_pivot: 0,
    pivot_answers_parent: 0,
    announced_insight: 2,
    compressed_coinage: 3,
    frame_presupposition: 1.5,
    spotlight_formula: 1.5,
    engagement_close: 1,
    invented_label: 0.9,
    stakes_inflation: 0.8,
    vague_authority: 0.5,
    parallel_triad: 0.8,
    verbless_fragments: 0.8,
    uniform_cadence: 1.2,
    synonym_cycling: 0.6,
    manufactured_punchlines: 1,
    subject_drop: 0.2,
    bow_tie_closer: 0.9,
    paint_words: 1,
    colon_semicolon_pivot: 0.9,
    performed_casualness: 0.8,
    em_dash: 0.8,
    spaced_hyphen_dash: 0.3,
    semicolon: 0.6,
    colon_clauses: 0.5,
    curly_quotes: 0.15,
    vocab_always: 1,
    vocab_cluster: 0.7,
    vocab_density: 0.5,
    template_structure: 1,
    invented_words: -2,
    emphatic_repetition: -2,
    stretched_typing: -1.5,
    human_slips: -1.5,
    humor: -1.5,
    firsthand_specifics: -0.8,
    unpolished_prose: -1.2,
    repeated_word: -1.5,
    stretched_letters: -1,
    stacked_punctuation: -0.6,
    typed_laugh: -0.8,
  },
};

/** Full local signal (two stock words, or two template habits) clears this. */
export const DEFAULT_CATEGORY_THRESHOLDS: Record<SlopCategory, number> = {
  assistant: 0.75,
  profundity: 0.75,
  cadence: 0.8,
  circumvention: 0.85,
  vocabulary: 0.95,
  templates: 0.95,
};

export const DEFAULT_REPLY_BOT_THRESHOLD = 0.55;

export interface CategorySetting {
  enabled: boolean;
  threshold: number;
}

export interface SlopThresholds {
  /** Overall slop probability. */
  score: number;
  /** Used instead of `score` for a bot-style reply inside a thread. */
  replyBot: number;
  categories: Record<SlopCategory, CategorySetting>;
}

export function defaultCategorySettings(): Record<SlopCategory, CategorySetting> {
  return Object.fromEntries(
    SLOP_CATEGORIES.map((id) => [id, { enabled: true, threshold: DEFAULT_CATEGORY_THRESHOLDS[id] }]),
  ) as Record<SlopCategory, CategorySetting>;
}

export function resolveWeights(stored: SlopWeights | null | undefined): SlopWeights {
  if (!stored || typeof stored.bias !== 'number' || !stored.w) return DEFAULT_WEIGHTS;
  return { bias: stored.bias, w: { ...DEFAULT_WEIGHTS.w, ...stored.w } };
}

export interface NoulLike {
  type: 'noul';
  noul: number;
}
export interface ScoreLike {
  type: 'score';
  score: number;
}
export type StyleAnswer = NoulLike | ScoreLike;

function readAnswer(question: StyleQuestion, answer: StyleAnswer | undefined): number {
  if (!answer) return 0;
  if (question.type === 'noul') return answer.type === 'noul' ? answer.noul : 0;
  if (answer.type !== 'score') return 0;
  const span = question.criteria.length - 1;
  return span > 0 ? answer.score / span : 0;
}

function unpromptedPivot(features: Record<string, number>, post: SlopPost): number {
  const answersParent = post.parentText ? (features.pivot_answers_parent ?? 0) : 0;
  return (features.contrast_pivot ?? 0) * (1 - answersParent);
}

/** Jev answers plus local counts. Questions that were not asked read as 0. */
export function featureVector(
  answers: Record<string, StyleAnswer | undefined>,
  post: SlopPost,
): Record<string, number> {
  const features: Record<string, number> = {};
  for (const [id, question] of Object.entries(STYLE_QUESTIONS)) {
    features[id] = readAnswer(question, answers[id]);
  }
  Object.assign(features, localFeatures(post.text));
  features.unprompted_pivot = unpromptedPivot(features, post);
  return features;
}

export function humanVeto(features: Record<string, number>): { id: string; value: number } | null {
  let best: { id: string; value: number } | null = null;
  for (const id of HUMAN_TELLS) {
    const value = features[id] ?? 0;
    if (value >= HUMAN_VETO_BAR && value > (best?.value ?? 0)) best = { id, value };
  }
  return best;
}

const isCheckable = (id: string, post: SlopPost) =>
  id !== 'unprompted_pivot' || !post.isReply || Boolean(post.parentText);

export function hardRule(
  features: Record<string, number>,
  post: SlopPost,
): { id: string; value: number } | null {
  if (humanVeto(features)) return null;
  let best: { id: string; value: number } | null = null;
  for (const id of HARD_RULES) {
    const value = features[id] ?? 0;
    if (value >= HARD_RULE_BAR && isCheckable(id, post) && value > (best?.value ?? 0)) {
      best = { id, value };
    }
  }
  return best;
}

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function weightedProbability(
  features: Record<string, number>,
  weights: SlopWeights = DEFAULT_WEIGHTS,
): number {
  let z = weights.bias;
  for (const [id, value] of Object.entries(features)) {
    z += (weights.w[id] ?? 0) * value;
  }
  return sigmoid(z);
}

/** Gates, in order: a decisive human tell, then a hard rule, then the weighted sum. */
export function probability(
  features: Record<string, number>,
  weights: SlopWeights = DEFAULT_WEIGHTS,
  post: SlopPost = { text: '' },
): number {
  const human = humanVeto(features);
  if (human) return Math.min(weightedProbability(features, weights), 1 - human.value);
  return Math.max(weightedProbability(features, weights), hardRule(features, post)?.value ?? 0);
}

export function categoryScores(features: Record<string, number>): Record<SlopCategory, number> {
  const scores = {} as Record<SlopCategory, number>;
  for (const id of SLOP_CATEGORIES) {
    let best = 0;
    for (const feature of SLOP_CATEGORY_FEATURES[id]) {
      best = Math.max(best, features[feature] ?? 0);
    }
    scores[id] = best;
  }
  return scores;
}

const LOCAL_HUMAN = ['repeated_word', 'stretched_letters', 'stacked_punctuation', 'typed_laugh'];

function tokenSet(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).filter((word) => word.length > 2));
}

/** A short reply that mostly repeats the post it answers. Reply bots mirror. */
export function echoesParent(post: SlopPost): boolean {
  if (!post.parentText) return false;
  const reply = tokenSet(post.text);
  const parent = tokenSet(post.parentText);
  if (reply.size < 4) return false;
  let overlap = 0;
  for (const token of reply) if (parent.has(token)) overlap++;
  return overlap / reply.size >= 0.6;
}

/**
 * A reply inside a thread that has bot shape and no local human typing.
 * Genuine short replies (a laugh, a stretched word) stay on the normal threshold.
 */
export function isBotStyleReply(post: SlopPost, features: Record<string, number>): boolean {
  if (!post.isReply) return false;
  if (LOCAL_HUMAN.some((id) => (features[id] ?? 0) > 0)) return false;
  if ((features.template_structure ?? 0) >= 0.5) return true;
  if ((features.vocab_always ?? 0) >= 0.5) return true;
  if ((features.vocab_cluster ?? 0) >= 1) return true;
  if ((features.sycophantic_opener ?? 0) >= 0.6) return true;
  if ((features.engagement_close ?? 0) >= 0.6) return true;
  if ((features.assistant_residue ?? 0) >= 0.6) return true;
  const words = wordCount(post.text);
  return words > 0 && words <= 18 && echoesParent(post);
}

export interface SlopSummary {
  score: number;
  categories: Record<SlopCategory, number>;
  humanVeto: boolean;
  botReply: boolean;
}

export interface SlopTrigger {
  score: number;
}

const CATEGORY_FLOOR = 0.5;

/**
 * Whether the slop score, or any writing-style bucket, clears its threshold.
 * A human veto settles the post as human. A bot-style thread reply uses the
 * lower reply threshold, and each bucket's bar drops by the same gap.
 */
export function slopExceeds(summary: SlopSummary, thresholds: SlopThresholds): SlopTrigger | null {
  if (summary.humanVeto) return null;
  const reply = Math.min(thresholds.replyBot, thresholds.score);
  const drop = summary.botReply ? Math.max(0, thresholds.score - reply) : 0;
  const scoreThreshold = summary.botReply ? reply : thresholds.score;
  if (summary.score >= scoreThreshold) return { score: summary.score };

  let best: number | null = null;
  for (const id of SLOP_CATEGORIES) {
    const cfg = thresholds.categories[id];
    if (!cfg?.enabled) continue;
    const bar = Math.max(CATEGORY_FLOOR, cfg.threshold - drop);
    const value = summary.categories[id] ?? 0;
    if (value >= bar && (best === null || value > best)) best = value;
  }
  return best === null ? null : { score: best };
}

export interface SlopJudgment extends SlopSummary {
  filtered: boolean;
  triggerScore: number;
  features: Record<string, number>;
}

export function judgeSlop(
  features: Record<string, number>,
  weights: SlopWeights,
  post: SlopPost,
  thresholds: SlopThresholds,
): SlopJudgment {
  const summary: SlopSummary = {
    score: probability(features, weights, post),
    categories: categoryScores(features),
    humanVeto: humanVeto(features) !== null,
    botReply: isBotStyleReply(post, features),
  };
  const trigger = slopExceeds(summary, thresholds);
  return {
    ...summary,
    features,
    filtered: trigger !== null,
    triggerScore: trigger?.score ?? summary.score,
  };
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, sortValue(inner)]),
    );
  }
  return value;
}

/** Cache key material. A weight or threshold edit must miss, so posts are re-scored. */
export function scoringFingerprint(weights: SlopWeights, thresholds: SlopThresholds): string {
  return djb2(
    JSON.stringify(
      sortValue({
        version: SLOP_LOGIC_VERSION,
        bias: weights.bias,
        w: weights.w,
        score: thresholds.score,
        replyBot: thresholds.replyBot,
        categories: thresholds.categories,
      }),
    ),
  );
}
