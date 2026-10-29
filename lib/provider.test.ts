import { describe, expect, test } from 'bun:test';
import {
  CUSTOM_PREFIX,
  MAX_SCORE_LEVELS,
  MAX_STATE_CHARS,
  PROVIDERS,
  buildQuestions,
  buildState,
  capScoreCriteria,
  customKey,
  hidingMatch,
  nextRetryDelay,
  readScores,
  resolveModel,
  toQuestion,
} from './provider';
import { DEFAULT_SETTINGS, blankKeys, isUsable, newCustomFilter } from './defaults';
import type { CustomFilter, Settings } from './types';

function filter(fields: Partial<CustomFilter> = {}): CustomFilter {
  return {
    ...newCustomFilter(),
    label: 'Crypto talk',
    instructions: 'The post is about cryptocurrency.',
    ...fields,
  };
}

function settingsWith(customFilters: CustomFilter[]): Settings {
  return { ...DEFAULT_SETTINGS, customFilters };
}

describe('blankKeys', () => {
  test('clears both provider keys and leaves the other settings', () => {
    const blank = blankKeys({
      ...DEFAULT_SETTINGS,
      typesafeApiKey: 'apikey_secret',
      openrouterApiKey: 'sk-or-secret',
      enabled: false,
    });
    expect(blank.typesafeApiKey).toBe('');
    expect(blank.openrouterApiKey).toBe('');
    expect(blank.enabled).toBe(false);
  });
});

describe('default models', () => {
  test('pins the current Jev release instead of a floating alias', () => {
    expect(PROVIDERS.typesafe.defaultModel).toBe('jev-1.14.0');
    expect(PROVIDERS.openrouter.defaultModel).toBe('typesafe/jev-1.14');
    expect(resolveModel({ provider: 'typesafe', model: '' })).toBe('jev-1.14.0');
    expect(resolveModel({ provider: 'typesafe', model: 'jev-latest' })).toBe('jev-1.14.0');
    expect(resolveModel({ provider: 'openrouter', model: '~typesafe/jev-latest' })).toBe(
      'typesafe/jev-1.14',
    );
    expect(resolveModel({ provider: 'typesafe', model: 'jev-1.13.0' })).toBe('jev-1.13.0');
  });
});

describe('isUsable', () => {
  test('requires both a label and a question', () => {
    expect(isUsable(filter())).toBe(true);
    expect(isUsable(filter({ label: '   ' }))).toBe(false);
    expect(isUsable(filter({ instructions: '' }))).toBe(false);
  });
});

describe('buildQuestions', () => {
  test('adds enabled custom filters under a namespaced key', () => {
    const f = filter();
    const questions = buildQuestions(settingsWith([f]));
    expect(questions[customKey(f)]).toBeDefined();
    expect(customKey(f).startsWith(CUSTOM_PREFIX)).toBe(true);
  });

  test('keeps the built-in signals alongside', () => {
    const questions = buildQuestions(settingsWith([filter()]));
    expect(Object.keys(questions)).toContain('ai_slop');
    expect(Object.keys(questions)).toContain('ragebait');
    expect(Object.keys(questions)).toContain('ad');
  });

  test('asks ad whenever slop is on, so engagement-bait filed as an ad is scored', () => {
    const questions = buildQuestions({
      ...DEFAULT_SETTINGS,
      signals: {
        ...DEFAULT_SETTINGS.signals,
        ads: { enabled: false, threshold: 0.6 },
      },
    });
    expect(questions.ai_slop).toBeDefined();
    expect(questions.ad).toBeDefined();
  });

  test('caps score criteria at 10 levels', () => {
    const levels = Array.from({ length: 11 }, (_, i) => `level ${i}`);
    expect(capScoreCriteria(levels)).toHaveLength(MAX_SCORE_LEVELS);
    const quality = buildQuestions({ ...DEFAULT_SETTINGS, minQuality: 1 }).quality;
    expect(quality && quality.type === 'score' && quality.criteria.length).toBeLessThanOrEqual(
      MAX_SCORE_LEVELS,
    );
  });

  test('skips disabled and half-written filters', () => {
    const off = filter({ enabled: false });
    const draft = filter({ label: '' });
    const questions = buildQuestions(settingsWith([off, draft]));
    expect(questions[customKey(off)]).toBeUndefined();
    expect(questions[customKey(draft)]).toBeUndefined();
  });

  test('a custom filter cannot collide with a built-in signal', () => {
    // Even a filter whose id spells a built-in name lands in its own namespace.
    const evil = filter({ id: 'slop' });
    const questions = buildQuestions(settingsWith([evil]));
    expect(questions.ai_slop).toEqual(buildQuestions(DEFAULT_SETTINGS).ai_slop);
    expect(questions[customKey(evil)]).toBeDefined();
  });

  test('omits the quality question unless a floor is set', () => {
    expect(buildQuestions(DEFAULT_SETTINGS).quality).toBeUndefined();
    expect(buildQuestions({ ...DEFAULT_SETTINGS, minQuality: 1 }).quality).toBeDefined();
  });
});

describe('toQuestion', () => {
  test('always sends both ends of the criteria', () => {
    expect(toQuestion(filter())).toEqual({
      type: 'noul',
      instructions: 'The post is about cryptocurrency.',
      criteria: {
        true: 'The statement is true of this post',
        false: 'The statement is not true of this post',
      },
    });
  });

  test('fills the opposite end when only one side is given', () => {
    const q = toQuestion(filter({ whenTrue: 'Mentions tokens' })) as {
      criteria: { true: string; false: string };
    };
    expect(q.criteria.true).toBe('Mentions tokens');
    expect(q.criteria.false).toBeTruthy();
  });

  test('trims whitespace out of the instructions', () => {
    expect(toQuestion(filter({ instructions: '  padded  ' })).instructions).toBe('padded');
  });
});

describe('buildState', () => {
  test('is the tweet text, with a quote chain trimmed to the cap', () => {
    const state = buildState({ text: 'hello', quotedText: 'q'.repeat(10_000) });
    expect(state.startsWith('hello\n\nQuoted:\n')).toBe(true);
    expect(state.length).toBeLessThanOrEqual(MAX_STATE_CHARS);
    expect(state.endsWith('…')).toBe(true);
  });
});

describe('readScores', () => {
  test('reads noul without a confidence field and maps category names', () => {
    const read = readScores({
      ai_slop: { type: 'noul', noul: 0.91 },
      ad: { type: 'noul', noul: 0.88 },
    });
    expect(read.scores.slop).toBe(0.91);
    expect(read.scores.ads).toBe(0.88);
    expect(read.scores).not.toHaveProperty('confidence');
  });
});

describe('hidingMatch', () => {
  test('hides a high slop score and a human score', () => {
    expect(hidingMatch({ slop: 0.9, ads: 0.1 }, DEFAULT_SETTINGS)?.label).toBe('AI slop');
    expect(hidingMatch({ slop: 0.1, ads: 0.12 }, DEFAULT_SETTINGS)).toBeNull();
  });

  test('hides engagement-bait that scores as an ad while the slop score stays low', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      signals: {
        ...DEFAULT_SETTINGS.signals,
        ads: { enabled: false, threshold: 0.6 },
      },
    };
    const match = hidingMatch({ slop: 0.1, ads: 0.9 }, settings);
    expect(match?.label).toBe('Ad');
    expect(match?.score).toBeGreaterThan(0.8);
  });
});

describe('nextRetryDelay', () => {
  test('backs off on 429 and waits out a short retry-after', () => {
    expect(nextRetryDelay(429, null, 0)).toBe(400);
    expect(nextRetryDelay(429, null, 1)).toBe(800);
    expect(nextRetryDelay(529, '2', 0)).toBe(2_000);
  });

  test('respects retry-after on 429 and 529, including a long one', () => {
    expect(nextRetryDelay(429, '120', 0)).toBe(120_000);
    expect(nextRetryDelay(529, '2', 0)).toBe(2_000);
  });

  test('does not retry a 422 or a 401', () => {
    expect(nextRetryDelay(422, '1', 0)).toBeNull();
    expect(nextRetryDelay(401, null, 0)).toBeNull();
  });
});
