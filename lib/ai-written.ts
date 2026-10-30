/**
 * AI-written and AI slop are different scores from the same model call.
 *
 * AI-written is how the text was produced, from 0 to 1. AI slop is whether the
 * post adds value, whoever wrote it. The label marks a visible post. Hiding
 * for authorship is a separate switch, and every preset leaves it off.
 */
export const AI_WRITTEN_FLOORS = [0.5, 0.7, 0.9] as const;
export type AiWrittenFloor = (typeof AI_WRITTEN_FLOORS)[number];

export interface AiWrittenSettings {
  /** Show the monochrome pill on visible posts at or above the floor. */
  show: boolean;
  /** Display floor for the pill, and the bar for the optional hide. */
  floor: AiWrittenFloor;
}

export const DEFAULT_AI_WRITTEN: AiWrittenSettings = {
  show: true,
  floor: 0.5,
};

export const AI_WRITTEN_PILL_TOOLTIP =
  'Estimated chance this post was written with AI. Shown, not hidden, because it adds value.';

export function normalizeAiWrittenFloor(value: unknown): AiWrittenFloor {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_AI_WRITTEN.floor;
  for (const floor of AI_WRITTEN_FLOORS) {
    if (Math.abs(value - floor) < 0.001) return floor;
  }
  return DEFAULT_AI_WRITTEN.floor;
}

export function normalizeAiWritten(raw: unknown): AiWrittenSettings {
  const source = raw && typeof raw === 'object' ? (raw as Partial<AiWrittenSettings>) : {};
  return {
    show: typeof source.show === 'boolean' ? source.show : DEFAULT_AI_WRITTEN.show,
    floor: normalizeAiWrittenFloor(source.floor),
  };
}

export function aiWrittenScore(scores: Record<string, number> | undefined): number | undefined {
  const value = scores?.aiWritten;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** "AI 72%" for a score of 0.72. */
export function aiWrittenPillText(score: number): string {
  return `AI ${Math.round(score * 100)}%`;
}

/**
 * The pill is only for a post the filter left up. A hidden post, a missing
 * score, or a score under the floor gets nothing.
 */
export function shouldShowAiPill(
  score: number | undefined,
  settings: { aiWritten?: unknown },
  hidden: boolean,
): boolean {
  if (hidden) return false;
  const prefs = normalizeAiWritten(settings.aiWritten);
  if (!prefs.show || score === undefined) return false;
  return score >= prefs.floor;
}

/**
 * Hide when the user asked to, and the authorship score clears the same floor
 * as the label. Slop and the other filters are decided first.
 */
export function aiWrittenHide(
  score: number | undefined,
  settings: { aiWritten?: unknown; hideAiWritten?: boolean },
): { label: string; score: number } | null {
  if (settings.hideAiWritten !== true || score === undefined) return null;
  const floor = normalizeAiWritten(settings.aiWritten).floor;
  if (score < floor) return null;
  return { label: 'AI written', score };
}
