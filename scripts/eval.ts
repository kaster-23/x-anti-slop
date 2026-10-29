/**
 * Compares the style scorer with the clean-twitter baseline on a small
 * labelled set.
 *
 *   TYPESAFE_API_KEY=... pnpm eval
 *   PROVIDER=openrouter OPENROUTER_API_KEY=... pnpm eval
 *
 * With no key, the script uses recorded answers in scripts/fixtures and says
 * so. It does not call the network in that mode.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baselineHides, styleDecision } from '../lib/detect/compare';
import { DEFAULT_SETTINGS } from '../lib/defaults';
import {
  buildBaselineQuestions,
  buildQuestions,
  buildState,
  callSystemOne,
  PROVIDERS,
  resolveModel,
  toSlopPost,
} from '../lib/provider';
import type { ProviderId, Settings, TweetInput } from '../lib/types';
import { SAMPLES, type Sample } from './samples';

interface FixtureSample {
  baseline: { slop: number; ragebait: number; ads: number };
  style: Record<string, number>;
}

interface FixtureFile {
  samples: FixtureSample[];
}

const provider = (process.env.PROVIDER ?? 'typesafe') as ProviderId;
const apiKey =
  provider === 'openrouter' ? process.env.OPENROUTER_API_KEY : process.env.TYPESAFE_API_KEY;

const settings: Settings = { ...DEFAULT_SETTINGS, provider };
const model = resolveModel(settings);

function tweetOf(sample: Sample, index: number): TweetInput {
  return {
    id: String(index),
    author: sample.tweet.author ?? '',
    authorName: '',
    text: sample.tweet.text,
    hasImage: false,
    hasVideo: false,
    isReply: sample.tweet.isReply ?? false,
    isQuote: false,
    parentText: sample.tweet.parentText,
  };
}

async function liveAnswers(sample: Sample, index: number): Promise<FixtureSample> {
  const tweet = tweetOf(sample, index);
  const post = toSlopPost(tweet);
  const [baselineRes, styleRes] = await Promise.all([
    callSystemOne({
      provider,
      apiKey: apiKey!,
      model,
      state: buildState(tweet),
      questions: buildBaselineQuestions(settings),
    }),
    callSystemOne({
      provider,
      apiKey: apiKey!,
      model,
      state: buildState(tweet),
      questions: buildQuestions(settings, post),
    }),
  ]);

  const baseline = { slop: 0, ragebait: 0, ads: 0 };
  for (const [key, answer] of Object.entries(baselineRes.answers)) {
    if (answer.type === 'noul' && (key === 'slop' || key === 'ragebait' || key === 'ads')) {
      baseline[key] = answer.noul;
    }
  }
  const style: Record<string, number> = {};
  for (const [key, answer] of Object.entries(styleRes.answers)) {
    if (key === 'ragebait' || key === 'ads' || key === 'quality') continue;
    if (answer.type === 'noul') style[key] = answer.noul;
    else if (answer.type === 'score') style[key] = answer.score / 3;
  }
  return { baseline, style };
}

function recordedAnswers(): FixtureSample[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, 'fixtures', 'jev-responses.json');
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as FixtureFile;
  if (parsed.samples.length !== SAMPLES.length) {
    throw new Error(`Fixture has ${parsed.samples.length} rows, samples has ${SAMPLES.length}.`);
  }
  return parsed.samples;
}

const live = Boolean(apiKey);
if (live) {
  console.log(`source: live ${PROVIDERS[provider].label}  model=${model}`);
  console.log('One post per request. Baseline and style are separate calls so the question sets do not mix.\n');
} else {
  console.log('source: recorded fixtures (no TYPESAFE_API_KEY or OPENROUTER_API_KEY)');
  console.log('scripts/fixtures/jev-responses.json — not live Jev output.\n');
}

const rows = live ? await Promise.all(SAMPLES.map(liveAnswers)) : recordedAnswers();

let baselineCorrect = 0;
let styleCorrect = 0;
const lines: string[] = [];

rows.forEach((row, i) => {
  const sample = SAMPLES[i]!;
  const post = toSlopPost(tweetOf(sample, i));
  const baseHide = baselineHides(row.baseline, settings);
  const style = styleDecision(row.style, post, row.baseline, settings);
  const wantHide = sample.label === 'junk';
  const baseOk = baseHide === wantHide;
  const styleOk = style.hides === wantHide;
  if (baseOk) baselineCorrect++;
  if (styleOk) styleCorrect++;
  const mark = `${baseOk ? 'ok' : 'MISS'}/${styleOk ? 'ok' : 'MISS'}`;
  lines.push(
    `${mark.padEnd(9)} ${sample.label.padEnd(4)}  ` +
      `base=${baseHide ? 'HIDE' : 'keep'}  style=${style.hides ? 'HIDE' : 'keep'}` +
      `${style.botReply ? ' bot' : '    '}  ` +
      `slop ${row.baseline.slop.toFixed(2)} → ${style.slop.toFixed(2)}  ` +
      `${sample.tweet.text.replace(/\s+/g, ' ').slice(0, 42)}…`,
  );
});

console.log('base/style  label  decisions');
console.log(lines.join('\n'));
console.log(
  `\nbaseline ${baselineCorrect}/${SAMPLES.length}   style scorer ${styleCorrect}/${SAMPLES.length}`,
);
if (!live) {
  console.log('Re-run with a Jev key to score this set against the live API.');
}
