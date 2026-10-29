import type { MediaFilterId, SignalId } from '@/lib/types';
import type { SlopCategory } from '@/lib/detect/score';

export interface HelpCopy {
  label: string;
  explanation: string;
  example: string;
}

export const SIGNAL_HELP: Record<SignalId, HelpCopy> = {
  slop: {
    label: 'AI slop',
    explanation:
      'Hides a post when the writing itself looks machine-made: tidy lists, announced insights, chatbot leftovers. Lower means more posts get caught.',
    example:
      'Example: “Let’s unpack this. The real lesson isn’t the tool — it’s the mindset.”',
  },
  ragebait: {
    label: 'Rage bait',
    explanation:
      'Hides posts written to make you angry and reply. A stricter bar catches quieter dunks, and will sometimes catch a heated but real argument.',
    example:
      'Example: “If you still disagree you’re either lying or you can’t read, and I’m done being polite.”',
  },
  ads: {
    label: 'Ads and shilling',
    explanation:
      'Hides sales pitches, affiliate drops, and crypto shilling. Engagement bait that is really an ad is caught here too.',
    example:
      'Example: “Use code SLOP20 for 40% off the only productivity system you’ll ever need.”',
  },
};

export const CATEGORY_HELP: Record<SlopCategory, HelpCopy> = {
  assistant: {
    label: 'Assistant residue',
    explanation: 'Chatbot leftovers: flattery, “certainly”, and a pivot nobody asked for.',
    example: 'Example: “Great question! Let me unpack this for you.”',
  },
  profundity: {
    label: 'False profundity',
    explanation: 'Announced insights, coined labels, and stakes inflated past what the post actually says.',
    example: 'Example: “This changes everything. Most people aren’t ready to hear it.”',
  },
  cadence: {
    label: 'Machine cadence',
    explanation:
      'Even rhythm, a tidy bow at the end, and a line that asks you to engage. This is where engagement bait lives.',
    example: 'Example: “Agree? Repost if this hit. Follow for part two.”',
  },
  circumvention: {
    label: 'Circumvention',
    explanation: 'Colons, semicolons, and performed casualness used to dodge the better-known tells.',
    example: 'Example: “not gonna lie: this is the framework that actually matters.”',
  },
  vocabulary: {
    label: 'Stock vocabulary',
    explanation: 'The words models reach for. A full signal is two of the strongest ones, or a cluster of weaker ones.',
    example: 'Example: “Let’s delve into this tapestry of nuanced, multifaceted takeaways.”',
  },
  templates: {
    label: 'Templated structure',
    explanation: 'Thread bait, numbered lists, and a stack of short lines that all land the same way.',
    example: 'Example: “7 things I learned about focus: 1. Wake up. 2. Hydrate. 3. Win.”',
  },
};

export const MEDIA_HELP: Record<MediaFilterId, HelpCopy> = {
  images: {
    label: 'Images',
    explanation: 'Hides every post that contains a still image, on this device, with no model call.',
    example: 'Example: a sunset photo with no caption.',
  },
  videos: {
    label: 'Videos',
    explanation: 'Hides every post that contains a video, before any text is scored.',
    example: 'Example: an autoplaying clip of a speech with a one-line caption.',
  },
  gifs: {
    label: 'GIFs',
    explanation: 'Hides every post that contains a GIF.',
    example: 'Example: a reaction GIF posted with no other text.',
  },
};

export const PROMOTED_HELP: HelpCopy = {
  label: 'Promoted posts',
  explanation: 'Hides anything X has marked as promoted. It never asks the model.',
  example: 'Example: a sponsored post from a brand you don’t follow, with a Promoted label.',
};

export const REPEAT_HELP: HelpCopy = {
  label: 'Repeat accounts',
  explanation:
    'After this many slop or ad hides from one account, the next post offers to hide the rest. Promoted posts, media, and your own questions do not count. Nothing is muted on X from here.',
  example:
    'Example: the same account posts three “Let’s dive in” threads, and the fourth asks if you want them all gone.',
};

export const REPLY_HELP: HelpCopy = {
  label: 'Bot-style replies',
  explanation:
    'A lower bar for a reply inside a thread that reads like a bot agreeing or pivoting. The bucket bars drop by the same gap while that reply is judged.',
  example: 'Example: “Great question! Here are three things to consider:” under someone else’s post.',
};

export const QUALITY_HELP: HelpCopy = {
  label: 'Low value',
  explanation:
    'Hides posts the model rates below this on a 0–3 scale of how much a thoughtful reader would get from them. Turning it on adds one question per post.',
  example: 'Example: a reply that only says “This.” or a pile of hashtags with no point.',
};

export const HIDE_UNTIL_HELP: HelpCopy = {
  label: 'Hide until checked',
  explanation:
    'Keeps a new post collapsed until a verdict arrives, so a filtered one never flashes into view. It comes back on its own if a check is still running after eight seconds.',
  example: 'Example: a slop thread stays hidden instead of appearing for a second and then vanishing.',
};

export const LABELING_HELP: HelpCopy = {
  label: 'AI and Human marks',
  explanation:
    'Shows AI and Human buttons on posts so you can teach the scorer. The marks stay in this browser. Fitting weights uses them and does not change your preset.',
  example: 'Example: you mark a polished thread AI and a typo-filled reply Human.',
};

export const ALLOW_HELP: HelpCopy = {
  label: 'Never filter',
  explanation: 'These accounts skip every filter, including promoted posts and your blocklist.',
  example: 'Example: @friend stays visible even when the post reads like slop.',
};

export const BLOCK_HELP: HelpCopy = {
  label: 'Always hide',
  explanation: 'These accounts are hidden on this device, and the post is not sent to the model.',
  example: 'Example: @spammer disappears as soon as it shows up in the timeline.',
};

export const HIDE_MODE_HELP: HelpCopy = {
  label: 'When a post is filtered',
  explanation:
    'Collapse leaves a one-line note with Show. Blur keeps the post in place but unreadable until you reveal it. Remove takes it out of the timeline.',
  example: 'Example: a hidden ad becomes “Ad (88%)” with a Show button, instead of the pitch itself.',
};

export const PROVIDER_HELP: HelpCopy = {
  label: 'Model provider',
  explanation:
    'Both routes run the same Jev model and send the same request. TypeSafe bills you directly. OpenRouter bills your OpenRouter credits.',
  example: 'Example: a key that starts with apikey_ is TypeSafe. A key that starts with sk-or- is OpenRouter.',
};

export const KEY_HELP: HelpCopy = {
  label: 'API key',
  explanation:
    'Stored in this browser only. The background worker sends it to the provider you picked. The timeline never sees it, and it is not written to the page.',
  example: 'Example: paste apikey_… from the TypeSafe console, then press Test.',
};

export const MODEL_HELP: HelpCopy = {
  label: 'Model',
  explanation:
    'Leave this blank to use the pinned Jev id for the provider. A floating name such as jev-latest is rewritten to that pinned id.',
  example: 'Example: blank uses jev-1.14.0 on TypeSafe and typesafe/jev-1.14 on OpenRouter.',
};

export const ENABLED_HELP: HelpCopy = {
  label: 'Filtering',
  explanation: 'Turns filtering on or off for open timelines. Your preset and lists stay as they are.',
  example: 'Example: switch it off to scroll an unfiltered timeline, then back on without picking a preset again.',
};
