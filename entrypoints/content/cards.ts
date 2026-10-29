import {
  DEFAULT_CARD_APPEARANCE,
  cardChrome,
  readFeedTheme,
  type CardAppearance,
  type CardChrome,
} from '@/lib/card-style';

let appearance: CardAppearance = DEFAULT_CARD_APPEARANCE;

/** The latest card settings. A settings push replaces them before the timeline rescans. */
export function setCardAppearance(next: CardAppearance): void {
  appearance = next;
}

/** Writes the theme, tag, and accent onto a hidden-post card or a repeat suggestion. */
export function paintFeedCard(el: HTMLElement, reason: string, botReply = false): CardChrome {
  const chrome = cardChrome({
    reason,
    botReply,
    appearance,
    theme: readFeedTheme(el.ownerDocument),
  });
  el.classList.add('ct-card');
  el.dataset.ctTag = chrome.tag;
  el.dataset.ctTheme = chrome.theme;
  el.dataset.ctStyle = chrome.style;
  el.dataset.ctSize = chrome.textSize;
  el.dataset.ctColor = chrome.colorCoding ? 'on' : 'off';
  if (chrome.accent) {
    el.style.setProperty('--ct-accent', chrome.accent);
    el.style.setProperty('--ct-chip-ink', chrome.chipInk ?? '#111111');
  } else {
    el.style.removeProperty('--ct-accent');
    el.style.removeProperty('--ct-chip-ink');
  }
  return chrome;
}

/** Keeps cards readable after X switches light, dim, or lights out without a reload. */
export function restyleFeedCards(doc: Document): void {
  const theme = readFeedTheme(doc);
  for (const el of doc.querySelectorAll<HTMLElement>('.ct-card')) {
    el.dataset.ctTheme = theme;
  }
}
