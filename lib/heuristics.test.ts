import { describe, expect, test } from 'bun:test';
import {
  EMOJI_HIDE_AT,
  HASHTAG_HIDE_AT,
  MIN_WORDS_FOR_MODEL,
  URL_HIDE_AT,
  countText,
  simpleCountScorer,
  wordCount,
} from './heuristics';

describe('wordCount', () => {
  test('counts whitespace-separated words', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('   ')).toBe(0);
    expect(wordCount('lol')).toBe(1);
    expect(wordCount('one two three four')).toBe(4);
    expect(wordCount('one two three four five')).toBe(MIN_WORDS_FOR_MODEL);
  });
});

describe('simpleCountScorer', () => {
  const ordinary = 'spent the afternoon tracking down a memory leak in the handler';

  test('leaves an ordinary post for the model', () => {
    expect(simpleCountScorer({ text: ordinary })).toBeNull();
  });

  test('hides a hashtag pile and ignores a smaller one', () => {
    const tags = Array.from({ length: HASHTAG_HIDE_AT }, (_, i) => `#tag${i}`).join(' ');
    expect(simpleCountScorer({ text: `launch day ${tags} today friends` })?.reason).toMatch(
      /Hashtag spam/,
    );
    const fewer = Array.from({ length: HASHTAG_HIDE_AT - 1 }, (_, i) => `#tag${i}`).join(' ');
    expect(simpleCountScorer({ text: `launch day ${fewer} today friends` })).toBeNull();
  });

  test('hides an emoji pile even when the words would be short', () => {
    const pile = '🔥'.repeat(EMOJI_HIDE_AT);
    expect(simpleCountScorer({ text: `go ${pile}` })?.filtered).toBe(true);
    expect(simpleCountScorer({ text: `go ${'🔥'.repeat(EMOJI_HIDE_AT - 1)}` })).toBeNull();
  });

  test('hides a link dump', () => {
    const urls = Array.from({ length: URL_HIDE_AT }, (_, i) => `https://example.com/${i}`).join(' ');
    expect(simpleCountScorer({ text: `read ${urls} please` })?.reason).toMatch(/Link dump/);
    const fewer = Array.from({ length: URL_HIDE_AT - 1 }, (_, i) => `https://example.com/${i}`).join(
      ' ',
    );
    expect(simpleCountScorer({ text: `read ${fewer} please` })).toBeNull();
  });

  test('hides sustained shouting and keeps a normal exclamation', () => {
    expect(
      simpleCountScorer({
        text: 'THIS IS COMPLETELY UNACCEPTABLE AND EVERYONE NEEDS TO STOP RIGHT NOW!!!!',
      })?.reason,
    ).toBe('Shouting');
    expect(simpleCountScorer({ text: 'I really think this launch was mishandled!' })).toBeNull();
  });

  test('counts the quoted post together with the reply', () => {
    const tags = Array.from({ length: HASHTAG_HIDE_AT }, (_, i) => `#q${i}`).join(' ');
    expect(simpleCountScorer({ text: 'this', quotedText: tags })?.filtered).toBe(true);
  });
});

describe('countText', () => {
  test('reports caps ratio only over latin letters', () => {
    const counts = countText('OK sure');
    expect(counts.uppercase).toBe(2);
    expect(counts.letters).toBe(6);
    expect(counts.capsRatio).toBeCloseTo(2 / 6);
  });
});
