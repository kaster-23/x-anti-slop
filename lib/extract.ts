import { djb2 } from './hash';
import type { TweetInput } from './types';

/**
 * X ships no stable class names, so everything here keys off `data-testid`.
 * Every lookup is defensive: a missing node degrades the extracted post rather
 * than throwing.
 */

export const TWEET_SELECTOR = 'article[data-testid="tweet"]';

/** Cheap enough (no layout-forcing `innerText`) to call on every mutation. */
export function readTweetId(article: HTMLElement): string | null {
  let href: string | null = null;
  try {
    href =
      article
        .querySelector<HTMLAnchorElement>('a[href*="/status/"]:has(time)')
        ?.getAttribute('href') ?? null;
  } catch {
    // `:has()` is unsupported on older engines; fall through to the scan below.
  }
  href ??= findStatusHref(article);
  return href?.match(/\/status\/(\d+)/)?.[1] ?? null;
}

function findStatusHref(article: HTMLElement): string | null {
  for (const a of article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')) {
    const href = a.getAttribute('href') ?? '';
    if (/^\/[^/]+\/status\/\d+$/.test(href)) return href;
  }
  return null;
}

/** A quoted post lives inside a nested `div[role="link"]`; the outer post does not. */
function isInsideQuote(node: Element, article: HTMLElement): boolean {
  let el: Element | null = node.parentElement;
  while (el && el !== article) {
    if (el.getAttribute('role') === 'link') return true;
    el = el.parentElement;
  }
  return false;
}

/** `innerText` keeps the post's line breaks, which carry meaning for the model. */
function visibleText(node: HTMLElement | null | undefined): string {
  if (!node) return '';
  return (node.innerText ?? node.textContent ?? '').trim();
}

function readText(article: HTMLElement): { text: string; quotedText?: string } {
  let text = '';
  let quotedText: string | undefined;
  for (const node of article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]')) {
    const value = visibleText(node);
    if (!value) continue;
    if (isInsideQuote(node, article)) quotedText ??= value;
    else if (!text) text = value;
  }
  return { text, quotedText };
}

/** Walks the leaf spans rather than splitting `innerText`, because X renders
 *  the name and handle on one line in some views and two in others. */
function readAuthor(article: HTMLElement): { author: string; authorName: string } {
  const block = article.querySelector<HTMLElement>('[data-testid="User-Name"]');
  if (!block) return { author: '', authorName: '' };

  let author = '';
  let authorName = '';
  for (const span of block.querySelectorAll<HTMLElement>('span')) {
    if (span.children.length) continue; // leaf nodes only
    const value = (span.textContent ?? '').trim();
    if (!value || value === '·') continue;
    if (!author && /^@[A-Za-z0-9_]+$/.test(value)) author = value;
    else if (!authorName && !value.startsWith('@')) authorName = value;
  }
  return { author, authorName };
}

/** X labels paid placements, so these cost no model call. */
export function isPromoted(article: HTMLElement): boolean {
  if (article.querySelector('[data-testid="placementTracking"]')) return true;

  // The label sits where a timestamp normally would, and is not always a
  // `<span>`, so scan every leaf element. The post's own body is excluded:
  // someone writing "Ad" in a tweet must not trip this.
  for (const el of article.querySelectorAll<HTMLElement>('span, div')) {
    if (el.children.length) continue;
    if (el.closest('[data-testid="tweetText"]')) continue;
    const label = el.textContent?.trim();
    if (!label) continue;
    if (/^(ad|promoted)$/i.test(label) || /^promoted by /i.test(label)) return true;
  }
  return false;
}

export interface Media {
  hasImage: boolean;
  hasVideo: boolean;
  hasGif: boolean;
}

export function readMedia(article: HTMLElement): Media {
  // A post can carry more than one kind at once, so these are counted
  // independently rather than letting one kind cancel another out.
  let images = 0;
  let gifs = 0;
  for (const photo of article.querySelectorAll<HTMLElement>('[data-testid="tweetPhoto"]')) {
    // GIFs render as a muted <video> inside a tweetPhoto, with a "GIF" badge.
    if (photo.querySelector('video') || photo.textContent?.trim() === 'GIF') gifs++;
    else images++;
  }

  const players = article.querySelector('[data-testid="videoPlayer"], [data-testid="videoComponent"]');
  const looseVideo = [...article.querySelectorAll<HTMLElement>('video')].some(
    (v) => !v.closest('[data-testid="tweetPhoto"]'),
  );

  return { hasImage: images > 0, hasVideo: !!players || looseVideo, hasGif: gifs > 0 };
}

function isReply(article: HTMLElement): boolean {
  const context = article.querySelector<HTMLElement>('[data-testid="socialContext"]');
  return visibleText(context).startsWith('Replying to');
}

/**
 * The post this reply answers, when that post is on the page.
 * A self-thread is not a reply to someone else, so it contributes no parent.
 * The previous cell is used only when its handle is the one X says this post
 * is replying to. Otherwise, on a status page, the opened post is the parent.
 */
function readParentText(article: HTMLElement, author: string): string | undefined {
  if (!isReply(article)) return undefined;

  const mention = visibleText(article.querySelector<HTMLElement>('[data-testid="socialContext"]')).match(
    /Replying to\s+(@[A-Za-z0-9_]+)/i,
  );
  const cell = article.closest('[data-testid="cellInnerDiv"]');
  const prev = cell?.previousElementSibling?.querySelector<HTMLElement>(TWEET_SELECTOR);
  if (prev && mention) {
    const prevAuthor = readAuthor(prev).author;
    const samePerson = author && prevAuthor && prevAuthor.toLowerCase() === author.toLowerCase();
    if (!samePerson && prevAuthor.toLowerCase() === mention[1]?.toLowerCase()) {
      const text = readText(prev).text;
      if (text) return text;
    }
  }
  return focalParentText(article);
}

function focalParentText(article: HTMLElement): string | undefined {
  const statusId = (globalThis.location?.pathname ?? '').match(/\/status\/(\d+)/)?.[1];
  if (!statusId || readTweetId(article) === statusId) return undefined;
  const root = globalThis.document;
  if (!root) return undefined;
  for (const candidate of root.querySelectorAll<HTMLElement>(TWEET_SELECTOR)) {
    if (candidate === article) continue;
    if (readTweetId(candidate) !== statusId) continue;
    const text = readText(candidate).text;
    return text || undefined;
  }
  return undefined;
}

export interface Extracted extends TweetInput {
  media: Media;
  promoted: boolean;
}

/**
 * Promoted posts carry the "Ad" label where the timestamp would be, and have no
 * status permalink at all — so keying only on the status id made the extension
 * blind to exactly the posts it most wants to filter. A content hash gives them
 * a stable key instead: the same author and text means the same verdict.
 */
function syntheticId(author: string, text: string): string | null {
  if (!`${author}${text}`.trim()) return null;
  return `s:${djb2(`${author}\u0000${text}`)}`;
}

export function extractTweet(article: HTMLElement): Extracted | null {
  const { text, quotedText } = readText(article);
  const { author, authorName } = readAuthor(article);
  const media = readMedia(article);

  const id = readTweetId(article) ?? syntheticId(author, text || quotedText || '');
  if (!id) return null;

  return {
    id,
    author,
    authorName,
    text,
    quotedText,
    hasImage: media.hasImage,
    hasVideo: media.hasVideo || media.hasGif,
    isReply: isReply(article),
    isQuote: !!quotedText,
    parentText: readParentText(article, author),
    media,
    promoted: isPromoted(article),
  };
}
