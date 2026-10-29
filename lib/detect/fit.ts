// L2-regularized logistic regression by batch gradient descent.
// Ported from slop-filter scripts/logistic.mjs and scripts/fit.mjs.
// Copyright (c) 2026 Adam Roman. MIT License. See LICENSE-third-party.
//
// Features are all 0..1 and a labelling session is a few hundred rows, so
// nothing fancier is needed. The fit replaces the weighted sum only. Hard
// rules and the human veto stay on top of it.

import { DEFAULT_WEIGHTS, sigmoid, type SlopWeights } from './score';

export interface LabelRow {
  label: 0 | 1;
  features: Record<string, number>;
}

export interface FitOptions {
  l2: number;
  learningRate: number;
  iterations: number;
}

const DEFAULTS: FitOptions = { l2: 0.01, learningRate: 0.5, iterations: 4000 };

export interface LogisticModel {
  bias: number;
  weights: number[];
}

export function fit(X: number[][], y: number[], options: Partial<FitOptions> = {}): LogisticModel {
  const { l2, learningRate, iterations } = { ...DEFAULTS, ...options };
  const n = X.length;
  if (n === 0) return { bias: 0, weights: [] };
  const width = X[0]?.length ?? 0;
  const weights = new Array<number>(width).fill(0);
  let bias = 0;

  for (let step = 0; step < iterations; step++) {
    const gradient = new Array<number>(width).fill(0);
    let biasGradient = 0;
    for (let i = 0; i < n; i++) {
      const row = X[i] ?? [];
      const error = predict(row, { bias, weights }) - (y[i] ?? 0);
      biasGradient += error;
      for (let j = 0; j < width; j++) gradient[j] = (gradient[j] ?? 0) + error * (row[j] ?? 0);
    }
    bias -= (learningRate * biasGradient) / n;
    for (let j = 0; j < width; j++) {
      weights[j] = (weights[j] ?? 0) - learningRate * ((gradient[j] ?? 0) / n + l2 * (weights[j] ?? 0));
    }
  }
  return { bias, weights };
}

export function predict(x: number[], model: LogisticModel): number {
  let z = model.bias;
  for (let j = 0; j < model.weights.length; j++) z += (model.weights[j] ?? 0) * (x[j] ?? 0);
  return sigmoid(z);
}

/** Out-of-fold probability for every row: each row is scored by a model that never saw it. */
export function crossValidate(
  X: number[][],
  y: number[],
  folds = 5,
  options: Partial<FitOptions> = {},
): number[] {
  const probabilities = new Array<number>(X.length);
  const usableFolds = Math.max(2, Math.min(folds, X.length));
  for (let fold = 0; fold < usableFolds; fold++) {
    const isTest = (i: number) => i % usableFolds === fold;
    const trainX = X.filter((_, i) => !isTest(i));
    const trainY = y.filter((_, i) => !isTest(i));
    if (trainX.length === 0) continue;
    const model = fit(trainX, trainY, options);
    X.forEach((row, i) => {
      if (isTest(i)) probabilities[i] = predict(row, model);
    });
  }
  return probabilities;
}

export function precisionRecall(
  probabilities: number[],
  y: number[],
  threshold: number,
): { flagged: number; precision: number; recall: number } {
  let truePositives = 0;
  let flagged = 0;
  let positives = 0;
  probabilities.forEach((p, i) => {
    if (y[i] === 1) positives++;
    if (p >= threshold) {
      flagged++;
      if (y[i] === 1) truePositives++;
    }
  });
  return {
    flagged,
    precision: flagged ? truePositives / flagged : Number.NaN,
    recall: positives ? truePositives / positives : Number.NaN,
  };
}

/** Only features the labels actually recorded. The rest keep their starting weight. */
export function featureNames(rows: LabelRow[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    for (const name of Object.keys(row.features)) names.add(name);
  }
  return [...names].sort();
}

const MIN_PER_CLASS = 2;

export type FitResult =
  | {
      ok: true;
      weights: SlopWeights;
      ai: number;
      human: number;
      /** Out-of-fold precision at 0.7, when both classes have enough rows to bother. */
      precisionAtDefault: number | null;
    }
  | { ok: false; error: string };

/**
 * Fits a weight vector from in-extension labels. Keys the labels never saw
 * keep their hand-set starting weight, so a new tell is not zeroed out.
 */
export function fitFromLabels(rows: LabelRow[], options: Partial<FitOptions> = {}): FitResult {
  const ai = rows.filter((row) => row.label === 1).length;
  const human = rows.length - ai;
  if (ai < MIN_PER_CLASS || human < MIN_PER_CLASS) {
    return {
      ok: false,
      error: `Need at least ${MIN_PER_CLASS} AI labels and ${MIN_PER_CLASS} human labels (have ${ai} AI, ${human} human).`,
    };
  }

  const names = featureNames(rows);
  const X = rows.map((row) => names.map((name) => row.features[name] ?? 0));
  const y = rows.map((row) => row.label);
  const model = fit(X, y, options);
  const fitted: Record<string, number> = {};
  names.forEach((name, j) => {
    fitted[name] = Number((model.weights[j] ?? 0).toFixed(3));
  });

  let precisionAtDefault: number | null = null;
  if (ai >= 5 && human >= 5) {
    const heldOut = crossValidate(X, y, 5, options);
    precisionAtDefault = precisionRecall(heldOut, y, 0.7).precision;
  }

  return {
    ok: true,
    ai,
    human,
    precisionAtDefault,
    weights: { bias: Number(model.bias.toFixed(3)), w: { ...DEFAULT_WEIGHTS.w, ...fitted } },
  };
}
