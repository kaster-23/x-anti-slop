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

/** `uniform_cadence` is 0..1. Every other value is a noul. */
export function styleAnswersFromLevels(levels: Record<string, number>): Record<string, StyleAnswer> {
  const answers: Record<string, StyleAnswer> = {};
  for (const [id, value] of Object.entries(levels)) {
    answers[id] = id === 'uniform_cadence'
      ? { type: 'score', score: value * 3 }
      : { type: 'noul', noul: value };
  }
  return answers;
}

export function styleDecision(
  levels: Record<string, number>,
  post: SlopPost,
  others: Pick<BaselineScores, 'ragebait' | 'ads'>,
  settings: Settings = DEFAULT_SETTINGS,
): StyleDecision {
  const features = featureVector(styleAnswersFromLevels(levels), post);
  const judged = judgeSlop(features, resolveWeights(settings.slopWeights), post, slopThresholdsOf(settings));
  const hides =
    judged.filtered ||
    enabledOver(settings, 'ragebait', others.ragebait) ||
    enabledOver(settings, 'ads', others.ads);
  return { hides, slop: judged.filtered ? judged.triggerScore : judged.score, botReply: judged.botReply };
}
