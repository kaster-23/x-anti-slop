// Ported from slop-filter (https://github.com/adamnroman/slop-filter).
// Copyright (c) 2026 Adam Roman. MIT License. See LICENSE-third-party.
//
// Word tiers are slop-filter's adaptation of the "Words and phrases to replace"
// tables in unpolish-ai-writing (https://github.com/wilu222/unpolish-ai-writing),
// Copyright (c) 2026 wilu222, MIT License. Template counts below are original to
// this port: exact shapes a regex can see, combined with the other local counts.

// Each entry is a regex source that also matches the inflected forms.
const ALWAYS = [
  'delv(?:e|es|ed|ing)',
  'div(?:e|es|ed|ing) deep',
  'deep div(?:e|es)',
  'tapestr(?:y|ies)',
  'embark(?:s|ed|ing)?',
  'leverag(?:e|es|ed|ing)',
  'utili[sz](?:e|es|ed|ing)',
  'seamless(?:ly)?',
  'nestled',
  'showcas(?:e|es|ed|ing)',
  'testament to',
  'game[- ]chang(?:er|ers|ing)',
  'groundbreaking',
  'revolutionary',
  'cutting[- ]edge',
  'in order to',
  'serv(?:es|ed|ing)? as',
  'stand(?:s|ing)? as',
  'moreover',
  'furthermore',
  'additionally',
  'at its core',
  "it(?:'|’)s important to note",
  'amidst',
  'load[- ]bearing',
  'realms?',
  'meticulous(?:ly)?',
  'intricate',
  'intricac(?:y|ies)',
  'ever[- ]evolving',
  'impactful',
  'paradigms?',
  'comprehensive',
  'pivotal',
  'underscor(?:e|es|ed|ing)',
  'unpack(?:s|ed|ing)?',
  'holistic',
  'actionable',
  'synerg(?:y|ies)',
];

// A tell only when two or more sit together.
const CLUSTER = [
  'harness(?:es|ed|ing)?',
  'foster(?:s|ed|ing)?',
  'streamlin(?:e|es|ed|ing)',
  'empower(?:s|ed|ing)?',
  'crucial',
  'myriad',
  'plethora',
  'facilitat(?:e|es|ed|ing)',
  'enhanc(?:e|es|ed|ing)',
  'resonat(?:e|es|ed|ing)',
];

// A tell only when the text is soaked in them.
const DENSITY = [
  'significant(?:ly)?',
  'innovative',
  'compelling',
  'remarkable',
  'noteworthy',
  'interesting',
];

const CLUSTER_MIN_HITS = 2;
const DENSITY_MIN_HITS = 2;
// "Soaked" is about 3% of the words.
const DENSITY_SOAKED_SHARE = 0.03;
// One always-tier word is a nudge. Two is the full signal.
const ALWAYS_FULL_HITS = 2;

const matcher = (sources: string[]) => new RegExp(`\\b(?:${sources.join('|')})\\b`, 'gi');
const TIER = {
  ALWAYS: matcher(ALWAYS),
  CLUSTER: matcher(CLUSTER),
  DENSITY: matcher(DENSITY),
};

const hits = (text: string, regex: RegExp) => (text.match(regex) ?? []).length;

export function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;
}

// Phrase-level templates. A stack of short lines or a numbered thread counts once,
// so a single habit is a nudge and two different habits are the full signal.
const PHRASE_TEMPLATES: RegExp[] = [
  /\bread that again\b/i,
  /\blet that sink in\b/i,
  /\bhere(?:'|’)?s (?:why|the thing|what)\b/i,
  /\b(?:unpopular opinion|hot take)\b/i,
  /\bagree\s*\?/i,
  /\bthoughts\s*\?/i,
  /\bmost people (?:will|won't|don’t|don't)\b/i,
  /\bnot\b[^.!?\n]{0,48}[.]\s*not\b[^.!?\n]{0,48}[.]\s*just\b/i,
];

function templateHits(text: string): number {
  let count = 0;
  for (const pattern of PHRASE_TEMPLATES) {
    if (pattern.test(text)) count++;
  }
  const numbered = text.match(/(?:^|\n)\s*\d+\s*[/.)]\s+\S/g);
  if ((numbered?.length ?? 0) >= 2) count++;
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const short = lines.filter((line) => line.length <= 42 && line.split(/\s+/).length <= 6);
  if (short.length >= 3) count++;
  return count;
}

const COLON_PIVOT = /[\p{L}\p{N})"'’]:\s+\p{L}/gu;
const COLON_FULL_HITS = 2;
const TEMPLATE_FULL_HITS = 2;

/** Local counts. Every value is on 0..1. These never call Jev. */
export function localFeatures(text: string): Record<string, number> {
  const withoutUrls = text.replace(/https?:\/\/\S+/g, '');
  return {
    em_dash: text.includes('—') ? 1 : 0,
    spaced_hyphen_dash: /\p{L}\s(?:-|--|–)\s\p{L}/u.test(text) ? 1 : 0,
    semicolon: /\p{L};\s/u.test(text) ? 1 : 0,
    colon_clauses: Math.min(1, (text.match(COLON_PIVOT) ?? []).length / COLON_FULL_HITS),
    curly_quotes: /[‘’“”]/.test(text) ? 1 : 0,
    repeated_word: /\b(\p{L}+)(?:[\s,]+\1\b){2,}/iu.test(text) ? 1 : 0,
    stretched_letters: /\b\p{L}*([a-z])\1{2,}\p{L}*\b/iu.test(withoutUrls) ? 1 : 0,
    stacked_punctuation: /[!?]{2,}/.test(text) ? 1 : 0,
    typed_laugh: /\b(?:lo+l|lmf?ao+|rofl|ha(?:ha)+h?|hehe+)\b/i.test(text) ? 1 : 0,
    vocab_always: Math.min(1, hits(text, TIER.ALWAYS) / ALWAYS_FULL_HITS),
    vocab_cluster: hits(text, TIER.CLUSTER) >= CLUSTER_MIN_HITS ? 1 : 0,
    vocab_density: (() => {
      const count = hits(text, TIER.DENSITY);
      if (count < DENSITY_MIN_HITS) return 0;
      return Math.min(1, count / Math.max(1, wordCount(text)) / DENSITY_SOAKED_SHARE);
    })(),
    template_structure: Math.min(1, templateHits(text) / TEMPLATE_FULL_HITS),
  };
}
