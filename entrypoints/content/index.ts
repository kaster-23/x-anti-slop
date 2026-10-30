import { defineContentScript, browser } from '#imports';
import { TWEET_SELECTOR, extractTweet, readTweetId, type Extracted } from '@/lib/extract';
import { activeCustomFilters } from '@/lib/provider';
import { DEFAULT_SETTINGS, blankKeys } from '@/lib/defaults';
import { prefilter, type PrefilterPost } from '@/lib/prefilter';
import { reportContentFailure, runContentTask, runtimeAlive } from '@/lib/extension-context';
import { loadOverlayPlacement, overlayStore, saveOverlayPlacement } from '@/lib/overlay-store';
import { redactSecrets } from '@/lib/redact';
import type { Settings, TweetInput, Verdict } from '@/lib/types';
import {
  HIDE_UNTIL_CHECKED_FAILSAFE_MS,
  distanceToViewport,
  prefetchRootMargin,
} from '@/lib/viewport';
import { meterGlassTheme, readFeedTheme } from '@/lib/card-style';
import { paintFeedCard, restyleFeedCards, setCardAppearance } from './cards';
import { activeDusts, cancelAllDusts, cancelDust, playDust } from './dust';
import { hideMotion, isOnScreen } from '@/lib/hide-motion';
import { clearAiWrittenPill, mountAiWrittenPill } from './ai-pill';
import { watchHideEffect } from './hide-effect';
import { mountMeter } from './meter';
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

/** Collects posts that entered the prefetch margin before sending one batch. */
const BATCH_DEBOUNCE_MS = 120;

export default defineContentScript({
  matches: ['*://x.com/*', '*://twitter.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',

  async main(ctx) {
    const alive = () => !ctx.isInvalid && runtimeAlive(() => browser.runtime);
    if (!alive()) return;

    let settings = DEFAULT_SETTINGS;
    let hasKey = false;
    const meter = mountMeter(document, {
      alive,
      loadPlacement: loadOverlayPlacement,
      savePlacement: saveOverlayPlacement,
      watchPlacement: (onChange) => overlayStore.watch((value) => onChange(value)),
      openSettings: () => browser.runtime.sendMessage({ type: 'openOptions' }),
    });
    const session = { checked: 0, hidden: 0, settledLocally: 0, cost: 0 };
    const metered = new Set<string>();

    /** X recycles DOM nodes, so decisions are remembered per status id rather
     *  than per element. */
    const decided = new Map<string, Verdict | 'local'>();
    const revealed = new Set<string>();
    const outbound = new Map<string, { tweet: TweetInput; article: HTMLElement }>();
    const inflightIds = new Set<string>();
    const reported = new Set<string>();
    const localBatch: Array<{ id: string; filtered: boolean; reason: string }> = [];
    const inZone = new Set<HTMLElement>();
    let flushTimer: number | undefined;
    let localTimer: number | undefined;
    let scanTimer: number | undefined;
    /** Bumped on every settings push. In-flight scans and failsafe timers
     *  captured the previous value and must not apply it afterwards. */
    let epoch = 0;
    let ready = false;
    let stopOffenders = () => {};

    const meterVisible = () => ready && settings.enabled && !onExcludedRoute();

    async function applySettings(generation: number) {
      if (!alive()) return;
      try {
        const next = await loadTimeline();
        if (generation !== epoch || !alive()) return;
        settings = next.settings;
        hasKey = next.hasKey;
      } catch (err) {
        // Fail open: a settings read that throws should not leave posts hidden.
        // A dead context is expected after reload and must not be logged.
        reportContentFailure('settings load failed', err, alive());
        if (generation !== epoch || !alive()) return;
        settings = { ...settings, enabled: false };
        hasKey = false;
      }
      if (generation !== epoch || !alive()) return;
      ready = true;
      decided.clear();
      outbound.clear();
      inflightIds.clear();
      reported.clear();
      dropLocalBatch();
      if (flushTimer !== undefined) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      setCardAppearance(settings.cards);
      meter.setAnimatedBorder(settings.cards.animatedBorder);
      meter.setTheme(meterGlassTheme(readFeedTheme(document)));
      resetAll();
      meter.setVisible(meterVisible());
      scan();
    }

    const onMessage = (message: { type?: string }) => {
      if (message?.type !== 'settingsChanged') return;
      void applySettings(++epoch);
    };

    try {
      if (alive()) browser.runtime.onMessage.addListener(onMessage);
    } catch (err) {
      reportContentFailure('could not listen for settings', err, alive());
    }

    await runContentTask(
      alive(),
      async () => {
        const storedLabels = (await browser.runtime.sendMessage({ type: 'getLabels' })) as {
          labels?: Record<string, 0 | 1>;
        };
        for (const [id, label] of Object.entries(storedLabels?.labels ?? {})) labeled.set(id, label);
      },
      'could not load labels',
    );

    const observer = new MutationObserver((mutations) => {
      if (!mutationMatters(mutations)) return;
      scheduleScan();
    });
    const root = document.body ?? document.documentElement;
    observer.observe(root, { childList: true, subtree: true });

    let io = makeObserver();

    const onResize = () => {
      if (resizeTimer !== undefined) clearTimeout(resizeTimer);
      resizeTimer = ctx.setTimeout(() => {
        resizeTimer = undefined;
        io.disconnect();
        io = makeObserver();
        inZone.clear();
        for (const article of document.querySelectorAll<HTMLElement>(TWEET_SELECTOR)) {
          delete article.dataset.ctWatch;
        }
        scan();
      }, 150);
    };
    let resizeTimer: number | undefined;
    window.addEventListener('resize', onResize);

    let themeTimer: number | undefined;
    const onTheme = () => {
      if (!alive() || themeTimer !== undefined) return;
      themeTimer = ctx.setTimeout(() => {
        themeTimer = undefined;
        if (!alive()) return;
        restyleFeedCards(document);
        meter.setTheme(meterGlassTheme(readFeedTheme(document)));
      }, 50);
    };
    const themeObserver = new MutationObserver(onTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    if (document.body) {
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
    }

    try {
      stopOffenders = await startOffenders({
        alive,
        rescan: () => {
          if (!alive()) return;
          decided.clear();
          outbound.clear();
          resetAll();
          scan();
        },
      });
    } catch (err) {
      // Repeat-offender memory is optional. A storage failure leaves posts visible
      // to the rest of the filter instead of stopping the content script.
      reportContentFailure('repeat-offender memory unavailable', err, alive());
    }

    // A re-injected script (extension reload or update) invalidates this
    // context. Without the disconnect, the old observer and listener keep
    // running beside the new ones for the rest of the tab.
    ctx.onInvalidated(() => {
      observer.disconnect();
      io.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('resize', onResize);
      try {
        browser.runtime.onMessage.removeListener(onMessage);
      } catch (err) {
        reportContentFailure('could not remove settings listener', err, false);
      }
      cancelAllDusts();
      meter.remove();
      stopOffenders();
    });

    await applySettings(++epoch);

    function makeObserver() {
      return new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const article = entry.target as HTMLElement;
            if (entry.isIntersecting) {
              inZone.add(article);
              process(article);
            } else {
              inZone.delete(article);
            }
          }
        },
        {
          root: null,
          rootMargin: prefetchRootMargin(window.innerHeight),
          threshold: 0,
        },
      );
    }

    function scheduleScan() {
      if (!ready || !alive()) return;
      if (scanTimer !== undefined) return;
      scanTimer = ctx.setTimeout(() => {
        scanTimer = undefined;
        scan();
      }, 60);
    }

    function scan() {
      if (!ready || !alive()) return;
      meter.setVisible(meterVisible());
      if (!settings.enabled || onExcludedRoute()) return;
      for (const article of document.querySelectorAll<HTMLElement>(TWEET_SELECTOR)) {
        if (article.dataset.ctWatch !== '1') {
          article.dataset.ctWatch = '1';
          io.observe(article);
        } else if (inZone.has(article)) {
          process(article);
        }
      }
    }

    function process(article: HTMLElement) {
      if (!article.isConnected) {
        inZone.delete(article);
        return;
      }

      // Our own placeholders re-trigger the observer, so most articles seen
      // here are already settled. But X recycles article nodes for new posts,
      // keeping our attributes, so a settled state counts only if the id matches.
      const settled =
        article.dataset.ctState !== undefined && article.dataset.ctState !== 'pending';
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
        delete article.dataset.ctSeen;
        clearCell(cellOf(article));
      }

      article.dataset.ctId = tweet.id;
      const decision = prefilter(toPrefilter(tweet), settings);
      if (decision.action === 'show' && decision.reason === 'Allowlisted') {
        delete article.dataset.ctAuthor;
        decided.set(tweet.id, 'local');
        unmask(article);
        noteLocal(tweet.id, false, decision.reason);
        return;
      }
      tagAuthor(article, tweet.author);

      // Local decision, before the model and before this post is counted, so
      // the suggestion lands on the following post rather than the one that
      // crossed the threshold.
      const autoReason = autoHiddenReason(tweet.author);
      if (autoReason) {
        decided.set(tweet.id, 'local');
        hide(article, toInput(tweet), {
          id: tweet.id,
          scores: {},
          filtered: true,
          reason: autoReason,
        });
        return;
      }
      mountAccountSuggestion(article, tweet.author, settings.repeatThreshold);

      if (revealed.has(tweet.id)) {
        article.dataset.ctState = 'revealed';
        return;
      }

      const prior = decided.get(tweet.id);
      if (prior && prior !== 'local') {
        if (article.dataset.ctState !== 'shown' && article.dataset.ctState !== 'revealed') {
          applyVerdict(article, tweet, prior, false);
        }
        if (!prior.error) noteModel(prior);
        return;
      }

      if (decision.action !== 'model') {
        decided.set(tweet.id, 'local');
        if (decision.action === 'hide') {
          hide(article, toInput(tweet), {
            id: tweet.id,
            scores: {},
            filtered: true,
            reason: decision.reason,
          });
          noteFlaggedHidden(tweet, settings.repeatThreshold, decision.reason);
        } else {
          unmask(article);
        }
        noteLocal(tweet.id, decision.action === 'hide', decision.reason);
        return;
      }

      if (!needsModel(settings) || !hasKey) return;
      if (outbound.has(tweet.id) || inflightIds.has(tweet.id)) return;

      if (settings.hideUntilChecked && article.dataset.ctState !== 'pending') {
        mask(article, tweet.id);
      } else if (!settings.hideUntilChecked) {
        notePainted(article);
      }
      outbound.set(tweet.id, { tweet: toInput(tweet), article });
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
      if (outbound.size === 0 || !alive()) return;
      const tweets = [...outbound.values()]
        .map((item) => ({
          ...item.tweet,
          priority: priorityOf(item.article, item.tweet.id),
        }))
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
      outbound.clear();
      for (const tweet of tweets) inflightIds.add(tweet.id);

      let verdicts: Verdict[] = [];
      try {
        const res = (await browser.runtime.sendMessage({ type: 'classify', tweets })) as {
          verdicts?: Verdict[];
          error?: string;
        };
        if (generation !== epoch || !alive()) return;
        verdicts = res?.verdicts ?? [];
        if (res?.error) console.warn('[x-anti-slop]', redactSecrets(res.error));
      } catch (err) {
        reportContentFailure('classify failed', err, alive());
        if (generation !== epoch || !alive()) return;
      }

      if (generation !== epoch || !alive()) return;

      const byId = new Map(verdicts.map((v) => [v.id, v]));
      for (const tweet of tweets) {
        inflightIds.delete(tweet.id);
        const autoReason = autoHiddenReason(tweet.author);
        if (autoReason) {
          decided.set(tweet.id, 'local');
          for (const article of articlesFor(tweet.id)) {
            hide(article, tweet, {
              id: tweet.id,
              scores: {},
              filtered: true,
              reason: autoReason,
            });
          }
          continue;
        }
        const verdict = byId.get(tweet.id);
        if (!verdict || verdict.error) {
          // Failing open: a post is never hidden because the API broke.
          if (verdict?.error) console.warn('[x-anti-slop]', redactSecrets(verdict.error));
          decided.set(tweet.id, {
            id: tweet.id,
            scores: {},
            filtered: false,
            error: verdict?.error ?? 'Classification failed',
          });
          unmaskById(tweet.id);
          continue;
        }
        decided.set(tweet.id, verdict);
        noteModel(verdict);
        for (const article of articlesFor(tweet.id)) applyVerdict(article, tweet, verdict, true);
      }
    }

    function priorityOf(article: HTMLElement, id: string): number {
      if (!article.isConnected || article.dataset.ctId !== id) return Number.POSITIVE_INFINITY;
      return distanceToViewport(article.getBoundingClientRect(), window.innerHeight);
    }

    function applyVerdict(
      article: HTMLElement,
      tweet: TweetInput,
      verdict: Verdict,
      allowAnimation: boolean,
    ) {
      if (verdict.filtered && verdict.reason) {
        hide(article, tweet, verdict, allowAnimation);
        noteFlaggedHidden(tweet, settings.repeatThreshold, verdict.reason);
      } else {
        unmask(article);
        mountAiWrittenPill(article, verdict.scores, settings);
        mountLabels(article, tweet, verdict, settings.labeling);
      }
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
      }, HIDE_UNTIL_CHECKED_FAILSAFE_MS);
    }

    function unmask(article: HTMLElement) {
      article.dataset.ctState = 'shown';
      cellOf(article).classList.remove('ct-pending');
      notePainted(article);
    }

    /** Two frames later the post has actually been painted, if it is still on screen. */
    function notePainted(article: HTMLElement) {
      if (article.dataset.ctSeen === '1') return;
      const view = article.ownerDocument.defaultView;
      if (!view) return;
      view.requestAnimationFrame(() => {
        view.requestAnimationFrame(() => {
          if (!alive() || !article.isConnected) return;
          if (article.dataset.ctState === 'hidden' || article.dataset.ctState === 'pending') return;
          if (!isOnScreen(article.getBoundingClientRect(), { width: view.innerWidth, height: view.innerHeight })) {
            return;
          }
          article.dataset.ctSeen = '1';
        });
      });
    }

    const hideWaits = new Map<HTMLElement, () => void>();

    function stopHideWait(cell: HTMLElement) {
      hideWaits.get(cell)?.();
      hideWaits.delete(cell);
    }

    function reducedMotion(): boolean {
      try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch {
        return false;
      }
    }

    /** Strips every trace of a previous verdict from a timeline cell. */
    function clearCell(cell: HTMLElement) {
      stopHideWait(cell);
      cancelDust(cell);
      cell.classList.remove('ct-pending', 'ct-collapsed', 'ct-blurred', 'ct-removed');
      cell.querySelector('.ct-placeholder')?.remove();
      cell.querySelector('.ct-suggest')?.remove();
      cell.querySelector('.ct-labelbar')?.remove();
      clearAiWrittenPill(articleFromCell(cell));
    }

    function unmaskById(id: string) {
      for (const article of articlesFor(id)) unmask(article);
    }

    function hide(article: HTMLElement, tweet: TweetInput, verdict: Verdict, allowAnimation = false) {
      const id = tweet.id;
      clearAiWrittenPill(article);
      article.dataset.ctState = 'hidden';
      const cell = cellOf(article);
      cell.classList.remove('ct-pending');

      if (settings.hideMode === 'remove') {
        cell.classList.add('ct-removed');
        return;
      }

      if (cell.querySelector('.ct-placeholder')) {
        cell.classList.add(settings.hideMode === 'blur' ? 'ct-blurred' : 'ct-collapsed');
        mountLabels(article, tweet, verdict, settings.labeling);
        return;
      }

      const placeholder = document.createElement('div');
      placeholder.className = 'ct-placeholder';
      const chrome = paintFeedCard(placeholder, verdict.reason ?? '', verdict.botReply === true);

      const chip = document.createElement('span');
      chip.className = 'ct-tag';
      chip.textContent = chrome.chip;

      const reasonEl = document.createElement('span');
      reasonEl.className = 'ct-reason';
      reasonEl.textContent = chrome.detail;
      reasonEl.hidden = chrome.detail.length === 0;

      const show = document.createElement('button');
      show.type = 'button';
      show.className = 'ct-show';
      show.textContent = 'Show';
      show.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();
        stopHideWait(cell);
        cancelDust(cell);
        revealed.add(id);
        cell.classList.remove('ct-collapsed', 'ct-blurred', 'ct-removed');
        article.dataset.ctState = 'revealed';
        placeholder.remove();
        mountLabels(article, tweet, verdict, settings.labeling);
      });

      placeholder.append(chip, reasonEl, show);

      const commit = () => {
        cell.classList.add(settings.hideMode === 'blur' ? 'ct-blurred' : 'ct-collapsed');
        if (!placeholder.isConnected) cell.prepend(placeholder);
        mountLabels(article, tweet, verdict, settings.labeling);
      };

      const motion = allowAnimation
        ? hideMotion({
            mode: settings.cards.hideAnimation,
            reducedMotion: reducedMotion(),
            onScreen: isOnScreen(article.getBoundingClientRect(), {
              width: window.innerWidth,
              height: window.innerHeight,
            }),
            seen: article.dataset.ctSeen === '1',
            running: activeDusts(),
          })
        : { animate: false, particles: false };

      if (!motion.animate) {
        commit();
        return;
      }

      const ink =
        chrome.colorCoding && chrome.accent
          ? chrome.accent
          : getComputedStyle(article).color || '#e7e9ea';
      stopHideWait(cell);
      const stop = watchHideEffect(article, {
        reducedMotion,
        onPlay: () => {
          hideWaits.delete(cell);
          playDust({
            article,
            cell,
            particles: motion.particles,
            collapse: settings.hideMode === 'collapse',
            color: ink,
            onDone: commit,
          });
        },
        onInstant: () => {
          hideWaits.delete(cell);
          commit();
        },
      });
      hideWaits.set(cell, stop);
    }

    function resetAll() {
      for (const stop of hideWaits.values()) stop();
      hideWaits.clear();
      cancelAllDusts();
      for (const cell of document.querySelectorAll<HTMLElement>(
        '.ct-pending, .ct-collapsed, .ct-blurred, .ct-removed',
      )) {
        clearCell(cell);
      }
      for (const node of document.querySelectorAll('.ct-placeholder, .ct-suggest, .ct-labelbar, .ct-ai-pill')) {
        node.remove();
      }
      for (const article of document.querySelectorAll<HTMLElement>(TWEET_SELECTOR)) {
        delete article.dataset.ctState;
        delete article.dataset.ctAuthor;
      }
    }

    function noteLocal(id: string, filtered: boolean, reason: string) {
      bumpSession(id, { hidden: filtered, local: true });
      if (reported.has(id)) return;
      reported.add(id);
      localBatch.push({ id, filtered, reason });
      if (localTimer !== undefined) return;
      localTimer = ctx.setTimeout(flushLocal, 400);
    }

    function noteModel(verdict: Verdict) {
      bumpSession(verdict.id, { hidden: verdict.filtered, cost: verdict.cost ?? 0 });
    }

    function bumpSession(
      id: string,
      fields: { hidden?: boolean; local?: boolean; cost?: number },
    ) {
      if (metered.has(id)) return;
      metered.add(id);
      session.checked += 1;
      if (fields.hidden) session.hidden += 1;
      if (fields.local) session.settledLocally += 1;
      session.cost += fields.cost ?? 0;
      meter.update(session);
    }

    function dropLocalBatch() {
      localBatch.length = 0;
      if (localTimer !== undefined) {
        clearTimeout(localTimer);
        localTimer = undefined;
      }
    }

    function flushLocal() {
      localTimer = undefined;
      const decisions = localBatch.splice(0, localBatch.length);
      if (decisions.length === 0 || !alive()) return;
      void runContentTask(
        alive(),
        () => browser.runtime.sendMessage({ type: 'recordLocal', decisions }),
        'could not record local decisions',
      );
    }
  },
});

const labeled = new Map<string, 0 | 1>();

function mountLabels(article: HTMLElement, tweet: TweetInput, verdict: Verdict, enabled: boolean) {
  const cell = article.closest<HTMLElement>('[data-testid="cellInnerDiv"]') ?? article;
  cell.querySelector('.ct-labelbar')?.remove();
  cell.querySelector('.ct-placeholder .ct-labels')?.remove();
  if (!enabled || !verdict.features) return;

  const bar = document.createElement('span');
  bar.className = 'ct-labels';
  const prompt = document.createElement('span');
  prompt.className = 'ct-label-prompt';
  prompt.textContent = 'Mark';
  bar.append(prompt);
  for (const [label, text] of [
    [1, 'AI'],
    [0, 'Human'],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ct-label';
    button.textContent = text;
    button.setAttribute('aria-pressed', String(labeled.get(tweet.id) === label));
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      labeled.set(tweet.id, label);
      for (const sibling of bar.querySelectorAll<HTMLButtonElement>('.ct-label')) {
        sibling.setAttribute('aria-pressed', String(sibling === button));
      }
      void runContentTask(
        runtimeAlive(() => browser.runtime),
        () =>
          browser.runtime.sendMessage({
            type: 'labelPost',
            id: tweet.id,
            label,
            features: verdict.features,
            text: tweet.text,
            author: tweet.author,
          }),
        'could not save label',
      );
    });
    bar.append(button);
  }

  const placeholder = cell.querySelector('.ct-placeholder');
  if (placeholder) {
    placeholder.append(bar);
    return;
  }
  const row = document.createElement('div');
  row.className = 'ct-labelbar';
  row.append(bar);
  cell.append(row);
}

/** Settings and key presence from the background worker. The key itself is never included. */
async function loadTimeline(): Promise<{ settings: Settings; hasKey: boolean }> {
  if (!runtimeAlive(() => browser.runtime)) {
    throw new Error('Extension context invalidated.');
  }
  const res = (await browser.runtime.sendMessage({ type: 'getPublicSettings' })) as {
    settings?: Settings;
    hasKey?: boolean;
  };
  if (!res?.settings) throw new Error('Settings unavailable');
  return { settings: blankKeys(res.settings), hasKey: res.hasKey === true };
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
    parentText: t.parentText,
  };
}

function toPrefilter(t: Extracted): PrefilterPost {
  return {
    author: t.author,
    text: t.text,
    quotedText: t.quotedText,
    promoted: t.promoted,
    hasImage: t.media.hasImage,
    hasVideo: t.media.hasVideo,
    hasGif: t.media.hasGif,
  };
}

function needsModel(s: Settings): boolean {
  return (
    Object.values(s.signals).some((c) => c.enabled) ||
    s.minQuality > 0 ||
    activeCustomFilters(s).length > 0 ||
    s.aiWritten.show ||
    s.hideAiWritten
  );
}

function articleFromCell(cell: HTMLElement): HTMLElement {
  return cell.matches?.(TWEET_SELECTOR) ? cell : (cell.querySelector(TWEET_SELECTOR) ?? cell);
}

function mutationMatters(mutations: MutationRecord[]): boolean {
  for (const mutation of mutations) {
    const node = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
    if (!node?.closest('.ct-meter')) return true;
  }
  return false;
}
