# Filtering rules

This is the contract for what gets hidden. A preset is a bundle of these rules. Custom mode is the same rules with the knobs moved one at a time.

A post is judged in order:

1. If you already chose to hide the rest of that account, it is hidden.
2. On-device rules run with no model call: never-filter list, always-hide list, the promoted switch, media switches, then hashtag, emoji, link, and shouting counts.
3. A post under five words that survived those counts stays visible. It is too short to be worth a model call.
4. Otherwise the model scores the writing. A preset hides the post when a score clears that preset's bar.

Promoted is not a kind of writing. It is a label the site puts on a paid placement. Light, Balanced, and Strict read the words. Zen hides every promoted post, paid or not, because that preset is maximum calm.

## Work feed

The presets are written for people who use X as a work feed: developers, engineers, AI builders, researchers, and people at technical startups.

You will see: release notes, papers, benchmarks with numbers, postmortems, real launches, technical threads, and useful AI-written posts with the pill.

You won't see: AI-will-replace-you bait, 10-tips threads, comment-for-the-prompt farming, giveaway and crypto shilling, and ratio-bait dunks.

Light only takes the obvious cases. Balanced takes the clear ones. Strict takes quieter bait and reply-guy agreement, and flags a repeat account after two slop or ad hides. Zen also hides every promoted post, low-value filler, and new posts until a verdict arrives. A useful AI-written post stays up on every preset, with the pill, unless you turn on “Also hide AI-written posts.”

## How to read a bar

Every score runs from 0 to 1. The bar is the minimum score that hides. A higher bar hides fewer posts. A lower bar hides more. Turning a signal off hides none of that kind, whatever the score. These directions never reverse.

## AI-written and AI slop

Two scores, from the same model call.

AI-written is how the text was produced. 0 is a person. 1 is a language model or an AI writing tool. It does not say whether the post is worth reading.

AI slop is a post that adds no value, whoever wrote it. 0 is a specific, usable post. 1 is filler. A person can write slop. A model can write something worth keeping.

| | Adds no value | Adds value |
| --- | --- | --- |
| AI-written | Hide as slop. No label, because the post is not left up. Example: “Let’s unpack this. The real lesson is the mindset. Agree?” | Leave it up. Show the label once the score clears the display floor. Example: “Rotated session tokens every 12 hours and bound them to the device id. p95 auth fell from 800ms to 220ms.” |
| Written by a person | Hide as slop when the value score clears the bar. No AI label. Example: “Wow. Just wow. Honestly. Yeah. So true. Follow for more.” | Leave it up. No AI label. Example: “The bug was a stale closure. p95 fell from 800ms to 220ms.” |

The label is a small monochrome pill, “AI 72%”, near the post header. Its tooltip says the post is shown, not hidden, because it adds value. Show from is 50, 70, or 90 percent. The default is 50. Every preset leaves “Also hide AI-written posts” off, so authorship alone never hides a post unless that switch is turned on.

## AI slop

A post that adds no value, whoever wrote it: tidy lessons, announced insights, chatbot leftovers, and threads that could be pasted under any topic. Being written with AI is a separate score and does not, by itself, make a post slop.

Hide: "AI will replace you. Here are 10 tips. Comment PROMPT and I will send the thread."

Keep: "The bug was a stale closure. p95 fell from 800ms to 220ms."

Edge: a numbered list is not slop when the items are a changelog or a benchmark. A smooth paragraph with no bug, number, paper, or diff is slop even if the tone is calm. A useful AI-written post stays up, with the pill. Light only hides this when the score is very high (0.9). Balanced uses 0.7. Strict uses 0.6. Zen uses 0.5.

## Rage bait

Written to farm angry replies: insults, side-picking, and dares. A real argument with evidence is not rage bait.

Hide: "Ratio this paper into the ground. No result, no page number. If you cite it you cannot read."

Keep: "Table 3 is the one that matters. F1 moved from 0.71 to 0.78 when the negatives included hard near-duplicates."

Edge: anger plus a benchmark, a quote, or a diff stays. A ratio-bait dunk with none of those goes. Light leaves rage bait up. The other presets hide clear cases.

## Engagement bait

The only point is a click, a comment word, or a follow. The model often files this as an ad. When AI slop is on, that ad score is also compared with the slop bar, so very obvious bait can hide even if the ads switch is off.

Hide: "Comment PROMPT and I will send the agent stack. The algorithm is watching."

Keep: "Which document should I read first, the spec or the rollback plan?"

Edge: a genuine question about a diff or a paper stays. "Comment PROMPT" with nothing else goes. Light hides it only at 0.9. Balanced hides it from 0.6 once ads are on, and from 0.7 through the slop bar.

## Ads

A pitch: affiliate codes, dropshipping, casino, crypto signals, vague get-rich offers. Naming a product is not an ad.

Hide: "Giveaway rules: follow, repost, and tag two friends. Winner gets the alpha prompt list. The token launches at 4."

Keep: "Version 2.3 adds offline drafts. We removed the forced tutorial."

Edge: a release with a version and a metric is a launch, not a pitch. A detail-free "this changes everything" launch is a pitch. "NFA, we are all going to make it" is a pitch. Light leaves ordinary ads up unless the score also clears the slop bar (0.9). Balanced hides them at 0.6, Strict at 0.55, Zen at 0.5.

## Promoted

The site marked the post as paid. That mark is not a verdict.

Hide when the words are generic bait, a get-rich or gambling offer, machine-written filler, or a misleading claim.

Keep when a real product or launch has substance: what shipped, what it costs, what changed.

Decision: Light, Balanced, and Strict judge the content. Zen hides every promoted post, including a good launch, so the quiet preset does not spend attention on paid inventory. The Appearance switch still exists for Custom: on means hide all promoted unread, off means judge the words.

## Low quality

How much a careful reader learns, from 0 to 3. 0 is noise, 3 is a post you could use. The floor hides anything below it and adds one model question. Off (0) does not ask.

Hide: "Wow. Just wow. Honestly. Yeah." when the floor is above that post's score.

Keep: a three-line postmortem or a changelog line.

Edge: posts under five words never reach this question, so "This." stays on every preset, including Zen. Zen's floor is 1.5. Light, Balanced, and Strict leave the floor off.

## Bot reply

A reply inside a thread that only agrees, flatters, or pivots into a generic list. The bar is lower than the main slop bar while that reply is judged. A reply that answers the parent is not a bot reply.

Hide: "Great question. Totally agree. First, mindset. Second, systems. Third, consistency." under a technical post.

Keep: "The null is on line 214. The map is missing the default key."

Edge: without the parent post on the page, a pivot is easier to mistake for a bot. Light's bar is 0.8. Balanced is 0.55. Strict and Zen are 0.5.

## Hashtag spam

Six or more hashtags. Settled on device for every preset.

Hide: a one-line hype post with eight tags.

Keep: a patch note that uses two or three tags.

Edge: the count includes the quoted post. Five hashtags still go to the model.

## Emoji spam

Ten or more emoji. Settled on device for every preset.

Hide: a caption that is mostly the same mark repeated.

Keep: a real update with a few marks in the sentence.

Edge: emoji inside a word are counted. Four emoji do not hide.

## Link dump

Five or more http links. Settled on device for every preset.

Hide: "read these" followed by a stack of links and no point.

Keep: a spec, a test log, a rollback plan, and an incident note. That is four links, and it stays.

Edge: the bar used to be four, which hid a normal citation list. It is five so a sourced post can keep its sources.

## Shouting

A long run of capital letters and at least three exclamation marks. Settled on device.

Hide: "THIS IS INSANE!!! SHARE IT BEFORE THEY BAN ME!!!"

Keep: a headline in capitals followed by a normal sentence, with no exclamation marks.

Edge: capitals alone do not hide. The bangs are required so a news headline can stay.

## Media

Images, videos, and GIFs. Each switch hides every post of that kind, unread. All four presets leave the switches off, so a photo or clip stays unless the words fail some other rule.

Hide, with the image switch on: any post that contains a still image, including a useful diagram.

Keep, with the switches off: the same diagram.

Edge: the switch is blunt on purpose. It does not look at the caption. Use it only when you want that medium gone.

## Blocked

The always-hide list. The account disappears on this device and the post is not sent to the model. It wins over every preset. The never-filter list wins over this list if a handle is on both.

Hide: any post from a handle on the list, including a useful changelog.

Keep: the same words from a handle that is not on the list.

## Repeat

After a preset's number of slop or ad hides from one account, the next post can offer to hide the rest. Promoted posts, media-only hides, rage bait, low quality, and your own custom filters do not add to the count. Nothing here mutes or blocks on the site. Auto-hide, once you accept it, hides later posts from that account on every preset.

Hide: the next post after you chose "hide the rest."

Keep: a first offense, and posts that are not slop or ads.

Edge: Light asks after 8. Balanced uses the default of 3. Strict uses 2. Zen uses 1, so the offer appears on the next slop or ad post.

## Custom

A yes/no question you wrote. It hides when the model score clears the bar you set. A higher bar hides fewer posts. A lower bar hides more. Presets do not add questions. An empty label or an empty question is not asked.

Hide: a coin pitch, if your question is "is this a coin pitch?" and the score clears the bar.

Keep: the same question when the score is under the bar, and any post when the question is disabled.

## Other knobs

Hide until checked. On, a new post stays collapsed until a verdict, and returns on its own if the check is still running after eight seconds. Zen turns it on, which is why Zen can delay posts. The others leave it off.

When a post is filtered. Collapse leaves a one-line note. Blur keeps the post in place but unreadable. Remove takes it out of the timeline. This does not change what is filtered.

Hide animation. Particles, blur, or off. This changes how a visible post leaves. It does not change the verdict.

Text size, card style, and tag colors. These change the card, not the decision. AI written is one of the tag colors. The pill on a visible post stays monochrome.

AI-written label. On by default. Visible posts at or above the display floor get the pill. Also hide AI-written posts is off in every preset.

AI and Human marks. Off until you turn them on. They teach the AI-written detector. They do not hide a post, and they do not change the preset you are on.
