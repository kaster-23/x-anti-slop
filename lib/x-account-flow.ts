/**
 * Opens X's own mute or block sheet for one post's author.
 *
 * The extension clicks the post menu, then the Mute or Block item, and stops.
 * `[data-testid="confirmationSheetConfirm"]` is the control that actually mutes
 * or blocks. This module never clicks it. If X applies the action without a
 * confirmation, the toast's Undo is clicked so the account is not changed silently.
 */

export type AccountAction = 'mute' | 'block';

export type FlowStatus = 'confirmation' | 'unavailable' | 'reverted';

export interface FlowResult {
  status: FlowStatus;
}

/** The button that completes a mute or block. Never activate it. */
export const CONFIRM_TESTID = 'confirmationSheetConfirm';

const MENU_POLLS = 8;
const SHEET_POLLS = 10;

export function isConfirmationControl(el: Element | null): boolean {
  if (!el) return false;
  if (el.getAttribute('data-testid') === CONFIRM_TESTID) return true;
  return !!el.closest(`[data-testid="${CONFIRM_TESTID}"]`);
}

export function menuLabel(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Mute/Block menu rows. Unmute, Unblock, and the confirm button are not targets. */
export function isTargetMenuItem(el: Element, action: AccountAction): boolean {
  if (isConfirmationControl(el)) return false;
  const testid = el.getAttribute('data-testid') ?? '';
  const label = menuLabel(el);
  if (action === 'mute') {
    if (testid === 'unmute' || /^unmute\b/i.test(label)) return false;
    if (testid === 'mute' || testid === 'muteLink') return true;
    return /^mute\b/i.test(label);
  }
  if (testid === 'unblock' || /^unblock\b/i.test(label)) return false;
  if (testid === 'block') return true;
  return /^block\b/i.test(label);
}

export function findAccountMenuItem(root: ParentNode, action: AccountAction): HTMLElement | null {
  const menus = [...root.querySelectorAll<HTMLElement>('[data-testid="Dropdown"], [role="menu"]')];
  const scope: ParentNode = menus.at(-1) ?? root;
  const items = scope.querySelectorAll<HTMLElement>(
    '[role="menuitem"], [data-testid="mute"], [data-testid="muteLink"], [data-testid="block"]',
  );
  for (const item of items) {
    const candidate = item.closest<HTMLElement>('[role="menuitem"]') ?? item;
    if (isTargetMenuItem(candidate, action)) return candidate;
  }
  return null;
}

export async function openXAccountFlow(
  doc: Document,
  article: HTMLElement,
  action: AccountAction,
  wait: (ms: number) => Promise<void> = defaultWait,
): Promise<FlowResult> {
  const caret = article.querySelector<HTMLElement>('[data-testid="caret"]');
  if (!caret || isConfirmationControl(caret)) return { status: 'unavailable' };

  caret.click();

  let item: HTMLElement | null = null;
  for (let attempt = 0; attempt < MENU_POLLS; attempt++) {
    item = findAccountMenuItem(doc, action);
    if (item) break;
    await wait(40);
  }

  if (!item || isConfirmationControl(item)) {
    closeMenu(doc);
    return { status: 'unavailable' };
  }

  item.click();

  for (let attempt = 0; attempt < SHEET_POLLS; attempt++) {
    if (doc.querySelector(`[data-testid="${CONFIRM_TESTID}"], [role="alertdialog"], [data-testid="sheetDialog"]`)) {
      return { status: 'confirmation' };
    }
    await wait(40);
  }

  if (revertSilentAction(doc, action)) return { status: 'reverted' };
  closeMenu(doc);
  return { status: 'unavailable' };
}

function revertSilentAction(doc: Document, action: AccountAction): boolean {
  const toast = doc.querySelector<HTMLElement>('[data-testid="toast"], [role="alert"]');
  if (!toast) return false;
  const text = menuLabel(toast);
  const aboutAction = action === 'mute' ? /mut/i.test(text) : /block/i.test(text);
  if (!aboutAction) return false;
  const undo = [...toast.querySelectorAll<HTMLElement>('button, [role="button"]')].find(
    (el) => /^undo$/i.test(menuLabel(el)) && !isConfirmationControl(el),
  );
  if (!undo) return false;
  undo.click();
  return true;
}

function closeMenu(doc: Document) {
  doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
