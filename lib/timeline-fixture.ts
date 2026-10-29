import { DEFAULT_SETTINGS } from './defaults';
import { simulateTimeline, type PipelineMeasurement, type SimPost } from './pipeline-sim';
import type { Settings } from './types';

/**
 * A synthetic home-timeline scroll, not a capture of X's virtualizer. Posts are
 * stacked down the page; the sim brings each one into the prefetch margin one
 * viewport before it would be seen. Jev is not called.
 */
export interface FixturePost {
  id: string;
  author: string;
  text: string;
  quotedText?: string;
  height: number;
  promoted?: boolean;
  hasImage?: boolean;
  hasVideo?: boolean;
  hasGif?: boolean;
}

const SHORT = 120;
const NORMAL = 210;
const TALL = 280;

export const FIXTURE_POSTS: FixturePost[] = [
  { id: 'short-1', author: '@maya', text: 'lol', height: SHORT },
  { id: 'short-2', author: '@maya', text: 'this', height: SHORT },
  { id: 'short-3', author: '@chris', text: 'so true', height: SHORT },
  { id: 'short-4', author: '@chris', text: 'congrats!', height: SHORT },
  { id: 'short-5', author: '@sam', text: 'same', height: SHORT },
  { id: 'short-6', author: '@sam', text: 'wow ok', height: SHORT },
  { id: 'short-7', author: '@sam', text: 'thanks', height: SHORT },
  { id: 'short-8', author: '@parent', text: 'agreed', height: SHORT },

  {
    id: 'allow-1',
    author: '@janedev',
    text: 'spent the afternoon tracking down a memory leak in the websocket handler. the close listener was never removed on reconnect.',
    height: TALL,
  },
  {
    id: 'allow-2',
    author: '@JaneDev',
    text: 'the coffee at this airport is genuinely offensive and I still have four hours before the gate opens up.',
    height: NORMAL,
  },
  {
    id: 'allow-3',
    author: '@janedev',
    text: 'shipping the pagination fix tonight. the cursor was opaque and the second page repeated the last row.',
    height: NORMAL,
  },

  { id: 'block-1', author: '@spamking', text: 'hi', height: SHORT },
  {
    id: 'block-2',
    author: '@SpamKing',
    text: 'join my private group for daily picks and a guaranteed approach to growing an account from nothing at all.',
    height: NORMAL,
  },

  {
    id: 'hash-1',
    author: '@launchday',
    text: 'launch day #build #ship #ai #growth #hustle #mindset for the timeline today',
    height: NORMAL,
  },
  {
    id: 'hash-2',
    author: '@launchday',
    text: 'another one #build #ship #ai #growth #hustle #mindset #crypto #alpha please engage',
    height: NORMAL,
  },

  {
    id: 'emoji-1',
    author: '@hype',
    text: `let's go ${'🔥'.repeat(10)}`,
    height: SHORT,
  },
  {
    id: 'emoji-2',
    author: '@hype',
    text: `we did it again friends ${'🚀'.repeat(12)} right now`,
    height: NORMAL,
  },

  {
    id: 'shout-1',
    author: '@caps',
    text: 'THIS IS COMPLETELY UNACCEPTABLE AND EVERYONE NEEDS TO STOP RIGHT NOW!!!!',
    height: NORMAL,
  },
  {
    id: 'shout-2',
    author: '@caps',
    text: 'WAKE UP PEOPLE THIS HAS GONE ON LONG ENOUGH AND NOBODY IS LISTENING!!!!',
    height: NORMAL,
  },

  {
    id: 'links-1',
    author: '@dumps',
    text: 'read https://a.example/1 https://b.example/2 https://c.example/3 https://d.example/4 before you reply',
    height: NORMAL,
  },

  {
    id: 'promo-1',
    author: '@brand',
    text: 'A paid placement with enough words that the short-post rule would not have caught it on its own.',
    height: TALL,
    promoted: true,
  },
  {
    id: 'promo-2',
    author: '@brand',
    text: 'Another promoted unit sitting between ordinary posts, long enough to be a real card.',
    height: NORMAL,
    promoted: true,
  },

  {
    id: 'model-1',
    author: '@researcher',
    text: 'New paper: speculative decoding gains collapse once the batch is large enough to saturate memory bandwidth.',
    height: TALL,
  },
  {
    id: 'model-2',
    author: '@historian',
    text: 'A thing people forget about the seventies oil shocks is that price controls made the queues worse than the embargo did.',
    height: TALL,
  },
  {
    id: 'model-3',
    author: '@founder',
    text: 'We are hiring two backend engineers in Berlin to work on Rust and Postgres. Remote inside the EU is fine.',
    height: NORMAL,
  },
  {
    id: 'model-4',
    author: '@parent',
    text: 'My daughter asked why the moon follows the car and I have been thinking about parallax ever since that drive.',
    height: NORMAL,
  },
  {
    id: 'model-5',
    author: '@takes',
    text: 'Most people trading time for money never notice the difference until the calendar is already full for months.',
    height: NORMAL,
  },
  {
    id: 'model-6',
    author: '@oncall',
    text: 'Imagine being this confident about a bug you have not reproduced yet. The logs tell a much quieter story.',
    height: NORMAL,
  },
  {
    id: 'model-7',
    author: '@shop',
    text: 'I made a small amount last month selling a notebook template and then spent it all on hosting and domain renewals.',
    height: NORMAL,
  },
  {
    id: 'model-8',
    author: '@notes',
    text: 'Early holders of random tokens are not a retirement plan, and a telegram link is not due diligence either.',
    height: NORMAL,
  },
  {
    id: 'model-9',
    author: '@release',
    text: 'The release notes buried the only breaking change under a paragraph about new icons, themes, and empty states.',
    height: TALL,
  },
  {
    id: 'model-10',
    author: '@queue',
    text: 'We measured four requests in flight and the slow tail was the timeout, not the score the model came back with.',
    height: NORMAL,
  },
  {
    id: 'model-11',
    author: '@reader',
    text: 'A reply that repeats the same point in different words is still a reply, and it was worth reading twice anyway.',
    height: NORMAL,
  },
  {
    id: 'model-12',
    author: '@city',
    text: 'The museum closed the wing with the sketches and left the gift shop open, which says plenty about the afternoon.',
    height: NORMAL,
  },
  {
    id: 'model-13',
    author: '@photos',
    text: 'Shot this from the back of the hall. The speaker went long and the questions afterwards were the better half.',
    height: TALL,
    hasImage: true,
  },
  {
    id: 'quote-1',
    author: '@quoter',
    text: 'this',
    quotedText:
      'The quoted post is long enough that the reply should still be read as a real post and sent to the model for a verdict.',
    height: TALL,
  },
];

export const FIXTURE_SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  allowlist: ['@janedev'],
  blocklist: ['@spamking'],
};

/** One viewport of margin, scrolling about one viewport a second. */
export const FIXTURE_SCENARIO = {
  viewportHeight: 900,
  prefetchMargin: 900,
  scrollSpeedPxPerSec: 1100,
};

export function layoutTimeline<T extends { height: number }>(
  posts: readonly T[],
  gap = 12,
): Array<T & { y: number }> {
  let y = 0;
  return posts.map((post) => {
    const placed = { ...post, y };
    y += post.height + gap;
    return placed;
  });
}

export function measureRecordedTimeline(): PipelineMeasurement {
  const posts: SimPost[] = layoutTimeline(FIXTURE_POSTS).map((post) => ({
    id: post.id,
    author: post.author,
    text: post.text,
    quotedText: post.quotedText,
    y: post.y,
    height: post.height,
    promoted: post.promoted,
    hasImage: post.hasImage,
    hasVideo: post.hasVideo,
    hasGif: post.hasGif,
  }));
  return simulateTimeline(posts, { ...FIXTURE_SCENARIO, settings: FIXTURE_SETTINGS });
}
