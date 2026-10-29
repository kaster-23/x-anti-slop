/**
 * Scores the labeled corpus with the on-device rules and the model thresholds.
 * No network. Prints precision and recall per preset, then per tag.
 *
 *   pnpm eval:rules
 */
import { FILTER_CORPUS, type CorpusPost, type Expectation } from '../test/fixtures/filter-corpus';
import { DEFAULT_SETTINGS } from '../lib/defaults';
import { presetPatch } from '../lib/presets';
import { decidePost, type RulePost } from '../lib/rule-decision';
import type { PresetId, Settings } from '../lib/types';

const PRESETS: PresetId[] = ['light', 'balanced', 'strict', 'zen'];

export interface PresetScore {
  preset: PresetId;
  precision: number;
  recall: number;
  hides: number;
  expectedHides: number;
  falsePositives: string[];
  falseNegatives: string[];
}

export function settingsFor(id: PresetId, legacy = false): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...presetPatch(id) };
  if (legacy && (id === 'balanced' || id === 'strict')) settings.hidePromoted = true;
  return settings;
}

function asRule(post: CorpusPost): RulePost {
  return {
    author: post.author ?? 'someone',
    text: post.text,
    promoted: post.promoted,
    hasImage: post.hasImage,
    hasVideo: post.hasVideo,
    hasGif: post.hasGif,
    autoHide: post.autoHide,
    model: post.model,
  };
}

export function scorePreset(id: PresetId, legacy = false): PresetScore {
  const settings = settingsFor(id, legacy);
  const falsePositives: string[] = [];
  const falseNegatives: string[] = [];
  let hides = 0;
  let expectedHides = 0;
  let truePositives = 0;
  for (const post of FILTER_CORPUS) {
    const rule = asRule(post);
    if (post.blocked) settings.blocklist = [post.author ?? 'spammer'];
    else settings.blocklist = [];
    const outcome = decidePost(rule, settings);
    const expected: Expectation = post.expect[id];
    if (expected === 'hide') expectedHides += 1;
    if (outcome.hide) hides += 1;
    if (outcome.hide && expected === 'hide') truePositives += 1;
    if (outcome.hide && expected === 'show') falsePositives.push(`${post.id} (${post.tag}: ${outcome.reason})`);
    if (!outcome.hide && expected === 'hide') falseNegatives.push(`${post.id} (${post.tag})`);
  }
  return {
    preset: id,
    precision: hides === 0 ? 1 : truePositives / hides,
    recall: expectedHides === 0 ? 1 : truePositives / expectedHides,
    hides,
    expectedHides,
    falsePositives,
    falseNegatives,
  };
}

export function scoreTag(id: PresetId, tag: string): { precision: number; recall: number } {
  const settings = settingsFor(id, false);
  let hides = 0;
  let expectedHides = 0;
  let truePositives = 0;
  for (const post of FILTER_CORPUS) {
    if (post.tag !== tag) continue;
    if (post.blocked) settings.blocklist = [post.author ?? 'spammer'];
    else settings.blocklist = [];
    const outcome = decidePost(asRule(post), settings);
    const expected = post.expect[id];
    if (expected === 'hide') expectedHides += 1;
    if (outcome.hide) hides += 1;
    if (outcome.hide && expected === 'hide') truePositives += 1;
  }
  return {
    precision: hides === 0 ? 1 : truePositives / hides,
    recall: expectedHides === 0 ? 1 : truePositives / expectedHides,
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function printTable(title: string, rows: PresetScore[]): void {
  console.log(`\n${title}`);
  console.log('preset     precision  recall  hides  expected');
  for (const row of rows) {
    console.log(
      `${row.preset.padEnd(10)} ${pct(row.precision).padStart(9)}  ${pct(row.recall).padStart(6)}  ${String(row.hides).padStart(5)}  ${String(row.expectedHides).padStart(8)}`,
    );
  }
}

export function mismatches(rows: PresetScore[]): string[] {
  return rows.flatMap((row) => [
    ...row.falsePositives.map((item) => `${row.preset} false positive ${item}`),
    ...row.falseNegatives.map((item) => `${row.preset} false negative ${item}`),
  ]);
}

const current = PRESETS.map((id) => scorePreset(id, false));
const legacy = PRESETS.map((id) => scorePreset(id, true));

console.log(`corpus ${FILTER_CORPUS.length} posts`);
printTable('After (content-judged promoted on Light, Balanced, and Strict; link dump at 5)', current);
printTable('Before (Balanced and Strict hid every promoted post)', legacy);

const tags = [...new Set(FILTER_CORPUS.map((post) => post.tag))];
console.log('\nPer tag, after, recall on Balanced / false positives on Light');
for (const tag of tags) {
  const balanced = scoreTag('balanced', tag);
  const light = scoreTag('light', tag);
  console.log(
    `${tag.padEnd(14)} balanced recall ${pct(balanced.recall)}  light precision ${pct(light.precision)}`,
  );
}

const problems = mismatches(current);
if (problems.length > 0) {
  console.log(`\n${problems.length} mismatches`);
  for (const line of problems.slice(0, 40)) console.log(line);
  process.exitCode = 1;
} else {
  console.log('\nEvery labeled post matches the preset that should hide or keep it.');
}
