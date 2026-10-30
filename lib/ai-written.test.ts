import { describe, expect, test } from 'bun:test';
import {
  AI_WRITTEN_PILL_TOOLTIP,
  aiWrittenHide,
  aiWrittenPillText,
  normalizeAiWritten,
  shouldShowAiPill,
} from './ai-written';
import { DEFAULT_SETTINGS } from './defaults';
import { decidePost } from './rule-decision';

const visible = {
  text: 'Rotated session tokens every 12 hours and bound them to the device id. p95 auth fell from 800ms to 220ms.',
  model: { slop: 0.12, aiWritten: 0.72, quality: 2.6 },
};

describe('AI-written label', () => {
  test('older saves get the label on, from 50%, and do not hide for authorship', () => {
    expect(normalizeAiWritten(undefined)).toEqual({ show: true, floor: 0.5 });
    expect(normalizeAiWritten({ show: false, floor: 0.7 })).toEqual({ show: false, floor: 0.7 });
    expect(normalizeAiWritten({ floor: 0.4 })).toEqual({ show: true, floor: 0.5 });
    expect(normalizeAiWritten({ floor: 0.9 })).toEqual({ show: true, floor: 0.9 });
  });

  test('the pill text and tooltip name the chance, and only a visible post at the floor gets one', () => {
    expect(aiWrittenPillText(0.72)).toBe('AI 72%');
    expect(AI_WRITTEN_PILL_TOOLTIP).toContain('Shown, not hidden, because it adds value.');
    const settings = DEFAULT_SETTINGS;
    expect(shouldShowAiPill(0.72, settings, false)).toBe(true);
    expect(shouldShowAiPill(0.5, settings, false)).toBe(true);
    expect(shouldShowAiPill(0.49, settings, false)).toBe(false);
    expect(shouldShowAiPill(0.72, settings, true)).toBe(false);
    expect(shouldShowAiPill(undefined, settings, false)).toBe(false);
    expect(shouldShowAiPill(0.6, { aiWritten: { show: true, floor: 0.7 } }, false)).toBe(false);
    expect(shouldShowAiPill(0.7, { aiWritten: { show: false, floor: 0.5 } }, false)).toBe(false);
  });

  test('hiding for authorship uses the same floor and stays off unless the switch is on', () => {
    expect(aiWrittenHide(0.8, DEFAULT_SETTINGS)).toBeNull();
    expect(aiWrittenHide(0.8, { ...DEFAULT_SETTINGS, hideAiWritten: true })?.label).toBe('AI written');
    expect(aiWrittenHide(0.4, { ...DEFAULT_SETTINGS, hideAiWritten: true })).toBeNull();
    expect(
      aiWrittenHide(0.6, { aiWritten: { show: true, floor: 0.7 }, hideAiWritten: true }),
    ).toBeNull();

    expect(decidePost(visible, DEFAULT_SETTINGS).hide).toBe(false);
    const hidden = decidePost(visible, { ...DEFAULT_SETTINGS, hideAiWritten: true });
    expect(hidden.hide).toBe(true);
    expect(hidden.reason).toBe('AI written');
  });
});
