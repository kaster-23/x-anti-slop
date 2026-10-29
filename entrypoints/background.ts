import { defineBackground, browser } from '#imports';
import {
  classify,
  clearCache,
  coerceStats,
  errorStore,
  readError,
  rememberLocalDecisions,
  resetStats,
} from '@/lib/classifier';
import { loadSettings, settingsStore, statsStore } from '@/lib/settings';
import { testCredentials, testFilter } from '@/lib/provider';
import { activeKey, blankKeys } from '@/lib/defaults';
import { redactSecrets } from '@/lib/redact';
import type { Message } from '@/lib/types';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    handle(message).then(sendResponse, (err: Error) =>
      sendResponse({ error: redactSecrets(err.message) }),
    );
    return true; // keeps the message channel open for the async response
  });

  // Cached verdicts survive settings changes: entries record the question set
  // that produced them and thresholds are applied at read time, so moving a
  // threshold costs nothing and enabling a signal re-checks only what it must.
  //
  // Debounced because settings are saved per keystroke and per slider tick, and
  // each broadcast makes every open timeline drop its decisions and rescan. A
  // custom filter's wording is part of the cache signature, so an undebounced
  // broadcast would also re-classify the visible posts on every keystroke.
  let broadcastTimer: ReturnType<typeof setTimeout> | undefined;
  settingsStore.watch(() => {
    clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(broadcastSettingsChanged, 400);
  });
});

async function broadcastSettingsChanged() {
  const tabs = await browser.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] });
  for (const tab of tabs) {
    if (tab.id !== undefined) {
      browser.tabs.sendMessage(tab.id, { type: 'settingsChanged' }).catch(() => {
        /* tab has no content script yet */
      });
    }
  }
}

async function handle(message: Message) {
  switch (message.type) {
    case 'classify': {
      const settings = await loadSettings();
      return { verdicts: await classify(message.tweets, settings) };
    }
    case 'recordLocal': {
      const settings = await loadSettings();
      await rememberLocalDecisions(message.decisions ?? [], settings);
      return { ok: true };
    }
    case 'getSettings':
      return { settings: blankKeys(await loadSettings()) };
    case 'getPublicSettings': {
      const settings = await loadSettings();
      return { settings: blankKeys(settings), hasKey: activeKey(settings).length > 0 };
    }
    case 'getStats':
      return { stats: coerceStats(await statsStore.getValue()) };
    // Distinct key: `error` is also how a rejected handler reports itself, and
     // the popup would render that string as if it were the stored object.
    case 'getError':
      return { lastError: await readError() };
    case 'dismissError':
      await errorStore.setValue(null);
      return { ok: true };
    case 'clearCache':
      await clearCache();
      // The content script keeps its own verdict map. Tell open timelines to
      // drop it and ask again, now that the persisted cache is empty.
      try {
        await broadcastSettingsChanged();
      } catch {
        /* a timeline picks the empty cache up on its next settings change */
      }
      return { ok: true };
    case 'resetStats':
      await resetStats();
      return { ok: true };
    case 'testKey':
      return await testCredentials(message.provider, message.apiKey, message.model);
    case 'testFilter': {
      const settings = await loadSettings();
      const key = activeKey(settings);
      if (!key) return { ok: false, error: 'Add an API key first.' };
      return await testFilter(settings, key, message.filter, message.text);
    }
    default:
      return { error: 'Unknown message' };
  }
}
