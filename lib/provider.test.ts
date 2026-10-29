import { describe, expect, test } from 'bun:test';
import { CUSTOM_PREFIX, PROVIDERS, buildQuestions, buildState, customKey, toQuestion } from './provider';
import { styleQuestionCount } from './detect/questions';
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
    expect(PROVIDERS.typesafe.defaultModel).toBe('jev-1.14.0');
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

  test('asks the parent question only when the replied-to post is known', () => {
    expect(buildQuestions(DEFAULT_SETTINGS).pivot_answers_parent).toBeUndefined();
    expect(
      buildQuestions(DEFAULT_SETTINGS, { text: 'not that', parentText: 'the claim', isReply: true })
        .pivot_answers_parent,
    ).toBeDefined();
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
