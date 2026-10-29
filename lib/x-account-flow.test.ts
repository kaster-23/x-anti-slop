import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import {
  CONFIRM_TESTID,
  findAccountMenuItem,
  isConfirmationControl,
  isTargetMenuItem,
  openXAccountFlow,
} from './x-account-flow';

function page() {
  const win = new Window();
  const doc = win.document;
  doc.body.innerHTML = `
    <article data-testid="tweet">
      <button type="button" data-testid="caret">More</button>
    </article>
  `;
  const article = doc.querySelector('article')!;
  const caret = article.querySelector('[data-testid="caret"]')!;
  const clicks: string[] = [];
  doc.addEventListener(
    'click',
    (event) => {
      const target = event.target as unknown as HTMLElement;
      clicks.push(target.getAttribute('data-testid') || (target.textContent ?? '').trim());
    },
    true,
  );
  return { doc, article, caret, clicks };
}

const nowait = async () => {};

describe('X mute and block menu', () => {
  test('picks Mute and Block and skips the undo items and the confirm button', () => {
    const { doc } = page();
    doc.body.insertAdjacentHTML(
      'beforeend',
      `<div role="menu" data-testid="Dropdown">
        <div role="menuitem" data-testid="unmute">Unmute @bob</div>
        <div role="menuitem" data-testid="mute">Mute @bob</div>
        <div role="menuitem" data-testid="unblock">Unblock @bob</div>
        <div role="menuitem" data-testid="block">Block @bob</div>
        <button data-testid="${CONFIRM_TESTID}">Block</button>
      </div>`,
    );
    const menu = doc.querySelector('[role="menu"]') as unknown as ParentNode;
    const confirm = doc.querySelector(`[data-testid="${CONFIRM_TESTID}"]`) as unknown as Element;
    expect(findAccountMenuItem(menu, 'mute')?.getAttribute('data-testid')).toBe('mute');
    expect(findAccountMenuItem(menu, 'block')?.getAttribute('data-testid')).toBe('block');
    expect(isTargetMenuItem(confirm, 'block')).toBe(false);
    expect(isConfirmationControl(confirm)).toBe(true);
  });

  test('opens the block confirmation and does not click it', async () => {
    const { doc, article, caret, clicks } = page();
    caret.addEventListener('click', () => {
      doc.body.insertAdjacentHTML(
        'beforeend',
        `<div role="menu" data-testid="Dropdown">
          <div role="menuitem" data-testid="mute">Mute @bob</div>
          <div role="menuitem" data-testid="block">Block @bob</div>
        </div>`,
      );
    });
    doc.addEventListener('click', (event) => {
      const target = event.target as unknown as HTMLElement;
      if (target.getAttribute('data-testid') !== 'block') return;
      doc.body.insertAdjacentHTML(
        'beforeend',
        `<div role="alertdialog">
          <button type="button" data-testid="${CONFIRM_TESTID}">Block</button>
          <button type="button" data-testid="confirmationSheetCancel">Cancel</button>
        </div>`,
      );
    });

    const result = await openXAccountFlow(doc as unknown as Document, article as unknown as HTMLElement, 'block', nowait);
    expect(result.status).toBe('confirmation');
    expect(clicks).toContain('caret');
    expect(clicks).toContain('block');
    expect(clicks).not.toContain(CONFIRM_TESTID);
    expect(doc.querySelector(`[data-testid="${CONFIRM_TESTID}"]`)).not.toBeNull();
  });

  test('undoes a mute that X applied without a confirmation', async () => {
    const { doc, article, caret, clicks } = page();
    caret.addEventListener('click', () => {
      doc.body.insertAdjacentHTML(
        'beforeend',
        `<div role="menu"><div role="menuitem" data-testid="mute">Mute @bob</div></div>`,
      );
    });
    doc.addEventListener('click', (event) => {
      const target = event.target as unknown as HTMLElement;
      if (target.getAttribute('data-testid') !== 'mute') return;
      doc.body.insertAdjacentHTML(
        'beforeend',
        `<div data-testid="toast" role="alert">Muted @bob <button type="button">Undo</button></div>`,
      );
    });

    const result = await openXAccountFlow(doc as unknown as Document, article as unknown as HTMLElement, 'mute', nowait);
    expect(result.status).toBe('reverted');
    expect(clicks).toContain('Undo');
    expect(clicks).not.toContain(CONFIRM_TESTID);
  });

  test('does nothing when the post has no menu', async () => {
    const { doc } = page();
    doc.body.innerHTML = '<article data-testid="tweet"></article>';
    const article = doc.querySelector('article')!;
    const result = await openXAccountFlow(doc as unknown as Document, article as unknown as HTMLElement, 'mute', nowait);
    expect(result.status).toBe('unavailable');
  });
});
