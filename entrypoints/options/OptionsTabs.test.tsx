import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OptionsTabs } from './OptionsTabs';

describe('options tab bar', () => {
  test('marks Filtering selected and wires each tab to its panel', () => {
    const html = renderToStaticMarkup(
      createElement(OptionsTabs, { tab: 'filtering', onSelect: () => {} }),
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-controls="panel-filtering"');
    expect(html).toContain('id="tab-filtering"');
    expect(html).toContain('aria-controls="panel-lists"');
    expect(html).toContain('aria-controls="panel-appearance"');
    expect(html).toContain('aria-controls="panel-account"');
    expect(html).toContain('>Filtering<');
    expect(html).toContain('>Lists<');
    expect(html).toContain('>Appearance<');
    expect(html).toContain('>Account<');
    expect(html.match(/aria-selected="true"/g)?.length).toBe(1);
  });
});
