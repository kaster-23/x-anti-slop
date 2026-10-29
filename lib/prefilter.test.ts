import { describe, expect, test } from 'bun:test';
import { DEFAULT_SETTINGS } from './defaults';
import { simpleCountScorer, type HeuristicScorer } from './heuristics';
import { handleListed, localSignature, parseHandleList, prefilter, type PrefilterPost } from './prefilter';
import type { Settings } from './types';

function settings(patch: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...patch,
    signals: { ...DEFAULT_SETTINGS.signals, ...patch.signals },
    mediaFilters: { ...DEFAULT_SETTINGS.mediaFilters, ...patch.mediaFilters },
  };
}

function post(patch: Partial<PrefilterPost> = {}): PrefilterPost {
  return {
    author: '@someone',
    text: 'one two three four five six words here',
    ...patch,
  };
}

describe('handle lists', () => {
  test('matches handles with or without @ and regardless of case', () => {
    expect(handleListed('@JaneDev', ['janedev'])).toBe(true);
    expect(handleListed('janedev', ['@JaneDev'])).toBe(true);
    expect(handleListed('', ['janedev'])).toBe(false);
    expect(handleListed('@someone', [])).toBe(false);
  });

  test('parses a textarea of handles', () => {
    expect(parseHandleList('@a\n@b, @c\n\n')).toEqual(['@a', '@b', '@c']);
  });
});

describe('prefilter', () => {
  test('allowlist shows the post and does not consult the scorer', () => {
    let calls = 0;
    const scorer: HeuristicScorer = () => {
      calls++;
      return { filtered: true, reason: 'should not run' };
    };
    const decision = prefilter(
      post({ author: '@JaneDev', text: '#a #b #c #d #e #f pile of tags today' }),
      settings({ allowlist: ['janedev'], blocklist: ['@janedev'] }),
      scorer,
    );
    expect(decision).toEqual({ action: 'show', reason: 'Allowlisted', local: true });
    expect(calls).toBe(0);
  });

  test('blocklist hides even a one-word post', () => {
    expect(prefilter(post({ author: '@spamking', text: 'hi' }), settings({ blocklist: ['@SpamKing'] }))).toEqual({
      action: 'hide',
      reason: 'Blocked account',
      local: true,
    });
  });

  test('promoted and media rules hide before the short-post skip', () => {
    expect(prefilter(post({ text: 'hi', promoted: true }), settings({ hidePromoted: true }))).toEqual({
      action: 'hide',
      reason: 'Promoted',
      local: true,
    });
    expect(
      prefilter(post({ text: 'hi', hasGif: true }), settings({ mediaFilters: { images: false, videos: false, gifs: true } })),
    ).toEqual({ action: 'hide', reason: 'GIF post', local: true });
    expect(prefilter(post({ text: 'hi', hasImage: true }), settings())).toEqual({
      action: 'show',
      reason: 'Short post',
      local: true,
    });
  });

  test('skips posts under five words', () => {
    expect(prefilter(post({ text: 'one two three four' }), settings())).toEqual({
      action: 'show',
      reason: 'Short post',
      local: true,
    });
    expect(prefilter(post({ text: 'one two three four five' }), settings())).toEqual({ action: 'model' });
  });

  test('a short reply on a long quote still goes to the model', () => {
    expect(
      prefilter(
        post({
          text: 'this',
          quotedText: 'the quoted post has more than enough words to be worth a model call',
        }),
        settings(),
      ),
    ).toEqual({ action: 'model' });
  });

  test('obvious counts hide before the short-post skip', () => {
    const decision = prefilter(post({ text: `go ${'🔥'.repeat(10)}` }), settings());
    expect(decision.action).toBe('hide');
    if (decision.action === 'hide') expect(decision.reason).toMatch(/Emoji spam/);
  });

  test('a replacement scorer can settle either way', () => {
    const show: HeuristicScorer = () => ({ filtered: false, reason: 'Clearly human' });
    const hide: HeuristicScorer = () => ({ filtered: true, reason: 'Fitted score' });
    expect(prefilter(post(), settings(), show)).toEqual({
      action: 'show',
      reason: 'Clearly human',
      local: true,
    });
    expect(prefilter(post({ text: 'hi' }), settings(), hide)).toEqual({
      action: 'hide',
      reason: 'Fitted score',
      local: true,
    });
    expect(prefilter(post(), settings(), () => null)).toEqual({ action: 'model' });
  });

  test('the default scorer is the count scorer', () => {
    const tagged = 'day #a #b #c #d #e #f and more words besides';
    expect(prefilter(post({ text: tagged }), settings())).toEqual(
      prefilter(post({ text: tagged }), settings(), simpleCountScorer),
    );
  });
});

describe('localSignature', () => {
  test('changes when the blocklist changes and ignores handle order', () => {
    const base = localSignature(settings({ blocklist: ['@a', '@b'] }));
    expect(localSignature(settings({ blocklist: ['@b', '@A'] }))).toBe(base);
    expect(localSignature(settings({ blocklist: ['@a'] }))).not.toBe(base);
  });
});
