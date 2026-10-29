import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // Don't launch a throwaway browser in dev. Load `.output/chrome-mv3-dev` as an
  // unpacked extension in your own Chrome instead — it keeps your X session, and
  // WXT's reload client still connects to the dev server, so saves auto-apply.
  webExt: { disabled: true },
  // A function, so Firefox-only keys stay out of the Chrome manifest — Chrome
  // logs "Unrecognized manifest key" for them and store review flags it.
  manifest: ({ browser }) => ({
    name: 'X-AntiSlop',
    description:
      'Hides AI-generated slop posts on X while you scroll, using TypeSafe Jev.',
    permissions: ['storage'],
    host_permissions: [
      // The background worker calls whichever provider the user picked.
      'https://api.typesafe.ai/*',
      'https://openrouter.ai/api/*',
      // Needed so tabs.query() can find open timelines to push settings changes
      // to; a content_scripts match alone does not grant this.
      '*://x.com/*',
      '*://twitter.com/*',
    ],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'x-anti-slop@kaster-23',
              // New Firefox extensions must declare off-device transmission.
              // The background worker sends post text (and a trimmed quote) off-device.
              data_collection_permissions: {
                required: ['websiteContent'],
              },
            },
          },
        }
      : {}),
  }),
});
