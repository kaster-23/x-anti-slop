import { describe, expect, test } from 'bun:test';
import {
  CUSTOM_PREFIX,
  JEV_MODEL,
  MAX_SCORE_LEVELS,
  MAX_STATE_CHARS,
  PROVIDERS,
  buildQuestions,
  buildState,
  capScoreCriteria,
  customKey,
  formatCost,
  hidingMatch,
  OPENROUTER_REFERER,
  OPENROUTER_TITLE,
  openRouterAppHeaders,
  nextRetryDelay,
  readScores,
  resolveModel,
  systemOneBody,
  toQuestion,
} from './provider';
import { STYLE_QUESTIONS, styleQuestionCount } from './detect/questions';
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
    expect(PROVIDERS.typesafe.defaultModel).toBe(JEV_MODEL);
    expect(JEV_MODEL).toBe('jev-1.14.0');
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

  test('keeps rage bait and ads, and replaces the broad slop question with the style bank', () => {
    const questions = buildQuestions(settingsWith([filter()]));
    expect(questions.slop).toBeUndefined();
    expect(questions.ai_slop).toBeUndefined();
    expect(Object.keys(questions)).toContain('reads_as_model');
    expect(styleQuestionCount()).toBe(30);
    expect(Object.keys(questions)).toContain('ragebait');
    expect(Object.keys(questions)).toContain('ad');
    expect(questions.aiWritten?.type).toBe('noul');
  });

  test('asks how the text was produced, and skips it when the label and the hide are both off', () => {
    const on = buildQuestions(DEFAULT_SETTINGS).aiWritten;
    expect(on?.type).toBe('noul');
    if (on?.type === 'noul') {
      expect(on.instructions.toLowerCase()).toContain('how the text was produced');
      expect(on.criteria?.false.toLowerCase()).toContain('person');
    }
    const off = buildQuestions({
      ...DEFAULT_SETTINGS,
      aiWritten: { ...DEFAULT_SETTINGS.aiWritten, show: false },
      hideAiWritten: false,
    });
    expect(off.aiWritten).toBeUndefined();
    const hideOnly = buildQuestions({
      ...DEFAULT_SETTINGS,
      aiWritten: { ...DEFAULT_SETTINGS.aiWritten, show: false },
      hideAiWritten: true,
    });
    expect(hideOnly.aiWritten).toBeDefined();
  });

  test('asks ad whenever slop is on, so engagement-bait filed as an ad is scored', () => {
    const questions = buildQuestions({
      ...DEFAULT_SETTINGS,
      signals: {
        ...DEFAULT_SETTINGS.signals,
        ads: { enabled: false, threshold: 0.6 },
      },
    });
    expect(questions.ai_slop).toBeUndefined();
    expect(questions.reads_as_model).toBeDefined();
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
    expect(questions.reads_as_model).toEqual(buildQuestions(DEFAULT_SETTINGS).reads_as_model);
    expect(questions.ai_slop).toBeUndefined();
    expect(questions[customKey(evil)]).toBeDefined();
  });

  test('puts all 30 style questions in one map, which is one request', () => {
    const questions = buildQuestions(DEFAULT_SETTINGS, { text: 'hello' });
    expect(Object.keys(STYLE_QUESTIONS)).toHaveLength(30);
    for (const id of Object.keys(STYLE_QUESTIONS)) expect(questions[id]).toBeDefined();
    expect(questions.reads_as_model?.type).toBe('noul');
    expect(questions.uniform_cadence?.type).toBe('score');
    const body = systemOneBody(JEV_MODEL, 'hello', questions);
    expect(body.model).toBe('jev-1.14.0');
    expect(body.state).toBe('hello');
    expect(Object.keys(body.questions)).toHaveLength(Object.keys(questions).length);
    const reads = questions.reads_as_model;
    expect(reads).toBeDefined();
    expect(body.questions.reads_as_model).toEqual({
      type: 'noul',
      instructions: reads!.instructions,
      criteria: reads!.criteria,
    });
    for (const question of Object.values(body.questions)) {
      if (question.type === 'score' && Array.isArray(question.criteria)) {
        expect(question.criteria.length).toBeLessThanOrEqual(MAX_SCORE_LEVELS);
      }
      if (question.type === 'noul' && question.criteria) {
        expect(Object.keys(question.criteria).sort()).toEqual(['false', 'true']);
      }
    }
  });

  test('refuses an 11th score level before it would 422', () => {
    expect(() =>
      systemOneBody(JEV_MODEL, 'hello', {
        too_many: { type: 'score', instructions: 'How much?', criteria: Array.from({ length: 11 }, (_, i) => `level ${i}`) },
      }),
    ).toThrow(/at most 10/);
  });

  test('choice criteria are option descriptions, not an ordered list', () => {
    const body = systemOneBody(JEV_MODEL, 'hello', {
      kind: {
        type: 'choice',
        instructions: 'What kind of post is this?',
        criteria: { human: 'Typed by a person.', model: 'Reads like a language model.' },
      },
    });
    expect(body.questions.kind?.criteria).toEqual({
      human: 'Typed by a person.',
      model: 'Reads like a language model.',
    });
    expect(() =>
      systemOneBody(JEV_MODEL, 'hello', {
        kind: { type: 'choice', instructions: 'What kind?', criteria: ['human', 'model'] as unknown as Record<string, string> },
      }),
    ).toThrow(/option: description/);
  });

  test('state is the tweet text, including the replied-to post when it is on the page', () => {
    const state = buildState({
      text: 'hello',
      parentText: 'parent words',
    });
    expect(state).toBe('hello\n\nIn reply to:\nparent words');
    expect(state).not.toContain('@');
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

describe('OpenRouter app attribution', () => {
  test('names the privacy page and the extension, not a repository', () => {
    const headers = openRouterAppHeaders();
    expect(headers['HTTP-Referer']).toBe('https://x-anti-slop-privacy.vercel.app/');
    expect(headers['HTTP-Referer']).toBe(OPENROUTER_REFERER);
    expect(headers['X-Title']).toBe('X-AntiSlop');
    expect(headers['X-Title']).toBe(OPENROUTER_TITLE);
    expect(JSON.stringify(headers)).not.toContain('github.com');
    expect(JSON.stringify(headers)).not.toContain('kaster-23');
  });
});

describe('formatCost', () => {
  test('shows nothing when the cost is zero or not a number', () => {
    expect(formatCost(0)).toBe('');
    expect(formatCost(-0.04)).toBe('');
    expect(formatCost(Number.NaN)).toBe('');
    expect(formatCost(Number.POSITIVE_INFINITY)).toBe('');
  });

  test('uses a cent floor while the amount is above zero and under one cent', () => {
    expect(formatCost(0.000042)).toBe('<$0.01');
    expect(formatCost(0.009)).toBe('<$0.01');
  });

  test('uses two decimals from one cent up', () => {
    expect(formatCost(0.01)).toBe('$0.01');
    expect(formatCost(0.1)).toBe('$0.10');
    expect(formatCost(1.2)).toBe('$1.20');
    expect(formatCost(12.345)).toBe('$12.35');
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
