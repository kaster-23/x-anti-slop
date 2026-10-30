import {
  AI_WRITTEN_PILL_TOOLTIP,
  aiWrittenPillText,
  aiWrittenScore,
  shouldShowAiPill,
} from '@/lib/ai-written';
import type { Settings } from '@/lib/types';

export const AI_PILL_CLASS = 'ct-ai-pill';

/** Removes a pill left on this post by an earlier verdict. */
export function clearAiWrittenPill(article: HTMLElement): void {
  article.querySelector(`.${AI_PILL_CLASS}`)?.remove();
}

/**
 * A small monochrome pill next to the post header. Only a visible post at or
 * above the display floor gets one.
 */
export function mountAiWrittenPill(
  article: HTMLElement,
  scores: Record<string, number> | undefined,
  settings: Settings,
): void {
  clearAiWrittenPill(article);
  const score = aiWrittenScore(scores);
  if (!shouldShowAiPill(score, settings, false)) return;

  const pill = article.ownerDocument.createElement('span');
  pill.className = AI_PILL_CLASS;
  pill.textContent = aiWrittenPillText(score ?? 0);
  pill.title = AI_WRITTEN_PILL_TOOLTIP;

  const header = article.querySelector('[data-testid="User-Name"]');
  if (header) header.append(pill);
  else article.prepend(pill);
}
