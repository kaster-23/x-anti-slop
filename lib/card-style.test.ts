import { describe, expect, test } from 'bun:test';
import { coerceSettings } from './coerce-settings';
import { presetChangePatch } from './presets';
import {
  DEFAULT_CARD_APPEARANCE,
  DEFAULT_TAG_COLORS,
  cardChrome,
  cardCopy,
  chipInk,
  feedThemeFromBackground,
  meterGlassTheme,
  normalizeCardAppearance,
  tagById,
  tagForReason,
} from './card-style';

describe('tag colors', () => {
  test('maps each filter reason onto its tag, and leaves a custom label on Custom', () => {
    expect(tagForReason('AI slop (92%)').id).toBe('slop');
    expect(tagForReason('AI written (72%)').id).toBe('aiWritten');
    expect(tagForReason('Rage bait (80%)').id).toBe('ragebait');
    expect(tagForReason('Ad (70%)').id).toBe('ad');
    expect(tagForReason('Promotional (66%)').id).toBe('promotional');
    expect(tagForReason('Promoted').id).toBe('promoted');
    expect(tagForReason('Low quality (1.2/3)').id).toBe('lowQuality');
    expect(tagForReason('Hashtag spam (9)').id).toBe('hashtag');
    expect(tagForReason('Emoji spam (6)').id).toBe('emoji');
    expect(tagForReason('Link dump (4)').id).toBe('links');
    expect(tagForReason('Shouting').id).toBe('shouting');
    expect(tagForReason('Image post').id).toBe('media');
    expect(tagForReason('Video post').id).toBe('media');
    expect(tagForReason('GIF post').id).toBe('media');
    expect(tagForReason('Blocked account').id).toBe('blocked');
    expect(tagForReason('Auto-hidden · @bob').id).toBe('repeat');
    expect(tagForReason('Crypto talk (81%)').id).toBe('custom');
  });

  test('a bot-style reply keeps the AI slop words but takes the bot-reply color', () => {
    expect(tagForReason('AI slop (71%)', { botReply: true }).id).toBe('botReply');
    expect(tagForReason('Rage bait (90%)', { botReply: true }).id).toBe('ragebait');
  });

  test('the chip names the tag and keeps the score, or the whole custom reason', () => {
    expect(cardCopy('AI slop (92%)', tagById('slop'))).toEqual({ chip: 'AI slop', detail: '92%' });
    expect(cardCopy('Ad (70%)', tagById('ad'))).toEqual({ chip: 'Engagement bait', detail: '70%' });
    expect(cardCopy('Promoted', tagById('promoted'))).toEqual({ chip: 'Promoted', detail: '' });
    expect(cardCopy('Crypto talk (81%)', tagById('custom'))).toEqual({
      chip: 'Custom',
      detail: 'Crypto talk (81%)',
    });
    expect(cardCopy('Auto-hidden · @bob', tagById('repeat'))).toEqual({
      chip: 'Repeat',
      detail: 'Auto-hidden · @bob',
    });
  });

  test('color coding uses that tag’s accent, and off stays grayscale', () => {
    const on = cardChrome({
      reason: 'Rage bait (88%)',
      appearance: DEFAULT_CARD_APPEARANCE,
      theme: 'dark',
    });
    expect(on.accent).toBe(DEFAULT_TAG_COLORS.ragebait);
    expect(on.chip).toBe('Rage bait');
    expect(on.detail).toBe('88%');
    expect(on.chipInk).toBe(chipInk(DEFAULT_TAG_COLORS.ragebait));

    const off = cardChrome({
      reason: 'Rage bait (88%)',
      appearance: { ...DEFAULT_CARD_APPEARANCE, colorCoding: false },
      theme: 'light',
    });
    expect(off.accent).toBeNull();
    expect(off.chipInk).toBeNull();
    expect(off.colorCoding).toBe(false);
    expect(off.theme).toBe('light');
  });
});

describe('card appearance settings', () => {
  test('an older save receives the defaults, and a bad color is replaced', () => {
    expect(normalizeCardAppearance(undefined)).toEqual(DEFAULT_CARD_APPEARANCE);
    const normalized = normalizeCardAppearance({
      colorCoding: false,
      style: 'nope',
      textSize: 'large',
      colors: { slop: 'red', ragebait: '#abc', ad: '#C47A72' },
    });
    expect(normalized.colorCoding).toBe(false);
    expect(normalized.style).toBe('solid');
    expect(normalized.textSize).toBe('large');
    expect(normalized.colors.slop).toBe(DEFAULT_TAG_COLORS.slop);
    expect(normalized.colors.ragebait).toBe('#aabbcc');
    expect(normalized.colors.ad).toBe('#c47a72');
    expect(normalized.colors.promoted).toBe(DEFAULT_TAG_COLORS.promoted);
  });

  test('loading settings fills card appearance without leaving the preset', () => {
    const fresh = coerceSettings({});
    expect(fresh.cards).toEqual(DEFAULT_CARD_APPEARANCE);
    expect(fresh.preset).toBe('balanced');

    const stored = coerceSettings({
      cards: { colorCoding: false, colors: { slop: '#112233' } },
    });
    expect(stored.preset).toBe('balanced');
    expect(stored.cards.colorCoding).toBe(false);
    expect(stored.cards.colors.slop).toBe('#112233');
    expect(stored.cards.colors.ragebait).toBe(DEFAULT_TAG_COLORS.ragebait);
    expect(presetChangePatch(stored, { cards: stored.cards })).toEqual({ cards: stored.cards });
  });
});

describe('feed theme', () => {
  test('reads X light, dim, and lights-out backgrounds', () => {
    expect(feedThemeFromBackground('rgb(255, 255, 255)')).toBe('light');
    expect(feedThemeFromBackground('#ffffff')).toBe('light');
    expect(feedThemeFromBackground('rgb(21, 32, 43)')).toBe('dim');
    expect(feedThemeFromBackground('#15202b')).toBe('dim');
    expect(feedThemeFromBackground('rgb(0, 0, 0)')).toBe('dark');
    expect(feedThemeFromBackground('#000000')).toBe('dark');
    expect(meterGlassTheme('light')).toBe('light');
    expect(meterGlassTheme('dim')).toBe('dark');
    expect(meterGlassTheme('dark')).toBe('dark');
  });
});
