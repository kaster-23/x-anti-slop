# x-anti-slop

A browser extension that hides AI-generated slop posts on X while you scroll.
It also includes the optional filters that came with the project it was imported
from: rage bait, ads, promoted posts, and media-only hiding.

Classification uses [Jev](https://docs.typesafe.ai/models), TypeSafe's System
One decision model. The pinned ids are `jev-1.14.0` on the TypeSafe API and
`typesafe/jev-1.14` on OpenRouter. Bring your own key. This extension does not
proxy requests through a server of its own.

If a classification request fails for any reason, the post stays visible.

## Load it unpacked

```bash
pnpm install
pnpm build          # Chrome, MV3 → .output/chrome-mv3
pnpm build:firefox  # Firefox, MV2 → .output/firefox-mv2
```

Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select `.output/chrome-mv3`.

Firefox 142 or newer:

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select `manifest.json` inside `.output/firefox-mv2`.

Firefox asks you to allow transmission of website content. That is the post
text, handle, and display name sent to the provider you pick. The package
requires Firefox 142 or newer, the Android release that added this prompt, so
it cannot transmit posts on a browser that has no prompt.

Icons in `public/icon/` are placeholders carried over from the imported project.

`pnpm dev` rebuilds into `.output/chrome-mv3-dev` and does not launch a browser.
Load that folder unpacked in a Chrome profile that is already signed in to X.

## Set a Jev key

Open the extension's options page, pick a provider, paste a key, and press
**Test**. The key is saved in the browser's extension local storage
(`browser.storage.local`). Only the background worker calls the provider.
The options page and the content script send it messages; they do not call
the API themselves.

| Provider | Endpoint | Default model | Where to get a key |
| --- | --- | --- | --- |
| TypeSafe | `https://api.typesafe.ai/v1/systemone` | `jev-1.14.0` | [console.typesafe.ai](https://console.typesafe.ai/settings/keys) |
| OpenRouter | `https://openrouter.ai/api/alpha/decisions` | `typesafe/jev-1.14` | [openrouter.ai/keys](https://openrouter.ai/keys) |

Leave the model field blank to use the default. Jev on OpenRouter is a
decisions model: it is served from `/api/alpha/decisions`, not from the chat
completions API. A TypeSafe key looks like `apikey_…`. An OpenRouter key looks
like `sk-or-…`.

At the time of writing, [TypeSafe's model docs](https://docs.typesafe.ai/models)
list `jev-1.14.0` as the current model id. `jev-latest` is an alias of that id
and can move when a newer Jev ships, so this extension sends the versioned id.

## What you see on X

The content script watches the timeline as you scroll. Each new post is sent to
the background worker, which asks Jev whether it is slop (and whichever other
filters you left on). A post that scores above your threshold is collapsed,
blurred, or removed, with a **Show** button. A tweet id and its verdict are
cached locally so the same post is not sent twice.

Direct messages and the settings pages are skipped and are never read for
classification.

## Privacy

To classify a post, the extension sends that post's **text**, the author's
**handle**, and the author's **display name** to TypeSafe or OpenRouter,
whichever provider you selected. A quoted post's text is included when one is
on screen, along with flags for media and replies. The image and video bytes
are not uploaded.

The request goes from the background worker straight to that provider with your
key. There is no other backend. Details are in [PRIVACY.md](PRIVACY.md).

## Develop

Tests use [Bun](https://bun.sh). `pnpm install` uses pnpm (see `packageManager`).

```bash
pnpm lint
pnpm compile
pnpm test
pnpm build
pnpm build:firefox
```

`pnpm eval` scores a few labelled sample posts against the live API. It needs
`TYPESAFE_API_KEY` or `PROVIDER=openrouter` plus `OPENROUTER_API_KEY` in the
environment. That script is for local checks; it is not part of CI.

## Credits

The extension code in this repository was imported from
[midplane/clean-twitter](https://github.com/midplane/clean-twitter)
(MIT, Copyright (c) 2026 Nikhil Bafna). The MIT license and that copyright
notice are in [LICENSE](LICENSE), unchanged.

[adamnroman/slop-filter](https://github.com/adamnroman/slop-filter)
(MIT, Copyright (c) 2026 Adam Roman) is credited in [NOTICE](NOTICE). Its
detection logic is not included yet; it is planned to be ported later. No code
from that repository is copied here.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
