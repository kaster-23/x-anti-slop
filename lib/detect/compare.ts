// Turns one labelled post into a baseline decision and a style-scorer decision.
// The baseline is clean-twitter's single slop noul. The style scorer is the
// ported bank. Rage bait and ads stay single questions on both sides.

import { DEFAULT_SETTINGS, slopThresholdsOf } from '../defaults';
import type { Settings } from '../types';
import type { SlopPost } from './questions';
import {
  featureVector,
  judgeSlop,
  resolveWeights,
  type StyleAnswer,
} from './score';

export interface BaselineScores {
  slop: number;
  ragebait: number;
  ads: number;
}

export interface StyleDecision {
  hides: boolean;
  slop: number;
  botReply: boolean;
}

function enabledOver(settings: Settings, id: 'slop' | 'ragebait' | 'ads', score: number): boolean {
  const cfg = settings.signals[id];
  return cfg.enabled && score >= cfg.threshold;
}

export function baselineHides(scores: BaselineScores, settings: Settings = DEFAULT_SETTINGS): boolean {
  return (
    enabledOver(settings, 'slop', scores.slop) ||
    enabledOver(settings, 'ragebait', scores.ragebait) ||
    enabledOver(settings, 'ads', scores.ads)
  );
}

/** Reads a noul probability. Ignores any other field on the answer. */
export function noulOf(answers: Record<string, { type?: string; noul?: number }>, id: string): number {
  const answer = answers[id];
  return answer?.type === 'noul' && typeof answer.noul === 'number' ? answer.noul : 0;
}

export function baselineScoresFrom(answers: Record<string, { type?: string; noul?: number }>): BaselineScores {
  return { slop: noulOf(answers, 'slop'), ragebait: noulOf(answers, 'ragebait'), ads: noulOf(answers, 'ads') };
}

export function styleDecision(
  answers: Record<string, { type?: string; noul?: number; score?: number } | undefined>,
  post: SlopPost,
  others: Pick<BaselineScores, 'ragebait' | 'ads'>,
  settings: Settings = DEFAULT_SETTINGS,
): StyleDecision {
  // Copy only the probability (noul) or the score. A noul confidence field, if a
  // caller stuffed one in, is not part of the answer and is not read.
  const usable: Record<string, StyleAnswer> = {};
  for (const [id, answer] of Object.entries(answers)) {
    if (answer?.type === 'noul' && typeof answer.noul === 'number') usable[id] = { type: 'noul', noul: answer.noul };
    else if (answer?.type === 'score' && typeof answer.score === 'number') {
      usable[id] = { type: 'score', score: answer.score };
    }
  }
  const features = featureVector(usable, post);
  const judged = judgeSlop(features, resolveWeights(settings.slopWeights), post, slopThresholdsOf(settings));
  const hides =
    judged.filtered ||
    enabledOver(settings, 'ragebait', others.ragebait) ||
    enabledOver(settings, 'ads', others.ads);
  return { hides, slop: judged.filtered ? judged.triggerScore : judged.score, botReply: judged.botReply };
}
