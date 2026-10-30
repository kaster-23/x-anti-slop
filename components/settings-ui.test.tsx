import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConfidenceSlider } from './LabeledSlider';
import { InfoTip } from './InfoTip';
import { PresetPicker } from './PresetPicker';

function html(node: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(node);
}

describe('preset picker', () => {
  test('shows each preset card with its description and marks Balanced selected', () => {
    const markup = html(
      createElement(PresetPicker, {
        preset: 'balanced',
        presetBase: 'balanced',
        onSelect: () => {},
        onReset: () => {},
      }),
    );
    expect(markup).toContain('Light');
    expect(markup).toContain('Hides only obvious filler');
    expect(markup).toContain('including ones written with AI');
    expect(markup).toContain('A useful post stays, including one written with AI.');
    expect(markup).toContain('You will see');
    expect(markup).toContain('You won&#x27;t see');
    expect(markup).toContain('Hides more slop, rage bait, and ads');
    expect(markup).toContain('Adds model calls and may delay posts');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('data-preset="balanced"');
    expect(markup).not.toContain('role="radio"');
    expect(markup).not.toContain('Reset to');
  });

  test('custom mode names the base preset and offers reset', () => {
    const markup = html(
      createElement(PresetPicker, {
        preset: 'custom',
        presetBase: 'strict',
        onSelect: () => {},
        onReset: () => {},
      }),
    );
    expect(markup).toContain('Custom (based on Strict)');
    expect(markup).toContain('Reset to Strict');
    expect(markup).not.toContain('aria-pressed="true"');
  });

  test('offers undo after a preset replaced Custom', () => {
    const markup = html(
      createElement(PresetPicker, {
        preset: 'strict',
        presetBase: 'strict',
        undoName: 'Strict',
        onSelect: () => {},
        onReset: () => {},
        onUndo: () => {},
      }),
    );
    expect(markup).toContain('Strict applied.');
    expect(markup).toContain('Undo');
  });
});

describe('info tooltip', () => {
  test('exposes an explanation and an example to keyboard and hover users', () => {
    const markup = html(
      createElement(InfoTip, {
        label: 'AI slop',
        explanation: 'Hides writing that reads like a model.',
        example: 'Example: Let’s unpack this.',
        tipKey: 'slop',
        forceOpen: true,
      }),
    );
    expect(markup).toContain('role="tooltip"');
    expect(markup).toContain('aria-label="About AI slop"');
    expect(markup).toContain('aria-describedby=');
    expect(markup).toContain('data-tip="slop"');
    expect(markup).toContain('Hides writing that reads like a model.');
    expect(markup).toContain('Example: Let’s unpack this.');
  });

  test('puts the help mark after the title and keeps the value on the right', () => {
    const markup = html(
      createElement(ConfidenceSlider, {
        id: 'signal-slop',
        label: 'AI slop',
        explanation: 'Hide filler.',
        example: 'Example: unpack.',
        enabled: true,
        onEnabled: () => {},
        threshold: 0.7,
        onThreshold: () => {},
      }),
    );
    const title = markup.indexOf('AI slop');
    const mark = markup.indexOf('tip-btn');
    const value = markup.indexOf('slider-value');
    expect(title).toBeGreaterThan(-1);
    expect(mark).toBeGreaterThan(title);
    expect(value).toBeGreaterThan(mark);
    expect(markup).toContain('>70%<');
    expect(markup).not.toContain('align-end');
  });
});
