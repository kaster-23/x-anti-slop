// Ported from slop-filter (https://github.com/adamnroman/slop-filter).
// Copyright (c) 2026 Adam Roman. MIT License. See LICENSE-third-party.
//
// The tells and their examples come from the unpolish-ai-writing skill
// (https://github.com/wilu222/unpolish-ai-writing), Copyright (c) 2026 wilu222,
// MIT License, via slop-filter's adaptation. Circumvention questions are
// slop-filter's own.
//
// Jev question types (https://docs.typesafe.ai/primitives, checked 29 Oct 2026):
//   noul   — yes/no, answer is P(yes). Used for every tell that is either present or not.
//   score  — a position on ordered levels. Used for sentence rhythm, which is a spectrum.
//   choice — one option from an unordered set. None of these tells are an unordered set,
//            so this bank does not send a choice question.

export interface SlopPost {
  text: string;
  parentText?: string;
  isReply?: boolean;
}

export interface NoulStyleQuestion {
  type: 'noul';
  instructions: string;
  criteria?: { true: string; false: string };
}

export interface ScoreStyleQuestion {
  type: 'score';
  instructions: string;
  criteria: string[];
}

interface StyleMeta {
  /** Asked only when the replied-to post is in the state. */
  needsParent?: boolean;
  /** About keys and punctuation. Posts are typed; transcripts would skip these. */
  typedOnly?: boolean;
}

export type StyleQuestion = (NoulStyleQuestion | ScoreStyleQuestion) & StyleMeta;

// Each question is one narrow, literal judgment. Jev reads the words as written, so
// every instruction names the exact pattern and gives examples of it.
// Score levels run from least to most AI-like, so every feature points the same way.
export const STYLE_QUESTIONS: Record<string, StyleQuestion> = {
  reads_as_model: {
    type: 'noul',
    instructions:
      'Judging only how `post.text` is written, not what it says: does its prose read like a language model wrote it?',
    criteria: {
      true: 'Smooth and evenly paced, with staged pivots, an assistant-like tone, and tidy structure in a place where people write casually.',
      false:
        'Reads typed by a person: uneven rhythm, loose punctuation, abrupt turns, repeated words, or sentences that trail off. Being generic, unoriginal, or repetitive does not make it true.',
    },
  },

  assistant_residue: {
    type: 'noul',
    instructions:
      "Does `post.text` contain chatbot leftovers, such as 'Certainly!', 'Happy to help!', 'Hope this helps!', 'As an AI', 'I should be clear that', or a line that narrates its own drafting?",
  },
  sycophantic_opener: {
    type: 'noul',
    instructions:
      "Does `post.text` open with flattery or a praise loop before saying anything of its own, such as 'Great question', 'Love this', 'What a fantastic breakdown', or 'This is such an important point'?",
  },
  contrast_pivot: {
    type: 'noul',
    instructions:
      'Does `post.text` use the rhetorical pivot where the writer raises a framing nobody proposed only to reject it, in any order, such as "It\'s not X, it\'s Y", \'X, not Y\', \'Y instead of X\', \'less X, more Y\', \'stops being X and becomes Y\', or stacked negations like "Not A. Not B. Just C."?',
    criteria: {
      true: "The rejected half is a framing the writer invented to sharpen the point, such as 'something a human can re-run, not a green check the agent wrote for itself' or 'a failure-modeling exercise instead of a code-coverage ritual'.",
      false: "No such move. A comparison ('A is way better than B'), a recommendation ('sorry about that one, try this one'), a preference, a correction of a fact or of something the writer or another person actually said ('the meeting is at 3, not 2'), or plain negation ('this does not work') is not a pivot.",
    },
  },
  pivot_answers_parent: {
    type: 'noul',
    needsParent: true,
    instructions:
      "`post.text` may reject an alternative, as in 'X, not Y' or \"it's not Y, it's X\". Is the rejected alternative, the Y, something that `parent.text` actually says, argues, or clearly implies?",
    criteria: {
      true: '`parent.text` states or clearly implies the rejected idea, so `post.text` is pushing back on something that was said.',
      false: '`parent.text` does not say or imply it, so the writer raised the alternative themselves. Also false when `post.text` rejects nothing.',
    },
  },

  compressed_coinage: {
    type: 'noul',
    instructions:
      "Does `post.text` pack an idea into a two or three word noun phrase and use it as if it were an established term, such as 'keep rate', 'review-rejection rate', 'pass rate' for whether tests pass, 'trust debt', 'decision latency', or 'context rot'?",
    criteria: {
      true: "A compact noun phrase stands in for a whole idea the writer never spells out, and it is not a term in common use. A person would say the idea: 'how much of the code is still there a week later', not 'keep rate'.",
      false: 'The nouns are ordinary words used plainly, or the phrase is a real established term in that field, such as a product name, a job title, or a well-known metric.',
    },
  },
  frame_presupposition: {
    type: 'noul',
    instructions:
      "Does `post.text` refer to a set, a half, or a frame the reader was never shown, such as 'the missing one is...', 'the other half is...', 'the real question is...', 'the part nobody talks about is...', or 'the second problem is...' with no first?",
    criteria: {
      true: 'The phrase presupposes a list, a pair, or a framing that appears nowhere in the post, so it does not make sense on a plain reading.',
      false: 'The set or frame it refers to is in the post, or in an earlier sentence, so the reference makes sense.',
    },
  },
  spotlight_formula: {
    type: 'noul',
    instructions:
      "Does `post.text` single out one detail with a casual-sounding praise formula, such as 'is the part that jumps out', \"is the part I'd steal\", 'is the underrated bit', 'is doing a lot of work here', 'is the real story', or 'is what stands out'?",
  },

  announced_insight: {
    type: 'noul',
    instructions:
      "Does `post.text` label its own point as an insight before or while making it, such as 'This is a useful inversion:', 'The catch is...', 'The hard part is...', 'The trick is...', 'The key insight:', \"Here's the shift:\", or 'The real unlock is...'?",
    criteria: {
      true: 'A phrase frames what follows as the catch, the trick, the hard part, the shift, the inversion, the takeaway, or the unlock.',
      false: 'It just says the thing with no such framing, or the word is literal, such as a catch in a contract or a hard part of a physical object.',
    },
  },
  invented_label: {
    type: 'noul',
    instructions:
      "Does `post.text` coin a label or a metaphor and use it as if it were established, such as 'the X paradox', 'the X trap', 'the X tax', 'the X gap', or a fresh metaphor treated as a known category, such as 'pass rates and shipping are different games'?",
  },
  stakes_inflation: {
    type: 'noul',
    instructions:
      "Does `post.text` frame something small as enormous, such as 'this changes everything', 'the future of work', or a minor update described as a turning point for an industry?",
  },
  vague_authority: {
    type: 'noul',
    instructions:
      "Does `post.text` lean on unnamed authorities, such as 'experts say', 'studies show', 'research suggests', or 'many believe', without naming who?",
  },
  parallel_triad: {
    type: 'noul',
    instructions:
      'Does `post.text` contain three items in a row that share the same grammatical skeleton, such as three short clauses, three verb phrases, or three "It\'s X" beats?',
    criteria: {
      true: "Three parallel beats built for rhythm, such as 'Ship faster. Learn faster. Win faster.' or 'It saves time, cuts cost, and builds trust.'",
      false: 'No such triple, or a plain inventory of nouns, such as a shopping list or a list of ingredients.',
    },
  },
  verbless_fragments: {
    type: 'noul',
    typedOnly: true,
    instructions:
      "Does `post.text` use noun or adjective fragments in place of full sentences, with no subject and no verb, such as 'Less busywork. More impact.' or 'Porcelain-enameled kettle.'?",
  },
  uniform_cadence: {
    type: 'score',
    instructions: 'How uniform and scripted is the sentence rhythm of `post.text`?',
    criteria: [
      'Uneven: a mix of long and short sentences, run-ons, loose fragments, or typos.',
      'Mostly natural, with some variety in length and structure.',
      'Even: sentences of similar length with clean, consistent grammar.',
      'Scripted: every sentence is a similar length and shape, with parallel structure so clean it reads rehearsed in a casual setting.',
    ],
  },

  synonym_cycling: {
    type: 'noul',
    instructions:
      "Does `post.text` rotate through synonyms for the same thing instead of repeating the clearest word, such as 'developers... engineers... practitioners... builders'?",
  },
  manufactured_punchlines: {
    type: 'noul',
    instructions:
      'Does `post.text` contain three or more same-shaped short beats in a row, such as standalone micro-sentences or one-line paragraphs stacked for dramatic rhythm?',
  },
  subject_drop: {
    type: 'noul',
    instructions:
      "Does `post.text` recap events in clauses with the first-person subject missing, such as 'Made the call. Fixed the bug. Went home.'?",
  },
  engagement_close: {
    type: 'noul',
    instructions:
      "Does `post.text` end by fishing for replies with a generic prompt, such as 'Curious if anyone...', 'Would love to hear how others...', 'What do you think?', 'Anyone else seeing this?', or 'Thoughts?'",
  },
  bow_tie_closer: {
    type: 'noul',
    instructions:
      'Does `post.text` end on a signposted wrap-up or a tidy bow, such as \'In conclusion\', \'At the end of the day\', "That\'s it. That\'s the post.", "That\'s the update.", or an empty tail like \'and that matters\'?',
  },
  paint_words: {
    type: 'noul',
    instructions:
      "Does `post.text` use significance paint or promotional filler: words that add importance and no information, such as 'quietly' changing something, 'deeply' integrated, 'fundamentally', 'remarkably', 'genuinely', a 'landscape' of something, 'robust', or something that 'landed'?",
    criteria: {
      true: 'At least one such word is used for emphasis or as a metaphor, and the sentence would say the same thing without it.',
      false: 'None are present, or each is literal, such as a robust test suite in a technical sense, a plane that landed, or a painted landscape.',
    },
  },

  invented_words: {
    type: 'noul',
    instructions:
      "Does `post.text` use a made-up word or spelling that no dictionary or field has, such as 'jestermaxx', 'jevmaxx', suffix play like '-maxx', '-pilled', or '-core', a portmanteau, a deliberately mangled spelling, or an absurd compound like 'slop-infrastructuring'?",
    criteria: {
      true: 'At least one word is invented, and it reads playful, absurd, clumsy, or in-jokey. That is how a person coins a word.',
      false: "Every word is real, or the only coinage is a tidy, plausible term used straight, such as 'keep rate' or 'decision latency'. That is how a model coins a word, and it is not a human tell.",
    },
  },
  emphatic_repetition: {
    type: 'noul',
    instructions:
      "Does `post.text` repeat a word for emphasis, such as 'way, way, way better', 'no no no', 'so so good', 'very very slow', or 'never ever'?",
  },
  stretched_typing: {
    type: 'noul',
    typedOnly: true,
    instructions:
      "Does `post.text` show expression through the typing itself: stretched letters ('soooo', 'nooo', 'yesss'), a stack of punctuation ('!!!', '???', '?!'), shouted caps on a word or two ('this is INSANE'), or a laugh typed out ('lol', 'lmao', 'lmfao', 'haha', 'hahaha')?",
    criteria: {
      true: 'At least one of these is present and reads as the writer expressing themselves through how the words are typed.',
      false: "None present. Casual vocabulary alone, such as 'tbh', 'ngl', 'honestly', or 'kinda', does not count: that is word choice, and models use it when told to sound casual.",
    },
  },
  human_slips: {
    type: 'noul',
    typedOnly: true,
    instructions:
      "Does `post.text` contain a slip a person leaves and a model does not: a typo, a missing or doubled word, a mid-sentence self-correction ('wait, no', 'I mean', 'sorry, I meant'), a trailing thought ('idk', 'anyway'), or a sentence that gives up halfway?",
  },
  humor: {
    type: 'noul',
    instructions:
      "Is `post.text` making a joke: sarcasm, absurdity, deadpan exaggeration, a pun, a meme format used as a meme such as 'born to X, forced to Y' or 'nobody: / me:', or a coinage whose whole point is to be funny?",
    criteria: {
      true: 'The post is trying to be funny and the humor is its own, not a quoted joke. Dry or deadpan counts.',
      false: "It is earnest, or the only lightness is a lone 'lol' or an emoji stuck on a serious sentence.",
    },
  },
  firsthand_specifics: {
    type: 'noul',
    instructions:
      'Does `post.text` state a concrete firsthand detail only its writer would know, such as something they did or saw, a number they measured, a named person, place, tool, or date from their own experience?',
    criteria: {
      true: "A detail from the writer's own life or work, stated as their own: 'our build broke twice on Friday', 'I paid $14 for it', 'my cousin in Leeds'.",
      false: 'Only general statements, or specifics that could have been copied from the post it replies to or from common knowledge.',
    },
  },
  unpolished_prose: {
    type: 'noul',
    typedOnly: true,
    instructions:
      'Is `post.text` unpolished in a way a person leaves and a model does not: uneven rhythm, a run-on, a sentence that trails off or gives up, no closing line, or lowercase with loose or missing punctuation?',
    criteria: {
      true: 'The text was typed and not edited: it wanders, stops short, or ignores punctuation, and no part of it is tidy.',
      false: 'The text is clean throughout, or its casualness is a surface over exact punctuation and tidy phrasing.',
    },
  },

  colon_semicolon_pivot: {
    type: 'noul',
    typedOnly: true,
    instructions:
      'Does `post.text` use a colon or a semicolon to stage a reveal or to join two clauses, where an em dash would otherwise go, such as "Here\'s the thing: it works", \'The result: fewer bugs\', or \'Speed is easy; trust is hard\'?',
    criteria: {
      true: 'A colon or semicolon does rhetorical work between clauses. People rarely punctuate casual posts this way.',
      false: 'No colon or semicolon, or only ordinary uses: a time, a ratio, a URL, an emoticon, a label before a link, or a colon before a list of items.',
    },
  },
  performed_casualness: {
    type: 'noul',
    typedOnly: true,
    instructions:
      "Does `post.text` bolt casual markers onto prose that is otherwise precise, such as a lone 'lol', 'tbh', or 'ngl' on a polished paragraph, an emoji dropped at the end of a formal sentence, or all-lowercase text whose punctuation, terminology, and phrasing are exact?",
    criteria: {
      true: "The casual surface hides careful writing: every comma and colon is placed correctly, the terms are precise, and the phrasing is tidy, as in 'evals measure pass rate. the missing one is keep rate: how much generated code survives the week.'",
      false: 'The text is casual through and through: loose punctuation, slang used naturally, run-ons, or slips, or it is plain formal prose with no casual markers.',
    },
  },
};

/**
 * Every style question, in one map, so the caller can send them in one Jev
 * request. A 30-question call is the same warm latency as a 3-question call.
 * `post` is unused for selection: the parent question goes out even when the
 * replied-to text is missing, and the scorer ignores that answer in that case.
 */
export function buildStyleQuestions(
  post: SlopPost = { text: '' },
): Record<string, NoulStyleQuestion | ScoreStyleQuestion> {
  // The bank does not shrink per post. `post` is accepted so callers pass the
  // tweet they are about to score in the same request.
  void post;
  const questions: Record<string, NoulStyleQuestion | ScoreStyleQuestion> = {};
  for (const [id, question] of Object.entries(STYLE_QUESTIONS)) {
    const body = { ...question };
    delete body.needsParent;
    delete body.typedOnly;
    questions[id] = body;
  }
  return questions;
}

export function styleQuestionCount(post: SlopPost = { text: '' }): number {
  return Object.keys(buildStyleQuestions(post)).length;
}
