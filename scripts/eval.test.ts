import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baselineHides, styleDecision } from '../lib/detect/compare';
import { toSlopPost } from '../lib/provider';
import type { TweetInput } from '../lib/types';
import { SAMPLES } from './samples';

interface FixtureSample {
  baseline: { slop: number; ragebait: number; ads: number };
  style: Record<string, number>;
}

describe('recorded eval', () => {
  test('the style scorer beats the clean-twitter baseline on the labelled sample', () => {
    const file = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'jev-responses.json');
    const fixture = JSON.parse(readFileSync(file, 'utf8')) as { samples: FixtureSample[] };
    expect(fixture.samples).toHaveLength(SAMPLES.length);

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
      const wantHide = sample.label === 'junk';
      if (baselineHides(row.baseline) === wantHide) baselineCorrect++;
      if (styleDecision(row.style, toSlopPost(tweet), row.baseline).hides === wantHide) styleCorrect++;
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
    const replyStyle = styleDecision(fixture.samples[13]!.style, toSlopPost(replyTweet), fixture.samples[13]!.baseline);
    expect(baselineHides(fixture.samples[13]!.baseline)).toBe(false);
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
    expect(baselineHides(fixture.samples[14]!.baseline)).toBe(true);
    expect(styleDecision(fixture.samples[14]!.style, toSlopPost(humanTweet), fixture.samples[14]!.baseline).hides).toBe(
      false,
    );
  });
});