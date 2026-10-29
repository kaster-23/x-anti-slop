import { describe, expect, test } from 'bun:test';
import {
  CUSTOM_PREFIX,
  JEV_MODEL,
  MAX_SCORE_LEVELS,
  PROVIDERS,
  buildQuestions,
  buildState,
  customKey,
  systemOneBody,
  toQuestion,
} from './provider';
import { STYLE_QUESTIONS, styleQuestionCount } from './detect/questions';
import { DEFAULT_SETTINGS, isUsable, newCustomFilter } from './defaults';
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

describe('default models', () => {
  test('pins the current Jev release instead of a floating alias', () => {
    expect(PROVIDERS.typesafe.defaultModel).toBe(JEV_MODEL);
    expect(JEV_MODEL).toBe('jev-1.14.0');
    expect(PROVIDERS.openrouter.defaultModel).toBe('typesafe/jev-1.14');
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
    expect(Object.keys(questions)).toContain('reads_as_model');
    expect(Object.keys(questions).filter((id) => id !== 'ragebait' && id !== 'ads' && !id.startsWith('cf_')).length).toBe(
      styleQuestionCount(),
    );
    expect(Object.keys(questions)).toContain('ragebait');
    expect(Object.keys(questions)).toContain('ads');
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
    expect(questions.slop).toBeUndefined();
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

  test('state names post.text and keeps one post per request', () => {
    const state = buildState({
      id: '1',
      author: '@a',
      authorName: 'A',
      text: 'hello',
      hasImage: false,
      hasVideo: false,
      isReply: true,
      isQuote: false,
      parentText: 'parent words',
    });
    expect(state.post).toEqual({ text: 'hello' });
    expect(state.parent).toEqual({ text: 'parent words' });
    expect(state).not.toHaveProperty('posts');
  });

  test('omits the quality question unless a floor is set', () => {
    expect(buildQuestions(DEFAULT_SETTINGS).quality).toBeUndefined();
    expect(buildQuestions({ ...DEFAULT_SETTINGS, minQuality: 1 }).quality).toBeDefined();
  });
});

describe('toQuestion', () => {
  test('sends no criteria when the user gave none', () => {
    expect(toQuestion(filter())).toEqual({
      type: 'noul',
      instructions: 'The post is about cryptocurrency.',
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
