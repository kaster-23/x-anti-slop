import type { PresetId } from '../../lib/types';
import type { ModelReading } from '../../lib/rule-decision';

export type Expectation = 'hide' | 'show';

export interface CorpusPost {
  id: string;
  tag: string;
  text: string;
  author?: string;
  promoted?: boolean;
  /** Expected pill at the default 50% floor, with the label on and hide off. */
  pill?: boolean;
  hasImage?: boolean;
  hasVideo?: boolean;
  hasGif?: boolean;
  isReply?: boolean;
  parentText?: string;
  autoHide?: boolean;
  blocked?: boolean;
  model?: ModelReading;
  expect: Record<PresetId, Expectation>;
}

type ExpectMap = Record<PresetId, Expectation>;

const SHOW: ExpectMap = { light: 'show', balanced: 'show', strict: 'show', zen: 'show' };
const ALL: ExpectMap = { light: 'hide', balanced: 'hide', strict: 'hide', zen: 'hide' };
const NOT_LIGHT: ExpectMap = { light: 'show', balanced: 'hide', strict: 'hide', zen: 'hide' };
const STRICT_UP: ExpectMap = { light: 'show', balanced: 'show', strict: 'hide', zen: 'hide' };
const ZEN: ExpectMap = { light: 'show', balanced: 'show', strict: 'show', zen: 'hide' };

function post(
  id: string,
  tag: string,
  text: string,
  expect: ExpectMap,
  extra: Partial<CorpusPost> = {},
): CorpusPost {
  return { id, tag, text, expect, ...extra };
}

function reading(partial: ModelReading): ModelReading {
  return { slop: 0.05, ragebait: 0.05, ads: 0.05, quality: 2.4, ...partial };
}

const obviousSlop = [
  "Let's unpack this. The real lesson is not the tool. It is the mindset. Most people are not ready. Agree?",
  'Here is the thing nobody tells you. Success is a system. Save this. Follow for part two tomorrow.',
  "Great question. Let me break this down. Step one, believe. Step two, execute. Step three, win. You're welcome.",
  'This changes everything. The tapestry of modern work is a nuanced paradigm. Delve in and repost if it landed.',
  'Not gonna lie: the framework that actually matters is consistency. Drop a yes if you needed this today.',
  '7 things I learned about focus. Wake up early. Drink water. Win the morning. Agree? Follow for the thread.',
  'Hot take. Most people are stuck because they consume and never ship. Read that again. Bookmark this.',
  'The uncomfortable truth: your calendar is a reflection of your priorities. Let that sink in. Part two soon.',
  'I asked the model to explain leadership and this is the answer. Elevate. Align. Execute. Share if useful.',
  'Stop scrolling. The winners all do this one thing. They decide. Then they act. Then they iterate. Simple.',
  'A thread on becoming undeniable. First, identity. Second, habits. Third, environment. Like and follow.',
  'Let me be direct. The game changed. If you are still doing it the old way you already lost. Thoughts?',
];

const borderlineSlop = [
  'I rewrote our onboarding email three times. The version that worked named the first click, not the vision.',
  'Spent the morning pairing with a junior engineer. The bug was a stale closure, not the framework everyone blamed.',
  'Our changelog for March: fixed the retry loop, cut p95 from 800ms to 220ms, and deleted two unused flags.',
  'Notes from a customer call. They did not want AI. They wanted the export button to remember the last folder.',
  'I keep a list of words I will not put in docs. Leverage and unlock are at the top. Concrete nouns stay.',
  'The postmortem is dull on purpose. A clock skew of 2 seconds dropped 4 percent of webhooks. We alert on skew now.',
  'Shipped the dark mode fix. The bug was a missing color on the focus ring, not a theme rewrite. Patch is live.',
  'Interview notes: ask what they deleted. The best candidate had removed a queue nobody remembered owning.',
];

const valuableLookalikes = [
  'Thread: how we store session tokens. Short version, rotate every 12 hours, bind to the device id, and never log the raw value.',
  'Emoji aside, the migration is real. We moved 40 million rows, kept the old table for 9 days, and the error rate stayed under 0.1 percent.',
  'YES, the patch landed. Build 1482 fixes the crash on launch for the 2019 hardware. Release notes are linked below, not in all caps.',
  'Honest launch: the battery case is $39, holds one extra charge, and does not include a subscription. Here is the teardown photo.',
  'Three links, because the spec, the test log, and the rollback plan are different documents. Read the rollback plan first.',
  'Reply with the actual numbers. Median latency 107ms, p95 128ms, cold start about 200ms on the small instance.',
  'I am furious about the outage and here is the timeline. 09:14 deploy, 09:18 error spike, 09:26 rollback, 09:31 recovered.',
  'A list, but a useful one. 1. Pin the dependency. 2. Vendor the cert. 3. Alert if the cert expires inside 14 days.',
  'The headline is in caps because the desk wrote it that way. Water ice was confirmed at the south pole. The paper is linked.',
  'Product update from the team that builds it. Version 2.3 adds offline drafts and removes the forced tutorial. That is the whole change.',
];

const rage = [
  'If you still defend them you are either lying or you cannot read, and I am done being polite with cowards like you.',
  'Every single one of you who voted for this should be ashamed. You are the problem. Reply if you hate them too.',
  'This clip proves they want you poor. Wake up. Share before they delete it. They cannot silence all of us.',
  'I cannot believe how stupid this take is. Sit down. Adults are talking. Anyone who disagrees is bought.',
  'They laughed at you. Now make them pay. Quote this and tag the cowards. Do not let this die.',
  'Absolute clowns. The whole industry is a scam and if you work there you are complicit. Say it louder.',
  'Your kids will hate you for this. Screenshot their excuses. We need the outrage to trend by tonight.',
  'Imagine being this dumb in public. I am embarrassed for your followers. Drop a skull if you agree.',
  'This is war. Pick a side or admit you are with the liars. No nuance. Nuance is how they win.',
  'Ratio this fraud into the ground. I will reply to every coward who defends them. Get in here.',
];

const realHeat = [
  'The bill cuts the transit budget by 12 percent. I oppose it. Here is the committee memo and the ridership table.',
  'I think the ruling is wrong. The statute says 30 days, the agency took 90, and the court ignored that sentence.',
  'Sharp criticism, with the quote. She said the water was safe on Monday. The lab report from Sunday says otherwise.',
  'I am angry, and the reason is specific. Our clinic lost four nurses and the posting has been open for 11 weeks.',
  'Disagreeing is fine. The chart he posted leaves out 2019, which reverses the trend. I attached the full series.',
  'This policy hurts night-shift workers. I am one. The last bus is 11:10pm and the shift ends at 11:40pm.',
];

const engagement = [
  'Agree? Repost if this hit. Follow for part two. Comment the word FOCUS and I will send the checklist.',
  'Be honest. Drop a yes if you needed to hear this. Tag someone who is stuck. I will reply to every yes.',
  'Hot take. Most of you will scroll past. The ones who comment WIN get the rest of the thread.',
  'Tell me you relate without telling me. I will stitch the best replies. Do not lurk, engage.',
  'Which one are you? Team hustle or team balance? Wrong answers only. I need the comments.',
  'Save this. You will thank me later. Comment READY and I will unlock the next slide.',
  'Nobody is talking about this. So I will. Reply with a fire if it shook you. Go.',
  'Part one of ten. Like this so I know to post part two. The algorithm is watching you.',
  'Unpopular opinion incoming. If you disagree you are scared. Prove me wrong in the replies.',
  'I posted this twice and the second one won. The difference was the question at the end. So, thoughts?',
];

const shills = [
  'Use code SLOP20 for 40 percent off the only productivity system you will ever need. Link in bio. Limited.',
  'I turned 200 into 9000 in a week with this signal group. DM me BOT for the free entry. Spots close tonight.',
  'Casino night, no deposit, just click. They paid me to say it and I would have said it anyway. Link below.',
  'Dropshipping changed my life. No inventory, no skills, just this course. Enroll before the price doubles.',
  'My AI agent prints money while I sleep. Comment CASH and I will send the setup. Not financial advice, but.',
  'Affiliate haul. These three creams paid for the trip. Swipe up, the code is in the first reply.',
  'Giveaway rules: follow, repost, and tag two friends. Winner gets the alpha list. Closes Friday.',
  'The token launches at 4. Do not fade this. Contract is in the reply. NFA. We are all going to make it.',
  'Coaches, steal this funnel. Webinar, tripwire, high ticket. I will audit yours if you book a call.',
  'Limited drop. 50 hoodies. If you know you know. Restock is not happening. Checkout link is live.',
];

const realProducts = [
  'We shipped offline drafts in version 2.3. They sync when you reconnect, and we removed the forced tutorial.',
  'The battery case is 39 dollars, holds one extra charge, and has no subscription. Teardown notes are in the reply.',
  'Changelog: fixed the retry loop, cut p95 from 800ms to 220ms, and deleted two flags nobody called.',
  'Launching the export button people asked for. It remembers the last folder. That is the feature. It is free.',
  'Our clinic scheduling app now shows the bus arrival, because night staff kept missing the last ride.',
  'Hardware note. The 2019 model crashed on launch. Build 1482 fixes it. No account required to install.',
  'The API now returns the request id on every error. Docs updated, example in curl, no SDK change required.',
  'We open sourced the cert watcher. It alerts if a certificate expires inside 14 days. MIT license, no phone home.',
];

const promotedJunk = [
  'Promoted. Quit your job with this one weird signal. Comment MONEY. The link is safe, trust me.',
  'Sponsored. This serum replaced my entire shelf. Use my code. Dermatologists hate how well it works.',
  'Promoted. Learn to trade from your phone in 11 minutes. The webinar is free and the upsell is not.',
  'Sponsored. Your followers are a business. Buy the growth pack and watch the graph. Results vary, but.',
  'Promoted. A new coin, a new chance. Do not be late. Contract in bio. We are early, you can be too.',
  'Sponsored. I lost weight without trying. The patch works overnight. Tap to claim the trial before it ends.',
];

const promotedGood = [
  'Promoted. Version 2.3 of the editor adds offline drafts and removes the forced tutorial. Release notes linked.',
  'Sponsored. The city bus app now shows the last departure for night shifts. The feature is live for every rider.',
  'Promoted. We published the outage timeline. 09:14 deploy, 09:26 rollback, 09:31 recovered. Full log attached.',
  'Sponsored. The battery case is 39 dollars and holds one charge. No subscription. Spec sheet is one page.',
  'Promoted. Build 1482 fixes the crash on 2019 hardware. The patch is free and does not need an account.',
  'Sponsored. The cert watcher is open source and alerts 14 days before expiry. Repository and license in the reply.',
];

const lowValue = [
  'This is so true and I have nothing to add but I wanted to say it anyway because the timeline feels quiet.',
  'Wow. Just wow. Honestly. Yeah. That is the whole thought. Leaving it here so it exists.',
  'Same. Literally same. Nothing else. Just same. Posting so the algorithm sees I was here today.',
  'Interesting. Very interesting. I might come back to this later. Or not. We will see. Okay.',
  'Cool cool cool. Noted. Thanks. Anyway. Moving on. Have a good one. That is all from me.',
  'I feel this. Deeply. On a spiritual level. No notes. Just feeling it. Carry on everyone.',
  'Big if true. Not sure. Could be. Might not. Either way, here we are. Wild times. Stay safe.',
  'Following this thread for later. Remind me. Or do not. I will probably forget. Such is life.',
];

const botReplies = [
  'Great question. Here are three things to consider. First, mindset. Second, systems. Third, consistency.',
  'Absolutely. Let me unpack that for you. The key takeaway is to stay consistent and trust the process.',
  'Love this. To add to your point, have you considered a framework? Happy to share a quick breakdown.',
  'Such a good prompt. Here is a concise summary. Align your goals, track your habits, review weekly.',
  'Thanks for asking. A simple way to think about it is input, process, output. Hope that helps. Follow for more.',
  'I hear you. Three tips. Start small. Measure once. Adjust weekly. Let me know if you want the template.',
  'Fantastic point. Building on it: clarity beats intensity. Would you like me to expand this into a thread?',
  'Noted. My recommendation is to define the outcome, pick one metric, and review it every Friday.',
];

const goodReplies = [
  'The null pointer is on line 214. The map is missing the default key, so the lookup returns undefined.',
  'Parent is right about the date. The statute text says 30 days, and the agency clock started on March 2.',
  'I tried the workaround. Setting the flag to false stops the crash. The ticket is 4412 if you want the diff.',
  'The bus at 11:10 is the last one. If the shift ends at 11:40 you need the supervisor to sign the cab slip.',
  'Your number is off by the 2019 rows. Add them back and the trend flattens. I pasted the series below.',
  'The cert expires on the 14th, not the 20th. I checked the chain this morning. Renewal is already scheduled.',
];

function links(n: number, words: string): string {
  const urls = Array.from({ length: n }, (_, i) => `https://example.com/doc-${i}`).join(' ');
  return `${words} ${urls}`;
}

function hashes(n: number, words: string): string {
  const tags = Array.from({ length: n }, (_, i) => `#tag${i}`).join(' ');
  return `${words} ${tags}`;
}

function emojiPile(n: number, words: string): string {
  return `${words} ${'🔥'.repeat(n)}`;
}

const posts: CorpusPost[] = [
  ...obviousSlop.map((text, i) =>
    post(`slop-obvious-${i + 1}`, 'slop', text, ALL, { model: reading({ slop: 0.94, quality: 1.2 }) }),
  ),
  ...borderlineSlop.map((text, i) =>
    post(`slop-border-${i + 1}`, 'slop', text, NOT_LIGHT, {
      model: reading({ slop: 0.78, quality: 2.1 }),
    }),
  ),
  ...[0, 1, 2, 3, 4, 5].map((i) =>
    post(
      `slop-quiet-${i + 1}`,
      'slop',
      [
        'The paragraph is smooth and a little empty. It names no bug, no number, and no person, just a gentle insight about growth.',
        'Another soft essay. It says the journey matters more than the destination and then stops, with nothing you could repeat at work.',
        'Polite filler about leadership presence. It could be pasted under any quote image and still make the same amount of sense.',
        'A calm list of virtues. Be kind, be curious, be consistent. No story, no counterexample, no detail from a real week.',
        'The cadence is even and the ending bows. It asks you to sit with that, then offers a follow for more reflections.',
        'It sounds thoughtful and cites nothing. The claim is that culture eats strategy, restated without a single workplace fact.',
      ][i]!,
      STRICT_UP,
      { model: reading({ slop: 0.64, quality: 1.8 }) },
    ),
  ),
  ...valuableLookalikes.map((text, i) =>
    post(`valuable-${i + 1}`, 'valuable', text, SHOW, {
      model: reading({ slop: 0.22, ragebait: 0.12, ads: 0.18, quality: 2.6, humanVeto: true }),
    }),
  ),
  ...rage.map((text, i) =>
    post(`rage-${i + 1}`, 'ragebait', text, NOT_LIGHT, {
      model: reading({ ragebait: 0.9, slop: 0.2, quality: 0.8 }),
    }),
  ),
  ...realHeat.map((text, i) =>
    post(`heat-${i + 1}`, 'ragebait', text, SHOW, {
      model: reading({ ragebait: 0.42, slop: 0.1, quality: 2.5, humanVeto: true }),
    }),
  ),
  ...engagement.slice(0, 2).map((text, i) =>
    post(`engage-loud-${i + 1}`, 'ad', text, ALL, {
      model: reading({ ads: 0.95, slop: 0.4, quality: 0.6 }),
    }),
  ),
  ...engagement.slice(2).map((text, i) =>
    post(`engage-${i + 1}`, 'ad', text, NOT_LIGHT, {
      model: reading({ ads: 0.8, slop: 0.35, quality: 0.9 }),
    }),
  ),
  ...shills.map((text, i) =>
    post(`shill-${i + 1}`, 'promotional', text, NOT_LIGHT, {
      model: reading({ ads: 0.84, slop: 0.3, quality: 0.4 }),
    }),
  ),
  ...realProducts.map((text, i) =>
    post(`product-${i + 1}`, 'promotional', text, SHOW, {
      model: reading({ ads: 0.28, slop: 0.12, quality: 2.7, humanVeto: true }),
    }),
  ),
  ...promotedJunk.map((text, i) =>
    post(`promo-junk-${i + 1}`, 'promoted', text, NOT_LIGHT, {
      promoted: true,
      model: reading({ ads: 0.84, slop: 0.25, quality: 0.5 }),
    }),
  ),
  ...promotedGood.map((text, i) =>
    post(`promo-good-${i + 1}`, 'promoted', text, ZEN, {
      promoted: true,
      model: reading({ ads: 0.3, slop: 0.12, quality: 2.6, humanVeto: true }),
    }),
  ),
  ...lowValue.map((text, i) =>
    post(`low-${i + 1}`, 'lowQuality', text, ZEN, {
      model: reading({ slop: 0.2, quality: 0.8 }),
    }),
  ),
  ...botReplies.map((text, i) =>
    post(`bot-${i + 1}`, 'botReply', text, NOT_LIGHT, {
      isReply: true,
      parentText: 'How do you actually start, in one concrete step?',
      model: reading({ slop: 0.62, quality: 1.4, botReply: true }),
    }),
  ),
  ...goodReplies.map((text, i) =>
    post(`reply-${i + 1}`, 'botReply', text, SHOW, {
      isReply: true,
      parentText: 'Where is the null coming from?',
      model: reading({ slop: 0.08, quality: 2.5, botReply: false, humanVeto: true }),
    }),
  ),
  post('hash-spam-1', 'hashtag', hashes(8, 'launch day today friends'), ALL),
  post('hash-spam-2', 'hashtag', hashes(7, 'big news coming soon please share'), ALL),
  post('hash-spam-3', 'hashtag', hashes(9, 'follow for more updates and wins'), ALL),
  post('hash-spam-4', 'hashtag', hashes(6, 'morning thoughts and a long tag list'), ALL),
  post('hash-ok-1', 'hashtag', hashes(3, 'The patch notes mention the retry bug and the two flags we deleted'), SHOW, {
    model: reading({ slop: 0.1, quality: 2.4 }),
  }),
  post('hash-ok-2', 'hashtag', hashes(2, 'Conference thread on the water ice paper, with the figure number cited'), SHOW, {
    model: reading({ slop: 0.08, quality: 2.6 }),
  }),
  post('emoji-spam-1', 'emoji', emojiPile(12, 'lets go'), ALL),
  post('emoji-spam-2', 'emoji', emojiPile(14, 'huge news drop soon'), ALL),
  post('emoji-spam-3', 'emoji', emojiPile(10, 'can you feel it yet or not'), ALL),
  post('emoji-ok-1', 'emoji', emojiPile(4, 'Shipped the offline draft fix and the focus ring. Four marks, then the actual notes.'), SHOW, {
    model: reading({ slop: 0.1, quality: 2.3 }),
  }),
  post('emoji-ok-2', 'emoji', emojiPile(2, 'The clinic now shows the last bus. Staff asked for it. That is the update.'), SHOW, {
    model: reading({ slop: 0.08, quality: 2.5 }),
  }),
  post('links-dump-1', 'links', links(6, 'read these now'), ALL),
  post('links-dump-2', 'links', links(5, 'sources and more sources and more'), ALL),
  post('links-ok-1', 'links', links(4, 'Spec, test log, rollback plan, and the incident timeline. Read the rollback plan first.'), SHOW, {
    model: reading({ slop: 0.1, quality: 2.6, humanVeto: true }),
  }),
  post('links-ok-2', 'links', links(2, 'The paper and the data table. Water ice at the south pole, confirmed in the methods section.'), SHOW, {
    model: reading({ slop: 0.08, quality: 2.7 }),
  }),
  post('shout-1', 'shouting', 'THIS IS INSANE!!! YOU WILL NOT BELIEVE WHAT THEY JUST DID TO US!!! WAKE UP NOW!!!', ALL),
  post('shout-2', 'shouting', 'STOP SCROLLING!!! THIS CHANGES EVERYTHING!!! SHARE IT BEFORE THEY BAN ME!!!', ALL),
  post('shout-3', 'shouting', 'I AM SCREAMING!!! HOW IS THIS LEGAL!!! EVERYONE NEEDS TO SEE THIS RIGHT NOW!!!', ALL),
  post(
    'caps-news-1',
    'shouting',
    'WATER ICE CONFIRMED AT THE SOUTH POLE AFTER A DECADE OF READINGS. The methods section names the instrument.',
    SHOW,
    { model: reading({ slop: 0.1, ragebait: 0.1, quality: 2.6, humanVeto: true }) },
  ),
  post(
    'caps-news-2',
    'shouting',
    'BUILD 1482 FIXES THE LAUNCH CRASH ON 2019 HARDWARE. The patch is free and does not need an account.',
    SHOW,
    { model: reading({ slop: 0.12, ads: 0.22, quality: 2.5 }) },
  ),
  post('media-image-1', 'media', 'A photo of the focus ring bug, with the missing color called out in the caption.', SHOW, {
    hasImage: true,
    model: reading({ slop: 0.1, quality: 2.2 }),
  }),
  post('media-image-2', 'media', 'Sunset from the clinic roof after the night shift. No pitch, just the sky.', SHOW, {
    hasImage: true,
    model: reading({ slop: 0.05, quality: 1.6 }),
  }),
  post('media-video-1', 'media', 'A two minute clip of the rollback. The timeline is in the description, not the title.', SHOW, {
    hasVideo: true,
    model: reading({ slop: 0.1, quality: 2.3 }),
  }),
  post('media-gif-1', 'media', 'A short loop of the button remembering the last folder. That is the whole demo.', SHOW, {
    hasGif: true,
    model: reading({ slop: 0.08, quality: 2.1 }),
  }),
  post('blocked-1', 'blocked', 'Even a normal sentence from this account should disappear before any model call happens.', ALL, {
    author: 'spammer',
    blocked: true,
  }),
  post('blocked-2', 'blocked', 'Here is a useful changelog that still should not show because the account is on the block list.', ALL, {
    author: 'spammer',
    blocked: true,
    model: reading({ slop: 0.05, quality: 2.8 }),
  }),
  post('repeat-1', 'repeat', 'Another thread from the account you already chose to hide. The words do not get a second chance.', ALL, {
    autoHide: true,
    model: reading({ slop: 0.2, quality: 2.2 }),
  }),
  post('repeat-2', 'repeat', 'A perfectly ordinary update that stays hidden because auto-hide is already on for this handle.', ALL, {
    autoHide: true,
  }),
  post('short-1', 'lowQuality', 'This.', SHOW),
  post('short-2', 'lowQuality', 'Same honestly.', SHOW),
  post('custom-keep-1', 'custom', 'A long note about bus schedules and shift times, with no coin, no code, and no funnel.', SHOW, {
    model: reading({ slop: 0.1, quality: 2.4, custom: { cf_crypto: 0.1 } }),
  }),
  post('custom-hit-1', 'custom', 'The coin launches tonight and the contract is the whole post. Send the ticker to your group chat now.', NOT_LIGHT, {
    model: reading({ slop: 0.2, ads: 0.84, quality: 1.6, custom: { cf_crypto: 0.9 } }),
  }),
  post(
    'valuable-11',
    'valuable',
    'The on-call handoff is three lines. What broke, what we rolled back, and who is awake. Last night it was the cert, the 09:26 rollback, and Priya.',
    SHOW,
    { model: reading({ slop: 0.14, quality: 2.6, humanVeto: true }) },
  ),
  post(
    'valuable-12',
    'valuable',
    'Recipe, not a thread. Soak the beans overnight, salt the water, and do not add the acid until they are tender. That is the whole trick.',
    SHOW,
    { model: reading({ slop: 0.16, quality: 2.2, humanVeto: true }) },
  ),
  post(
    'heat-7',
    'ragebait',
    'I oppose the fare increase. A monthly pass would go from 64 to 81, and the night bus is already the only way home for the clinic staff.',
    SHOW,
    { model: reading({ ragebait: 0.38, quality: 2.4, humanVeto: true }) },
  ),
  post(
    'product-9',
    'promotional',
    'The printer firmware is 1.9. It fixes the jam sensor and does not add an account. The file size is 2.4 megabytes.',
    SHOW,
    { model: reading({ ads: 0.24, slop: 0.1, quality: 2.5 }) },
  ),
  ...aiWrittenCorpus(),
  ...techFeedCorpus(),
];

/**
 * Posts across the 2x2. Authorship and value are separate scores.
 * The pill is expected only when the post stays up and the AI-written score
 * clears the default 50% floor.
 */
function aiWrittenCorpus(): CorpusPost[] {
  const aiSlop = [
    "Let's unpack this. The real lesson is the mindset, not the work. Most people are not ready. Agree?",
    'Here is the framework that actually matters. Elevate. Align. Execute. Share this if it landed for you.',
    'The tapestry of modern work is a nuanced paradigm. Delve in. Repost if you needed the reminder today.',
    'Not gonna lie: consistency is the unlock. Drop a yes if this was the sign you were waiting for today.',
    'Seven soft lessons about focus. Wake with intention. Drink water. Win the morning. Follow for part two.',
    'Stop scrolling and hear this. The winners decide, then they act, then they iterate. Simple. Bookmark it.',
    'A short thread on becoming undeniable. First identity. Second habits. Third environment. Like and follow.',
    'Let me be direct. The game changed, and the old way already lost. Sit with that. Thoughts are welcome.',
  ];
  const aiValue = [
    'Rotated session tokens every 12 hours and bound them to the device id. p95 auth fell from 800ms to 220ms.',
    'The March changelog names three edits: the retry loop, two unused flags, and a p95 cut from 800ms to 220ms.',
    'Postmortem, dull on purpose. A 2 second clock skew dropped 4 percent of webhooks. We alert on skew now.',
    'Version 2.3 adds offline drafts and removes the forced tutorial. The patch is 1.8 megabytes and free.',
    'Customer call notes. They did not want a model. They wanted export to remember the last folder they used.',
    'The null is on line 214. The map is missing the default key, so an empty session throws before the retry.',
    'Vendored the cert, pinned the dependency, and alert if it expires inside 14 days. The check runs nightly.',
  ];
  const humanSlop = [
    'Wow. Just wow. Honestly. Yeah. So true. Follow for more of whatever this feeling is supposed to be.',
    'This. All of this. Nothing else to add. If you know you know. Stay on the timeline and keep scrolling.',
    'Can we talk about how wild that was. No but seriously. I have no words. Just felt like posting tonight.',
    'Mood. That is the whole post. Do not ask me to explain it. Some days are just a shrug and a timeline.',
    'Not me reading this twice and still having nothing. Anyway. Carry on. I will be here doing the same.',
    'Big if true. Huge if true. I will not check. Someone else can look it up and report back to the group.',
    'I feel this in my bones and I refuse to say why. Goodnight to everyone who also has no details to share.',
    'Literally nothing happened and I am posting about it. The bar is on the floor. See you in the replies.',
  ];
  const humanValue = [
    'The bug was a stale closure. p95 fell from 800ms to 220ms after we stopped capturing the old request.',
    'Night bus is the only way home. The shift ends at 11:40pm and the last bus leaves the clinic at 11:10pm.',
    'Soak the beans overnight, salt the water, and do not add the acid until they are tender. That is the trick.',
    'Build 1482 fixes the launch crash on 2019 hardware. The patch is free and does not ask for an account.',
    'She said the water was safe on Monday. The lab report from Sunday says otherwise. I attached both pages.',
    'The fare would go from 64 to 81. I oppose it. The committee memo and the ridership table are linked once.',
    'Interview note: ask what they deleted. The best candidate had removed a queue nobody remembered owning.',
    'Handoff is three lines. What broke, what we rolled back, and who is awake. Last night: the cert, Priya.',
  ];

  const rows: CorpusPost[] = [];
  aiSlop.forEach((text, index) => {
    rows.push(
      post(`ai-slop-${index + 1}`, 'ai-slop', text, ALL, {
        model: reading({ slop: 0.96, aiWritten: 0.86, quality: 0.6 }),
        pill: false,
      }),
    );
  });
  aiValue.forEach((text, index) => {
    const aiWritten = [0.72, 0.8, 0.84, 0.88, 0.91, 0.67, 0.77][index] ?? 0.8;
    rows.push(
      post(`ai-value-${index + 1}`, 'ai-value', text, SHOW, {
        model: reading({ slop: 0.12, aiWritten, quality: 2.6, humanVeto: true }),
        pill: true,
      }),
    );
  });
  rows.push(
    post(
      'ai-value-low',
      'ai-value',
      'The export button now remembers the last folder. We shipped it Tuesday after the support queue asked twice.',
      SHOW,
      { model: reading({ slop: 0.14, aiWritten: 0.49, quality: 2.5, humanVeto: true }), pill: false },
    ),
  );
  rows.push(
    post(
      'ai-value-floor',
      'ai-value',
      'Pinned the certificate dependency and alert if it expires inside 14 days. The runbook is one page.',
      SHOW,
      { model: reading({ slop: 0.11, aiWritten: 0.5, quality: 2.7, humanVeto: true }), pill: true },
    ),
  );
  humanSlop.forEach((text, index) => {
    rows.push(
      post(`human-slop-${index + 1}`, 'human-slop', text, ALL, {
        model: reading({ slop: 0.95, aiWritten: 0.08, quality: 0.4 }),
        pill: false,
      }),
    );
  });
  humanValue.forEach((text, index) => {
    rows.push(
      post(`human-value-${index + 1}`, 'human-value', text, SHOW, {
        model: reading({ slop: 0.1, aiWritten: index === 0 ? 0.49 : 0.06, quality: 2.6, humanVeto: true }),
        pill: false,
      }),
    );
  });
  return rows;
}

/**
 * Tech-feed posts. Hard negatives look like the other class: a terse trace or a
 * "this changes everything" line that still has a number stays up; a launch or
 * a reply with no bug, number, paper, or diff goes. Pill labels follow the
 * default 50% floor and only apply when the post stays up.
 */
function techFeedCorpus(): CorpusPost[] {
  const keep = [
    'Trace from the worker. TypeError at queue.ts:214. Cannot read properties of undefined (reading map). The batch was empty because the abort landed first.',
    'Eval on the same 500-prompt set. Pass rate 61.2 to 74.8. p50 latency 107ms, p95 128ms. No other change in the harness.',
    'Changelog 2.3.1. Removed the forced tutorial, fixed the focus ring, and stopped retrying 4xx. The file is 1.8 megabytes.',
    'arXiv abstract, one link: https://arxiv.org/abs/2401.00001. They report a 3.1 point gain on the held-out split and publish the seed.',
    'Release 1.9 is out. Offline drafts sync on reconnect. We deleted the phone-home call. The migration is one column add.',
    'lgtm with a nit. the race is on the map insert, not the lock. repro on the second tab only. the first tab is fine.',
    'The guard is if (batch.length === 0) return. Without it the reducer throws on an empty flush. The patch is four lines.',
    'Postmortem. 09:14 deploy, 09:18 error spike on the cert path, 09:26 rollback, 09:31 recovered. Clock skew was 2 seconds.',
    'The paper table 3 is the one that matters. F1 moves from 0.71 to 0.78 when the negative set includes hard near-duplicates.',
    'Shipped the export they asked for. It remembers the last folder. Version 2.4. No account and no upsell. Desktop build is 39 dollars.',
    'Thread on the prefetch margin. A cold call is about 200ms, warm p90 is 128ms, so we queue one screen ahead and keep four requests in flight.',
    'People will call this a paradigm shift. The only change is the retry budget, from 3 to 1, and p95 dropped from 800ms to 220ms.',
  ];
  const aiKeep = [
    'Session tokens rotate every 12 hours and bind to the device id. p95 auth moved from 800ms to 220ms. A model drafted the note. The trace checked it.',
    'Benchmark note, model-drafted and then checked. Same 500-prompt set, pass rate 61.2 to 74.8, p95 128ms. The harness diff is three lines.',
    'Model-written summary of the paper. Held-out gain is 3.1 points. Seed 17. The abstract is the only link: https://arxiv.org/abs/2401.00002.',
    'Release notes, written with a model and then edited. Version 1.9 adds offline drafts and removes the phone-home call. Patch size 1.8 megabytes.',
  ];
  const obvious = [
    'AI will replace you by Friday. Here are 10 tips to survive. Wake up earlier. Post more. Comment READY. The ones who hesitate are already gone.',
    'Comment PROMPT and I will send the agent stack that prints clients. This changes everything for builders. No benchmark, just the mindset. Follow for part two.',
    'We just launched and this changes everything. The future of engineering is here. I will not share a version, a diff, or a metric. Link in bio.',
    '10 tips for prompt engineers. Be consistent. Think bigger. Ship daily. Trust the process. Engage harder. Follow for the rest of the thread.',
    'Prompt-bro hour. Comment AGENT and I will send the stack. No architecture, no eval, no number. The algorithm is watching you right now.',
    'Giveaway for builders. Follow, repost, and tag two cofounders. Winner gets the alpha prompt list. Closes Friday. Not a product. A funnel.',
    'The token launches at 4. Contract in the next reply. NFA. We are all going to make it. Builders who fade this will be exit liquidity.',
  ];
  const replyLoud =
    'Great question. Totally agree. First, mindset. Second, systems. Third, consistency. This is the future of the stack. Thoughts?';
  const quieter = [
    'We launched. This changes everything. The future of engineering starts today. Link in bio. I cannot share the diff yet, but trust the drop.',
    'A few notes on prompting. Start with intent, then constraints, then tone. I will expand this into a thread if it lands. Bookmark it for later.',
    'Early on a new chain. I will not post the contract yet. Builders who know, know. NFA, but the chart is the whole pitch.',
  ];
  const replyQuiet =
    'Absolutely. Building on your point, have you considered a framework? Happy to share a breakdown. Clarity beats intensity. Follow for more.';
  const strictOnly = [
    'The unlock is distribution, not the model. Most builders are not ready for that sentence. Sit with it, then follow for the thread.',
    'This benchmark thread is embarrassing and the author should sit down. I am not going to quote a number. Just ratio it and move on.',
  ];

  const rows: CorpusPost[] = [];
  keep.forEach((text, index) => {
    rows.push(
      post(`tech-keep-${index + 1}`, 'tech', text, SHOW, {
        model: reading({ slop: 0.16, ads: 0.14, ragebait: 0.08, quality: 2.7, humanVeto: true }),
        pill: false,
      }),
    );
  });
  const aiScores = [0.74, 0.82, 0.69, 0.91];
  aiKeep.forEach((text, index) => {
    rows.push(
      post(`tech-ai-${index + 1}`, 'tech', text, SHOW, {
        model: reading({
          slop: 0.12,
          ads: 0.1,
          quality: 2.6,
          aiWritten: aiScores[index] ?? 0.8,
          humanVeto: true,
        }),
        pill: true,
      }),
    );
  });
  rows.push(
    post(
      'tech-ai-under',
      'tech',
      'The null is on line 214 of the map. The default key was missing, so the empty batch threw before the retry. I wrote this one myself.',
      SHOW,
      { model: reading({ slop: 0.11, aiWritten: 0.49, quality: 2.6, humanVeto: true }), pill: false },
    ),
  );
  obvious.forEach((text, index) => {
    rows.push(
      post(`tech-obvious-${index + 1}`, 'tech', text, ALL, {
        model: reading({ slop: 0.94, ads: 0.93, ragebait: 0.4, aiWritten: 0.84, quality: 0.5 }),
        pill: false,
      }),
    );
  });
  rows.push(
    post('tech-reply-loud', 'tech', replyLoud, ALL, {
      isReply: true,
      parentText: 'Where is the null coming from in the batch reducer?',
      model: reading({ slop: 0.86, quality: 0.8, aiWritten: 0.7, botReply: true }),
      pill: false,
    }),
  );
  const quieterScores = [
    { slop: 0.4, ads: 0.86, ragebait: 0.1 },
    { slop: 0.78, ads: 0.3, ragebait: 0.1 },
    { slop: 0.3, ads: 0.8, ragebait: 0.12 },
  ];
  quieter.forEach((text, index) => {
    const scores = quieterScores[index] ?? { slop: 0.78, ads: 0.8, ragebait: 0.1 };
    rows.push(
      post(`tech-quiet-${index + 1}`, 'tech', text, NOT_LIGHT, {
        model: reading({ ...scores, quality: 0.9, aiWritten: 0.6 }),
        pill: false,
      }),
    );
  });
  rows.push(
    post('tech-reply-quiet', 'tech', replyQuiet, NOT_LIGHT, {
      isReply: true,
      parentText: 'How should we set the retry budget on the worker?',
      model: reading({ slop: 0.62, quality: 1.2, aiWritten: 0.55, botReply: true }),
      pill: false,
    }),
  );
  strictOnly.forEach((text, index) => {
    rows.push(
      post(`tech-strict-${index + 1}`, 'tech', text, STRICT_UP, {
        model: reading({
          slop: index === 0 ? 0.64 : 0.2,
          ragebait: index === 0 ? 0.1 : 0.62,
          ads: 0.1,
          quality: 1.6,
        }),
        pill: false,
      }),
    );
  });
  rows.push(
    post(
      'tech-zen-low',
      'tech',
      'Interesting repo energy. Might look later. Or not. Cool cool. Anyway. Have a good build and a quieter timeline.',
      ZEN,
      { model: reading({ slop: 0.22, quality: 0.8, aiWritten: 0.2 }), pill: false },
    ),
  );
  rows.push(
    post(
      'tech-promo-good',
      'tech',
      'Promoted. Release 1.4.2 fixes the retry loop and cuts p95 from 800ms to 220ms. Notes are one page. No subscription.',
      ZEN,
      {
        promoted: true,
        model: reading({ slop: 0.12, ads: 0.22, quality: 2.6, aiWritten: 0.4, humanVeto: true }),
        pill: false,
      },
    ),
  );
  rows.push(
    post(
      'tech-promo-pitch',
      'tech',
      'Promoted. Quit your job with this prompt pack. Comment MONEY. The future of engineering is a link in the bio.',
      NOT_LIGHT,
      {
        promoted: true,
        model: reading({ slop: 0.4, ads: 0.88, quality: 0.4, aiWritten: 0.8 }),
        pill: false,
      },
    ),
  );
  return rows;
}

export const FILTER_CORPUS: readonly CorpusPost[] = posts;

export function corpusSize(): number {
  return FILTER_CORPUS.length;
}
