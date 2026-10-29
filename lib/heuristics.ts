/**
 * On-device counts that settle only the obvious tails. Anything in the middle
 * returns null and still goes to Jev.
 *
 * This is the extension point for a richer scorer: keep the {@link HeuristicScorer}
 * signature and replace {@link simpleCountScorer}. Bump {@link HEURISTIC_ID}
 * when settled decisions change so cached local stats don't suppress a recount.
 * Phrase lists and fitted weights do not belong here.
 */
export const HEURISTIC_ID = 'counts-v1';

/** Posts with fewer words than this never call the model. */
export const MIN_WORDS_FOR_MODEL = 5;

export const HASHTAG_HIDE_AT = 6;
export const EMOJI_HIDE_AT = 10;
export const URL_HIDE_AT = 4;
export const SHOUT_MIN_LETTERS = 24;
export const SHOUT_MIN_CAPS_RATIO = 0.7;
export const SHOUT_MIN_BANGS = 3;

export interface HeuristicPost {
  text: string;
  quotedText?: string;
}

/**
 * A settled local decision. `filtered: false` leaves the post visible and
 * skips Jev; null (from the scorer) means "not this rule".
 */
export interface HeuristicVerdict {
  filtered: boolean;
  reason: string;
}

export type HeuristicScorer = (post: HeuristicPost) => HeuristicVerdict | null;

export interface TextCounts {
  words: number;
  hashtags: number;
  emoji: number;
  exclamations: number;
  urls: number;
  letters: number;
  uppercase: number;
  capsRatio: number;
}

export function postBody(post: HeuristicPost): string {
  return [post.text, post.quotedText]
    .filter((part): part is string => !!part && part.trim().length > 0)
    .join('\n');
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function countText(text: string): TextCounts {
  const words = wordCount(text);
  const hashtags = text.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  const emoji = text.match(/\p{Extended_Pictographic}/gu)?.length ?? 0;
  const urls = text.match(/https?:\/\/\S+/gi)?.length ?? 0;
  const letters = text.match(/[A-Za-z]/g)?.length ?? 0;
  const uppercase = text.match(/[A-Z]/g)?.length ?? 0;
  let exclamations = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === '!') exclamations++;
  return {
    words,
    hashtags,
    emoji,
    exclamations,
    urls,
    letters,
    uppercase,
    capsRatio: letters === 0 ? 0 : uppercase / letters,
  };
}

/** Count-only. High thresholds so ordinary emphasis does not hide a post. */
export function simpleCountScorer(post: HeuristicPost): HeuristicVerdict | null {
  const counts = countText(postBody(post));

  if (counts.hashtags >= HASHTAG_HIDE_AT) {
    return { filtered: true, reason: `Hashtag spam (${counts.hashtags})` };
  }
  if (counts.emoji >= EMOJI_HIDE_AT) {
    return { filtered: true, reason: `Emoji spam (${counts.emoji})` };
  }
  if (counts.urls >= URL_HIDE_AT) {
    return { filtered: true, reason: `Link dump (${counts.urls})` };
  }
  if (
    counts.letters >= SHOUT_MIN_LETTERS &&
    counts.capsRatio >= SHOUT_MIN_CAPS_RATIO &&
    counts.exclamations >= SHOUT_MIN_BANGS
  ) {
    return { filtered: true, reason: 'Shouting' };
  }
  return null;
}
