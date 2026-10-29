import { describe, expect, test } from 'bun:test';
import { STYLE_QUESTIONS, buildStyleQuestions, styleQuestionCount } from './questions';
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_REPLY_BOT_THRESHOLD,
  DEFAULT_WEIGHTS,
  defaultCategorySettings,
  featureVector,
  hardRule,
  humanVeto,
  judgeSlop,
  probability,
  resolveWeights,
  scoringFingerprint,
  slopExceeds,
  weightedProbability,
  type SlopThresholds,
  type StyleAnswer,
} from './score';
import { localFeatures } from './stylometry';

function noul(values: Record<string, number>): Record<string, StyleAnswer> {
  return Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { type: 'noul' as const, noul: value }]));
}

function thresholds(patch: Partial<SlopThresholds> = {}): SlopThresholds {
  return {
    score: 0.7,
    replyBot: DEFAULT_REPLY_BOT_THRESHOLD,
    categories: defaultCategorySettings(),
    ...patch,
  };
}

describe('style questions', () => {
  test('asks all thirty narrow questions in one set', () => {
    expect(styleQuestionCount()).toBe(30);
    expect(styleQuestionCount({ text: 'hi', parentText: 'the post above' })).toBe(30);
    expect(Object.keys(STYLE_QUESTIONS)).toHaveLength(30);
    const withParent = buildStyleQuestions({ text: 'hi', parentText: 'p' });
    expect(withParent.pivot_answers_parent).toBeDefined();
    expect(withParent.pivot_answers_parent).not.toHaveProperty('needsParent');
    expect(withParent.uniform_cadence?.type).toBe('score');
    expect(withParent.reads_as_model?.type).toBe('noul');
  });
});

describe('slop score', () => {
  test('a hard rule flags a short post on Jev confidence alone', () => {
    const post = { text: 'Grok is starting to compete on economics, not just benchmarks' };
    const features = featureVector(
      {
        ...noul({ contrast_pivot: 0.86, reads_as_model: 0.38, stakes_inflation: 0.26, paint_words: 0.12 }),
        uniform_cadence: { type: 'score', score: 0.55 * 3 },
      },
      post,
    );
    expect(weightedProbability(features)).toBeLessThan(0.86);
    expect(hardRule(features, post)).toEqual({ id: 'unprompted_pivot', value: 0.86 });
    expect(probability(features, DEFAULT_WEIGHTS, post)).toBe(0.86);
  });

  test('a pivot that answers the parent is not a hard rule', () => {
    const reply = { text: 'it is economics, not benchmarks', parentText: 'Grok wins because of its benchmark scores.', isReply: true };
    const answering = featureVector(noul({ contrast_pivot: 0.9, pivot_answers_parent: 0.9 }), reply);
    expect(answering.unprompted_pivot).toBeCloseTo(0.09);
    expect(hardRule(answering, reply)).toBeNull();
    expect(probability(answering, DEFAULT_WEIGHTS, reply)).toBeLessThan(0.1);

    const unprompted = featureVector(noul({ contrast_pivot: 0.9, pivot_answers_parent: 0.05 }), reply);
    expect(hardRule(unprompted, reply)?.id).toBe('unprompted_pivot');
  });

  test('a reply whose parent is missing cannot be checked, so the pivot is not decisive', () => {
    const blind = { text: 'it is economics, not benchmarks', isReply: true };
    const features = featureVector(noul({ contrast_pivot: 0.9 }), blind);
    expect(hardRule(features, blind)).toBeNull();
    expect(features.unprompted_pivot).toBeGreaterThan(0);
    expect(hardRule(features, { text: blind.text })?.id).toBe('unprompted_pivot');
    expect(judgeSlop(features, DEFAULT_WEIGHTS, blind, thresholds()).filtered).toBe(false);
  });

  test('a confident human tell vetoes a hard rule', () => {
    const post = { text: 'Opus is way, way, way better than the last one. sorry, try this build lmao' };
    const features = featureVector(
      noul({ contrast_pivot: 0.87, emphatic_repetition: 0.9, reads_as_model: 0.34 }),
      post,
    );
    expect(features.repeated_word).toBe(1);
    expect(features.typed_laugh).toBe(1);
    expect(humanVeto(features)).toEqual({ id: 'emphatic_repetition', value: 0.9 });
    expect(hardRule(features, post)).toBeNull();
    expect(probability(features, DEFAULT_WEIGHTS, post)).toBeLessThan(0.2);
  });

  test('a category bar hides a tell the weighted sum would keep, unless a human veto fires', () => {
    const post = { text: 'Great question. What a fantastic breakdown of the roadmap.' };
    const features = featureVector(noul({ sycophantic_opener: 0.9 }), post);
    const keptBySum = judgeSlop(features, DEFAULT_WEIGHTS, post, thresholds());
    expect(keptBySum.score).toBeLessThan(0.7);
    expect(keptBySum.categories.assistant).toBeGreaterThanOrEqual(DEFAULT_CATEGORY_THRESHOLDS.assistant);
    expect(keptBySum.filtered).toBe(true);

    const human = featureVector(noul({ sycophantic_opener: 0.9, humor: 0.8 }), post);
    expect(judgeSlop(human, DEFAULT_WEIGHTS, post, thresholds()).filtered).toBe(false);
  });

  test('a bot-style reply inside a thread uses the lower threshold', () => {
    const post = {
      text: 'We shipped the ranking model after the index rebuild yesterday.',
      parentText: 'We shipped the ranking model after the index rebuild yesterday.',
      isReply: true,
    };
    const features = featureVector(
      noul({
        contrast_pivot: 0.59,
        reads_as_model: 0.59,
        compressed_coinage: 0.59,
        paint_words: 0.5,
      }),
      post,
    );
    expect(features.unprompted_pivot).toBeCloseTo(0.59);
    expect(features.em_dash).toBe(0);
    const judged = judgeSlop(features, DEFAULT_WEIGHTS, post, thresholds());
    expect(judged.botReply).toBe(true);
    expect(judged.humanVeto).toBe(false);
    expect(judged.score).toBeGreaterThanOrEqual(DEFAULT_REPLY_BOT_THRESHOLD);
    expect(judged.score).toBeLessThan(0.7);
    expect(judged.filtered).toBe(true);

    const sameScore = slopExceeds({ ...judged, botReply: false }, thresholds());
    expect(sameScore).toBeNull();
  });

  test('a laugh in a reply is not treated as a bot', () => {
    const post = { text: 'lmao no', parentText: 'the whole thread', isReply: true };
    const features = featureVector({}, post);
    expect(features.typed_laugh).toBe(1);
    expect(judgeSlop(features, DEFAULT_WEIGHTS, post, thresholds()).botReply).toBe(false);
  });

  test('the cache fingerprint changes when weights or thresholds change', () => {
    const base = scoringFingerprint(DEFAULT_WEIGHTS, thresholds());
    const heavier = resolveWeights({ bias: DEFAULT_WEIGHTS.bias, w: { reads_as_model: 4 } });
    expect(scoringFingerprint(heavier, thresholds())).not.toBe(base);
    expect(scoringFingerprint(DEFAULT_WEIGHTS, thresholds({ score: 0.85 }))).not.toBe(base);
    const categories = defaultCategorySettings();
    categories.cadence = { ...categories.cadence, threshold: 0.9 };
    expect(scoringFingerprint(DEFAULT_WEIGHTS, thresholds({ categories }))).not.toBe(base);
    expect(scoringFingerprint(DEFAULT_WEIGHTS, thresholds({ replyBot: 0.6 }))).not.toBe(base);
  });
});

describe('local counts', () => {
  test('counts em dashes, stock vocabulary, and templates, and ignores casual slang', () => {
    const dash = localFeatures('The result — fewer bugs, and a cleaner diff.');
    expect(dash.em_dash).toBe(1);
    expect(dash.vocab_always).toBe(0);

    const vocab = localFeatures('We leverage a seamless, groundbreaking approach in order to delve deeper.');
    expect(vocab.vocab_always).toBe(1);

    const cluster = localFeatures('This will foster and empower the team.');
    expect(cluster.vocab_cluster).toBe(1);

    const templated = localFeatures("Most people will never be rich.\n\nHere's why\n\n1/ Time\n2/ Leverage\n\nRead that again.");
    expect(templated.template_structure).toBe(1);

    const human = localFeatures('way, way, way better. soooo good?! lmao');
    expect(human.repeated_word).toBe(1);
    expect(human.stretched_letters).toBe(1);
    expect(human.stacked_punctuation).toBe(1);
    expect(human.typed_laugh).toBe(1);
    expect(localFeatures('tbh ngl kinda honestly').typed_laugh).toBe(0);
    expect(localFeatures('see https://www.example.com/aaa now').stretched_letters).toBe(0);
  });
});
