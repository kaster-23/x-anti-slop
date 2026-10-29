import type { TweetInput } from '../lib/types';

export type SampleLabel = 'junk' | 'keep';

export interface Sample {
  label: SampleLabel;
  tweet: Partial<TweetInput> & { text: string };
}

/** The clean-twitter labelled set, plus two posts the broad slop question mishandles. */
export const SAMPLES: Sample[] = [
  { label: 'junk', tweet: { author: '@grindsetdaily', text: "Most people will never be rich.\n\nHere's why 🧵\n\n1/ They trade time for money.\n2/ They don't understand leverage.\n3/ They fear discomfort.\n\nRead that again." } },
  { label: 'junk', tweet: { author: '@hustlequotes', text: 'Discipline > motivation.\n\nAgree?' } },
  { label: 'junk', tweet: { author: '@newsrage', text: 'BREAKING: They are LITERALLY coming for your children. Every single one of these people needs to be held accountable NOW. RT IF YOU AGREE 🚨🚨🚨' } },
  { label: 'junk', tweet: { author: '@takesguy', text: 'Imagine being this stupid. Absolute clown. The replies are going to be full of people defending this because they have no principles whatsoever.' } },
  { label: 'junk', tweet: { author: '@shopdeals', text: 'I made $8,400 last month with this ONE simple dropshipping tool. Link in bio. Only 3 spots left at this price 👇 #ad' } },
  { label: 'junk', tweet: { author: '@cryptomoon', text: '🚀 $PEPE2 is about to 100x. Early holders are going to make life changing money. Join the telegram before it is too late. NFA DYOR' } },
  // A real promoted post. The pitch sits in the image, so the text only scores
  // around 0.65 on ads. X's own Ad label catches it before any model call.
  { label: 'junk', tweet: { author: '@IMTRADERfx01', text: "🇮🇳 Indian Forex Traders\nAnybody who's locked in trading?\nI've an Indian WhatsApp group with quality people. I invite all those who want to join and share their experience and valuable insights.\nWe don't tolerate anything other than trading. Requesting serious people to kindly DM." } },

  { label: 'keep', tweet: { author: '@janedev', text: "spent the afternoon tracking down a memory leak in our websocket handler. turned out we were never removing the 'close' listener on reconnect. 40 lines of diff, 2GB of RSS saved." } },
  { label: 'keep', tweet: { author: '@sam', text: 'the coffee at this airport is genuinely offensive and i have 4 hours to go' } },
  { label: 'keep', tweet: { author: '@researcher', text: 'New paper: we show that speculative decoding gains collapse once batch size exceeds ~32, because the verification step saturates memory bandwidth. Code and benchmarks linked below.' } },
  { label: 'keep', tweet: { author: '@historian', text: 'A thing people forget about the 1970s oil shocks: the queues at petrol stations were mostly a rationing artefact, not a supply one. The US price controls made shortages worse than the embargo did.' } },
  { label: 'keep', tweet: { author: '@founder', text: "We're hiring two backend engineers in Berlin. Rust and Postgres, mostly. Remote within EU is fine. DMs open if you want to know what the work actually looks like." } },
  { label: 'keep', tweet: { author: '@parent', text: 'my daughter just asked why the moon follows the car and I have been thinking about parallax for twenty minutes' } },

  // A reply bot echoing the parent. The broad slop question stays under 0.7.
  // The style score lands between the reply-bot bar and the normal bar.
  {
    label: 'junk',
    tweet: {
      author: '@replybot',
      isReply: true,
      parentText: 'We shipped the ranking model after the index rebuild yesterday.',
      text: 'We shipped the ranking model after the index rebuild yesterday.',
    },
  },
  // Emphatic repetition and a typed laugh. The broad question calls it slop.
  {
    label: 'keep',
    tweet: {
      author: '@ada',
      text: 'Opus is way, way, way better than the last one. sorry, try this build lmao',
    },
  },
];
