# x-anti-slop

A browser extension that hides AI-generated slop posts on X (x.com and
twitter.com) while you scroll. Classification uses [Jev](https://docs.typesafe.ai/models),
TypeSafe's System One decision model. You bring your own TypeSafe or OpenRouter
key. Nothing is proxied through a server of ours.

Filtered posts collapse to a one-line note with a **Show** button (blur and
remove are also available). A network error, a bad key, a timeout, or any other
failure leaves the post visible.

The extension code is imported from
[midplane/clean-twitter](https://github.com/midplane/clean-twitter) (MIT,
Copyright (c) 2026 Nikhil Bafna). AI-slop detection is ported from
[adamnroman/slop-filter](https://github.com/adamnroman/slop-filter) (MIT,
Copyright (c) 2026 Adam Roman): about thirty writing-style questions in one
Jev call per post, local counts, and weights you can fit from your own marks.
See [NOTICE](NOTICE). There is no hosted scoring backend.

## Install unpacked

Requires Node.js 22 and [pnpm](https://pnpm.io/).

```bash
git clone https://github.com/kaster-23/x-anti-slop.git
cd x-anti-slop
pnpm install
pnpm build
```

Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select the `.output/chrome-mv3` directory.

Firefox:

```bash
pnpm build:firefox
```

Load `.output/firefox-mv2` as a temporary add-on (`about:debugging` → This
Firefox → Load Temporary Add-on, and pick `manifest.json` inside that folder).
Firefox asks you to allow sending website content and personal communications
(the post text, handle, and display name) before the extension can run.

## API key

Open the extension's options page, pick a provider, paste your key, and hit
**Test**. The key is saved in the browser's extension local storage
(`storage.local`). Only the background worker sends it to the provider. The
timeline script asks the worker to classify posts and never calls the API
itself.

| Provider | Endpoint | Default model | Where to get a key |
| --- | --- | --- | --- |
| TypeSafe (direct) | `https://api.typesafe.ai/v1/systemone` | `jev-1.14.0` | [console.typesafe.ai](https://console.typesafe.ai/settings/keys) |
| OpenRouter | `https://openrouter.ai/api/alpha/decisions` | `typesafe/jev-1.14` | [openrouter.ai/keys](https://openrouter.ai/keys) |

Both routes take `{ model, state, questions }`. `state` is the tweet text (a
string, or one object that holds that text). Each question is
`{ type, instructions, criteria }`. Noul criteria are `{ true, false }` and the
answer is a probability with no confidence field. Choice criteria are
`{ option: description }`. Score criteria are an ordered list of at most 10
levels; an 11th is rejected. The style bank is about 30 questions sent in that
one request per post: a 30-question call has the same warm latency as a
3-question call (about 80–125 ms) at about twice the tokens (about 1,070 input
tokens).

Jev on OpenRouter is a decisions model: it is served from
`/api/alpha/decisions` and rejected by `/api/v1/chat/completions`.

Leave the model field blank to use the default. The defaults are the current
versioned ids from the TypeSafe models page and the OpenRouter Jev guide
(checked 29 October 2026). `jev-latest` on TypeSafe aliases `jev-1.14.0`, and
`~typesafe/jev-latest` on OpenRouter tracks the newest release. This extension
pins the versioned ids so a later alias move does not silently change the
thresholds.

TypeSafe keys look like `apikey_…`. OpenRouter keys look like `sk-or-…`.

## Privacy

For each post that has not already been judged, the background worker sends the
author's handle, display name, and post text (plus quoted text, when present)
to the provider you selected. It also sends whether the post has an image or
video, and whether it is a reply. It does not upload the media itself.

Direct messages and the settings pages are excluded. Verdicts are cached by
tweet id, so a post is sent at most once until you clear the cache. The full
policy is in [PRIVACY.md](PRIVACY.md).

## What gets filtered

**Model-backed**, each with its own confidence threshold:

- **AI slop** — one Jev request asks ~30 narrow questions about how the post is written (not what it means). Local code counts em dashes, stock AI vocabulary, and templated structures. A weighted score combines them. Each writing-style bucket also has its own threshold, and a bot-style reply inside a thread uses a lower one. Mark a post AI or Human on the timeline; the options page fits the weights from those marks and stores them locally.
- **Rage bait** — engineered outrage and dunks
- **Ads and shilling** — sales pitches, affiliate spam, crypto promos
- **Your own yes/no questions**, written on the options page

**No API call** — read from the page:

- Promoted posts
- Images, videos, or GIFs, if you turn those on

## Development

```bash
pnpm lint        # eslint
pnpm compile     # tsc --noEmit
pnpm test        # unit tests (bun)
pnpm build       # Chrome MV3 → .output/chrome-mv3
pnpm build:firefox
```

`pnpm dev` does not launch a browser. Load `.output/chrome-mv3-dev` unpacked in
a Chrome profile that is already signed in to X.

`pnpm eval` compares the style scorer with the clean-twitter baseline (one
broad slop question) on a small labelled set. With no `TYPESAFE_API_KEY` it
uses recorded answers and says so. CI runs that path. One post per request
when the key is set:

```bash
pnpm eval
TYPESAFE_API_KEY=… pnpm eval
```

## Layout

```
lib/provider.ts       TypeSafe and OpenRouter calls, retry
lib/detect/           style questions, local counts, score, label fitting
lib/classifier.ts     verdict cache, concurrency, thresholds
lib/extract.ts        reading posts out of X's DOM
lib/settings.ts       extension local storage
entrypoints/
  background.ts    holds the key and is the only caller of the API
  content/         watches the timeline and applies verdicts
  popup/           toggles
  options/         provider, key, filters
```

## License

[MIT](LICENSE). Copyright (c) 2026 Nikhil Bafna. Ported detection code:
Copyright (c) 2026 Adam Roman and Copyright (c) 2026 wilu222. Credits:
[NOTICE](NOTICE).
