import { djb2 } from './hash';
import {
  HEURISTIC_ID,
  MIN_WORDS_FOR_MODEL,
  postBody,
  simpleCountScorer,
  wordCount,
  type HeuristicScorer,
} from './heuristics';
import type { Settings } from './types';

export interface PrefilterPost {
  author: string;
  text: string;
  quotedText?: string;
  promoted?: boolean;
  hasImage?: boolean;
  hasVideo?: boolean;
  hasGif?: boolean;
}

export type PrefilterDecision =
  | { action: 'show'; reason: string; local: true }
  | { action: 'hide'; reason: string; local: true }
  | { action: 'model' };

export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

export function handleListed(author: string, handles: readonly string[] | undefined): boolean {
  const handle = normalizeHandle(author);
  if (!handle) return false;
  return (handles ?? []).some((candidate) => normalizeHandle(candidate) === handle);
}

/** Splits a textarea of handles on whitespace and commas. */
export function parseHandleList(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Fingerprint of every local rule. Stored with a settled id so the same post
 * is not added to the counters again after a service-worker restart.
 */
export function localSignature(settings: Settings): string {
  const media = (['images', 'videos', 'gifs'] as const)
    .filter((id) => settings.mediaFilters[id])
    .join(',');
  const allow = djb2(normalizedList(settings.allowlist));
  const block = djb2(normalizedList(settings.blocklist));
  return ['local', HEURISTIC_ID, settings.hidePromoted ? 'promo' : 'np', media, allow, block].join(
    '|',
  );
}

function normalizedList(handles: readonly string[] | undefined): string {
  return [...(handles ?? [])]
    .map(normalizeHandle)
    .filter(Boolean)
    .sort()
    .join('\n');
}

/**
 * Free checks, in order. Allow wins over block so an account on both lists
 * stays visible. The scorer runs before the short-post skip so an obvious
 * count still hides a one-line emoji pile. Pass another {@link HeuristicScorer}
 * to swap the count rules without touching this order.
 */
export function prefilter(
  post: PrefilterPost,
  settings: Settings,
  scorer: HeuristicScorer = simpleCountScorer,
): PrefilterDecision {
  if (handleListed(post.author, settings.allowlist)) {
    return { action: 'show', reason: 'Allowlisted', local: true };
  }
  if (handleListed(post.author, settings.blocklist)) {
    return { action: 'hide', reason: 'Blocked account', local: true };
  }
  if (settings.hidePromoted && post.promoted) {
    return { action: 'hide', reason: 'Promoted', local: true };
  }
  if (settings.mediaFilters.images && post.hasImage) {
    return { action: 'hide', reason: 'Image post', local: true };
  }
  if (settings.mediaFilters.videos && post.hasVideo) {
    return { action: 'hide', reason: 'Video post', local: true };
  }
  if (settings.mediaFilters.gifs && post.hasGif) {
    return { action: 'hide', reason: 'GIF post', local: true };
  }

  const scored = scorer({ text: post.text, quotedText: post.quotedText });
  if (scored) {
    return scored.filtered
      ? { action: 'hide', reason: scored.reason, local: true }
      : { action: 'show', reason: scored.reason, local: true };
  }

  if (wordCount(postBody(post)) < MIN_WORDS_FOR_MODEL) {
    return { action: 'show', reason: 'Short post', local: true };
  }

  return { action: 'model' };
}
