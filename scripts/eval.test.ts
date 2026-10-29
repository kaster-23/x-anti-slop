import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baselineHides, baselineScoresFrom, styleDecision } from '../lib/detect/compare';
import { toSlopPost } from '../lib/provider';
import type { TweetInput } from '../lib/types';
import { evalModeFromEnv, LIVE_EVAL_COMMAND } from './eval-mode';
import { SAMPLES } from './samples';

interface NoulFixture {
  type: 'noul';
  noul: number;
}
interface ScoreFixture {
  type: 'score';
  score: number;
  confidence?: number;
}
interface JevFixture {
  model: string;
  answers: Record<string, NoulFixture | ScoreFixture>;
  usage: { input_tokens: number; output_tokens: number };
}
interface FixtureSample {
  baseline: JevFixture;
  style: JevFixture;
}

describe('eval mode', () => {
  test('stays on recorded answers unless TYPESAFE_API_KEY is set', () => {
    expect(evalModeFromEnv({})).toEqual({ live: false });
    expect(evalModeFromEnv({ TYPESAFE_API_KEY: '   ' })).toEqual({ live: false });
    expect(evalModeFromEnv({ TYPESAFE_API_KEY: 'apikey_test' })).toEqual({
      live: true,
      provider: 'typesafe',
      apiKey: 'apikey_test',
    });
    expect(LIVE_EVAL_COMMAND).toBe('TYPESAFE_API_KEY=… pnpm eval');
  });
});

describe('recorded eval', () => {
  test('the style scorer beats the clean-twitter baseline on the labelled sample', () => {
    const file = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'jev-responses.json');
    const fixture = JSON.parse(readFileSync(file, 'utf8')) as { samples: FixtureSample[] };
    expect(fixture.samples).toHaveLength(SAMPLES.length);
    for (const row of fixture.samples) {
      expect(row.baseline.model).toBe('jev-1.14.0');
      expect(row.style.model).toBe('jev-1.14.0');
      expect(row.style.usage.input_tokens).toBe(1070);
      for (const answer of [...Object.values(row.baseline.answers), ...Object.values(row.style.answers)]) {
        if (answer.type === 'noul') expect(answer).not.toHaveProperty('confidence');
        if (answer.type === 'score') expect(answer.score).toBeLessThanOrEqual(3);
      }
    }

    let baselineCorrect = 0;
    let styleCorrect = 0;
    fixture.samples.forEach((row, i) => {
      const sample = SAMPLES[i]!;
      const tweet: TweetInput = {
        id: String(i),
        author: sample.tweet.author ?? '',
        authorName: '',
        text: sample.tweet.text,
        hasImage: false,
        hasVideo: false,
        isReply: sample.tweet.isReply ?? false,
        isQuote: false,
        parentText: sample.tweet.parentText,
      };
      const baseline = baselineScoresFrom(row.baseline.answers);
      const wantHide = sample.label === 'junk';
      if (baselineHides(baseline) === wantHide) baselineCorrect++;
      if (styleDecision(row.style.answers, toSlopPost(tweet), baseline).hides === wantHide) styleCorrect++;
    });

    expect(styleCorrect).toBe(SAMPLES.length);
    expect(styleCorrect).toBeGreaterThan(baselineCorrect);

    const reply = SAMPLES[13]!;
    const replyTweet: TweetInput = {
      id: '13',
      author: reply.tweet.author ?? '',
      authorName: '',
      text: reply.tweet.text,
      hasImage: false,
      hasVideo: false,
      isReply: true,
      isQuote: false,
      parentText: reply.tweet.parentText,
    };
    const replyBaseline = baselineScoresFrom(fixture.samples[13]!.baseline.answers);
    const replyStyle = styleDecision(fixture.samples[13]!.style.answers, toSlopPost(replyTweet), replyBaseline);
    expect(baselineHides(replyBaseline)).toBe(false);
    expect(replyStyle.hides).toBe(true);
    expect(replyStyle.botReply).toBe(true);
    expect(replyStyle.slop).toBeGreaterThanOrEqual(0.55);
    expect(replyStyle.slop).toBeLessThan(0.7);

    const human = SAMPLES[14]!;
    const humanTweet: TweetInput = {
      id: '14',
      author: human.tweet.author ?? '',
      authorName: '',
      text: human.tweet.text,
      hasImage: false,
      hasVideo: false,
      isReply: false,
      isQuote: false,
    };
    const humanBaseline = baselineScoresFrom(fixture.samples[14]!.baseline.answers);
    expect(baselineHides(humanBaseline)).toBe(true);
    expect(styleDecision(fixture.samples[14]!.style.answers, toSlopPost(humanTweet), humanBaseline).hides).toBe(false);
  });
});