import { defineContentScript, browser } from '#imports';
import { TWEET_SELECTOR, extractTweet, readTweetId, type Extracted } from '@/lib/extract';
import { activeCustomFilters } from '@/lib/provider';
import { DEFAULT_SETTINGS, blankKeys } from '@/lib/defaults';
import { redactSecrets } from '@/lib/redact';
import type { Settings, TweetInput, Verdict } from '@/lib/types';
import {
  autoHiddenReason,
  mountAccountSuggestion,
  noteFlaggedHidden,
  startOffenders,
  tagAuthor,
} from './offenders';
import './style.css';

/**
 * Routes whose content must never leave the browser. The content script matches
 * all of x.com, and DMs are private — belt and braces, since direct messages do
 * not render as `article[data-testid="tweet"]` in the first place.
 */
const EXCLUDED_PATHS = [/^\/messages(\/|$)/i, /^\/settings(\/|$)/i];

function onExcludedRoute(): boolean {
  return EXCLUDED_PATHS.some((re) => re.test(location.pathname));
}

/** Posts masked while awaiting a verdict are revealed anyway after this long. */
const FAILSAFE_MS = 6000;
/** Collects posts scrolled into view before sending, to batch the round trip. */
const BATCH_DEBOUNCE_MS = 120;

export default defineContentScript({
  matches: ['*://x.com/*', '*://twitter.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',

  async main(ctx) {
    let settings = DEFAULT_SETTINGS;
    let hasKey = false;

    /** X recycles DOM nodes, so decisions are remembered per status id rather
     *  than per element. */
    const decided = new Map<string, Verdict | 'local'>();
    const revealed = new Set<string>();
    const queue = new Map<string, TweetInput>();
    let flushTimer: number | undefined;
    let scanTimer: number | undefined;
    /** Bumped on every settings push. In-flight scans and failsafe timers
     *  captured the previous value and must not apply it afterwards. */
    let epoch = 0;
    let ready = false;
    let stopOffenders = () => {};

    async function applySettings(generation: number) {
      try {
        const next = await loadTimeline();
        if (generation !== epoch || ctx.isInvalid) return;
        settings = next.settings;
        hasKey = next.hasKey;
      } catch (err) {
        // Fail open: a settings read that throws should not leave posts hidden.
        console.warn('[x-anti-slop] settings load failed', errorText(err));
        if (generation !== epoch || ctx.isInvalid) return;
        settings = { ...settings, enabled: false };
        hasKey = false;
      }
      if (generation !== epoch || ctx.isInvalid) return;
      ready = true;
      decided.clear();
      queue.clear();
      if (flushTimer !== undefined) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      resetAll();
      scan();
    }

    const onMessage = (message: { type?: string }) => {
      if (message?.type !== 'settingsChanged') return;
      void applySettings(++epoch);
    };

    browser.runtime.onMessage.addListener(onMessage);

    const observer = new MutationObserver(() => scheduleScan());
    const root = document.body ?? document.documentElement;
    observer.observe(root, { childList: true, subtree: true });

    try {
      stopOffenders = await startOffenders({
        rescan: () => {
          decided.clear();
          queue.clear();
          resetAll();
          scan();
        },
      });
    } catch (err) {
      // Repeat-offender memory is optional. A storage failure leaves posts visible
      // to the rest of the filter instead of stopping the content script.
      console.warn('[x-anti-slop] repeat-offender memory unavailable', err);
    }

    // A re-injected script (extension reload or update) invalidates this
    // context. Without the disconnect, the old observer and listener keep
    // running beside the new ones for the rest of the tab.
    ctx.onInvalidated(() => {
      observer.disconnect();
      browser.runtime.onMessage.removeListener(onMessage);
      stopOffenders();
    });

    await applySettings(++epoch);

    function scheduleScan() {
      if (!ready || ctx.isInvalid) return;
      if (scanTimer !== undefined) return;
      scanTimer = ctx.setTimeout(() => {
        scanTimer = undefined;
        scan();
      }, 60);
    }

    function scan() {
      if (!ready || ctx.isInvalid) return;
      if (!settings.enabled || onExcludedRoute()) return;
      for (const article of document.querySelectorAll<HTMLElement>(TWEET_SELECTOR)) {
        process(article);
      }
    }

    function process(article: HTMLElement) {
      // Our own placeholders re-trigger the observer, so most articles seen
      // here are already settled. But X recycles article nodes for new posts,
      // keeping our attributes, so a settled state counts only if the id matches.
      const settled = article.dataset.ctState !== undefined
        && article.dataset.ctState !== 'pending';
      if (settled && article.dataset.ctId === readTweetId(article)) return;

      const tweet = extractTweet(article);
      if (!tweet) return;

      // Promoted posts have no permalink, so they carry a content-hash id that
      // the cheap check above can't produce; re-compare before reprocessing.
      if (settled) {
        if (article.dataset.ctId === tweet.id) return;
        // The node now shows a different post. Its placeholder still carries the
        // previous post's reason, and a Show handler closed over the previous
        // id, so the cell has to be stripped before this post is decided.
        delete article.dataset.ctState;
        delete article.dataset.ctAuthor;
        clearCell(cellOf(article));
      }

      article.dataset.ctId = tweet.id;
      if (isAllowlisted(tweet.author, settings)) {
        delete article.dataset.ctAuthor;
        return;
      }
      tagAuthor(article, tweet.author);

      // Local decision, before the model and before this post is counted, so
      // the suggestion lands on the following post rather than the one that
      // crossed the threshold.
      const autoReason = autoHiddenReason(tweet.author);
      if (autoReason) {
        decided.set(tweet.id, 'local');
        hide(article, tweet.id, autoReason);
        return;
      }
      mountAccountSuggestion(article, tweet.author, settings.repeatThreshold);

      if (revealed.has(tweet.id)) return;

      const prior = decided.get(tweet.id);
      if (prior && prior !== 'local') {
        if (article.dataset.ctState === undefined) applyVerdict(article, tweet, prior);
        return;
      }

      const local = localVerdict(tweet, settings);
      if (local) {
        decided.set(tweet.id, 'local');
        hide(article, tweet.id, local);
        noteFlaggedHidden(tweet, settings.repeatThreshold);
        return;
      }
      if (prior === 'local') return;

      if (!needsModel(settings)) return;
      if (!hasKey) return;
      // A post with no text gives the model nothing to judge.
      if (!tweet.text && !tweet.quotedText) return;

      if (article.dataset.ctState === 'pending') return;
      if (settings.hideUntilChecked) mask(article, tweet.id);

      queue.set(tweet.id, toInput(tweet));
      scheduleFlush();
    }

    function scheduleFlush() {
      if (flushTimer !== undefined) return;
      flushTimer = ctx.setTimeout(() => {
        flushTimer = undefined;
        void flush();
      }, BATCH_DEBOUNCE_MS);
    }

    async function flush() {
      const generation = epoch;
      if (queue.size === 0) return;
      const tweets = [...queue.values()];
      queue.clear();

      let verdicts: Verdict[] = [];
      try {
        const res = (await browser.runtime.sendMessage({ type: 'classify', tweets })) as {
          verdicts?: Verdict[];
          error?: string;
        };
        if (generation !== epoch || ctx.isInvalid) return;
        verdicts = res?.verdicts ?? [];
        if (res?.error) console.warn('[x-anti-slop]', redactSecrets(res.error));
      } catch (err) {
        console.warn('[x-anti-slop] classify failed', errorText(err));
        if (generation !== epoch || ctx.isInvalid) return;
      }

      if (generation !== epoch || ctx.isInvalid) return;

      const byId = new Map(verdicts.map((v) => [v.id, v]));
      for (const tweet of tweets) {
        const verdict = byId.get(tweet.id);
        if (!verdict || verdict.error) {
          // Failing open: a post is never hidden because the API broke.
          if (verdict?.error) console.warn('[x-anti-slop]', redactSecrets(verdict.error));
          unmaskById(tweet.id);
          continue;
        }
        decided.set(tweet.id, verdict);
        for (const article of articlesFor(tweet.id)) applyVerdict(article, tweet, verdict);
      }
    }

    function applyVerdict(article: HTMLElement, tweet: TweetInput, verdict: Verdict) {
      if (verdict.filtered && verdict.reason) {
        hide(article, tweet.id, verdict.reason);
        noteFlaggedHidden(tweet, settings.repeatThreshold);
      } else unmask(article);
    }

    /** The timeline cell wrapping a post; hiding this removes the gap too. */
    function cellOf(article: HTMLElement): HTMLElement {
      return article.closest<HTMLElement>('[data-testid="cellInnerDiv"]') ?? article;
    }

    function articlesFor(id: string): HTMLElement[] {
      const out: HTMLElement[] = [];
      for (const article of document.querySelectorAll<HTMLElement>(TWEET_SELECTOR)) {
        if (article.dataset.ctId === id) out.push(article);
      }
      return out;
    }

    function mask(article: HTMLElement, id: string) {
      const generation = epoch;
      article.dataset.ctState = 'pending';
      cellOf(article).classList.add('ct-pending');
      ctx.setTimeout(() => {
        // The node may have been recycled for a different post by now; unmasking
        // then would flash the new post into view mid-check. A settings change
        // starts a new check on the same id, and this timer must not end it.
        if (generation !== epoch) return;
        if (article.dataset.ctId !== id) return;
        if (article.dataset.ctState === 'pending') unmask(article);
      }, FAILSAFE_MS);
    }

    function unmask(article: HTMLElement) {
      article.dataset.ctState = 'shown';
      cellOf(article).classList.remove('ct-pending');
    }

    /** Strips every trace of a previous verdict from a timeline cell. */
    function clearCell(cell: HTMLElement) {
      cell.classList.remove('ct-pending', 'ct-collapsed', 'ct-blurred', 'ct-removed');
      cell.querySelector('.ct-placeholder')?.remove();
      cell.querySelector('.ct-suggest')?.remove();
    }

    function unmaskById(id: string) {
      for (const article of articlesFor(id)) unmask(article);
    }

    function hide(article: HTMLElement, id: string, reason: string) {
      article.dataset.ctState = 'hidden';
      const cell = cellOf(article);
      cell.classList.remove('ct-pending');

      if (settings.hideMode === 'remove') {
        cell.classList.add('ct-removed');
        return;
      }

      cell.classList.add(settings.hideMode === 'blur' ? 'ct-blurred' : 'ct-collapsed');
      if (cell.querySelector('.ct-placeholder')) return;

      const placeholder = document.createElement('div');
      placeholder.className = 'ct-placeholder';

      const dot = document.createElement('span');
      dot.className = 'ct-dot';

      const reasonEl = document.createElement('span');
      reasonEl.className = 'ct-reason';
      reasonEl.textContent = reason;

      const show = document.createElement('button');
      show.type = 'button';
      show.className = 'ct-show';
      show.textContent = 'Show';
      show.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();
        revealed.add(id);
        cell.classList.remove('ct-collapsed', 'ct-blurred', 'ct-removed');
        article.dataset.ctState = 'revealed';
        placeholder.remove();
      });

      placeholder.append(dot, reasonEl, show);
      cell.prepend(placeholder);
    }

    function resetAll() {
      for (const cell of document.querySelectorAll<HTMLElement>(
        '.ct-pending, .ct-collapsed, .ct-blurred, .ct-removed',
      )) {
        clearCell(cell);
      }
      for (const node of document.querySelectorAll('.ct-placeholder, .ct-suggest')) node.remove();
      for (const article of document.querySelectorAll<HTMLElement>(TWEET_SELECTOR)) {
        delete article.dataset.ctState;
        delete article.dataset.ctAuthor;
      }
    }
  },
});

/** Settings and key presence from the background worker. The key itself is never included. */
async function loadTimeline(): Promise<{ settings: Settings; hasKey: boolean }> {
  const res = (await browser.runtime.sendMessage({ type: 'getPublicSettings' })) as {
    settings?: Settings;
    hasKey?: boolean;
  };
  if (!res?.settings) throw new Error('Settings unavailable');
  return { settings: blankKeys(res.settings), hasKey: res.hasKey === true };
}

function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return redactSecrets(message);
}

function toInput(t: Extracted): TweetInput {
  return {
    id: t.id,
    author: t.author,
    authorName: t.authorName,
    text: t.text,
    quotedText: t.quotedText,
    hasImage: t.hasImage,
    hasVideo: t.hasVideo,
    isReply: t.isReply,
    isQuote: t.isQuote,
  };
}

function needsModel(s: Settings): boolean {
  return (
    Object.values(s.signals).some((c) => c.enabled) ||
    s.minQuality > 0 ||
    activeCustomFilters(s).length > 0
  );
}

function isAllowlisted(author: string, s: Settings): boolean {
  if (!author) return false;
  const handle = author.replace(/^@/, '').toLowerCase();
  return s.allowlist.some((h) => h.replace(/^@/, '').toLowerCase() === handle);
}

/** Filters that need no model call. Returns a reason string when it matches. */
function localVerdict(tweet: Extracted, s: Settings): string | null {
  if (s.hidePromoted && tweet.promoted) return 'Promoted';
  if (s.mediaFilters.images && tweet.media.hasImage) return 'Image post';
  if (s.mediaFilters.videos && tweet.media.hasVideo) return 'Video post';
  if (s.mediaFilters.gifs && tweet.media.hasGif) return 'GIF post';
  return null;
}
