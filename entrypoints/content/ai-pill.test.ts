import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { DEFAULT_SETTINGS } from '../../lib/defaults';
import { AI_WRITTEN_PILL_TOOLTIP } from '../../lib/ai-written';
import { clearAiWrittenPill, mountAiWrittenPill } from './ai-pill';

function article(): HTMLElement {
  const win = new Window();
  const root = win.document.createElement('article');
  const header = win.document.createElement('div');
  header.setAttribute('data-testid', 'User-Name');
  header.textContent = 'Ada';
  root.append(header);
  win.document.body.append(root);
  return root as unknown as HTMLElement;
}

describe('AI-written pill', () => {
  test('mounts a monochrome pill on the header and removes it when the post should not show one', () => {
    const root = article();
    mountAiWrittenPill(root, { aiWritten: 0.72 }, DEFAULT_SETTINGS);
    const pill = root.querySelector('.ct-ai-pill');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe('AI 72%');
    expect(pill?.getAttribute('title')).toBe(AI_WRITTEN_PILL_TOOLTIP);
    expect(pill?.parentElement?.getAttribute('data-testid')).toBe('User-Name');
    expect(pill?.getAttribute('style') ?? '').not.toContain('gradient');

    mountAiWrittenPill(root, { aiWritten: 0.49 }, DEFAULT_SETTINGS);
    expect(root.querySelector('.ct-ai-pill')).toBeNull();

    mountAiWrittenPill(root, { aiWritten: 0.8 }, { ...DEFAULT_SETTINGS, aiWritten: { show: false, floor: 0.5 } });
    expect(root.querySelector('.ct-ai-pill')).toBeNull();
    clearAiWrittenPill(root);
  });
});
