import { TWEET_SELECTOR } from '@/lib/extract';
import {
  autoHideReason,
  dismissSuggestion,
  findAccount,
  isAutoHidden,
  normalizeHandle,
  normalizeRepeatState,
  recordFlaggedPost,
  setAutoHide,
  shouldSuggest,
  type FlaggedAccount,
  type RepeatState,
} from '@/lib/repeat';
import { loadRepeat, repeatStore, updateRepeat } from '@/lib/repeat-store';
import { openXAccountFlow, type AccountAction, type FlowStatus } from '@/lib/x-account-flow';

/** Posts that crossed the threshold during this turn. Cleared once the flush finishes. */
let crossedThisTurn = new Set<string>();
let turnClearScheduled = false;

function rememberCrossing(id: string): void {
  crossedThisTurn.add(id);
  if (turnClearScheduled) return;
  turnClearScheduled = true;
  queueMicrotask(() => {
    crossedThisTurn = new Set();
    turnClearScheduled = false;
  });
}

/**
 * In-memory copy of the flagged-account record for the open timeline.
 * Storage writes are async; decisions during a scan have to be sync or the
 * post after a threshold crossing would not see the new count.
 */
let state: RepeatState = { revision: 0, accounts: [] };
let rescan: () => void = () => {};

export async function startOffenders(hooks: { rescan: () => void }): Promise<void> {
  rescan = hooks.rescan;
  state = await loadRepeat();
  repeatStore.watch((value) => {
    const next = normalizeRepeatState(value);
    // A write this tab just made is already in `state`. A lower or equal
    // revision is that echo; a higher one came from the settings page.
    if (next.revision <= state.revision) return;
    state = next;
    rescan();
  });
}

export function autoHiddenReason(handle: string): string | null {
  if (!isAutoHidden(state, handle)) return null;
  return autoHideReason(handle);
}

export function tagAuthor(article: HTMLElement, author: string): void {
  const handle = normalizeHandle(author);
  if (handle) article.dataset.ctAuthor = handle;
  else delete article.dataset.ctAuthor;
}

/** Call before recording the post on screen. The crossing post itself does not ask. */
export function mountAccountSuggestion(article: HTMLElement, author: string, threshold: number): void {
  const handle = normalizeHandle(author);
  const host = suggestionHost(article);
  const existing = handle ? host.querySelector<HTMLElement>(`.ct-suggest[data-handle="${handle}"]`) : null;
  const account = handle ? findAccount(state, handle) : undefined;
  if (!account || !shouldSuggest(account, threshold)) {
    existing?.remove();
    return;
  }
  if (existing) return;
  host.querySelector('.ct-suggest')?.remove();
  const suggestion = renderSuggestion(account, article);
  const placeholder = host.querySelector(':scope > .ct-placeholder');
  if (placeholder) placeholder.insertAdjacentElement('afterend', suggestion);
  else host.prepend(suggestion);
}

/**
 * A post was flagged hidden. Auto-hides do not come through here.
 * Model verdicts arrive after the scan that rendered the following post, so
 * once the count crosses, that following post is updated in place.
 */
export function noteFlaggedHidden(
  tweet: { id: string; author: string; authorName: string },
  threshold: number,
): void {
  const handle = normalizeHandle(tweet.author);
  const before = shouldSuggest(findAccount(state, handle), threshold);
  commit((current) =>
    recordFlaggedPost(current, {
      handle: tweet.author,
      displayName: tweet.authorName,
      postId: tweet.id,
    }),
  );
  const after = findAccount(state, handle);
  if (!after || !shouldSuggest(after, threshold)) return;
  if (!before) rememberCrossing(tweet.id);
  for (const article of document.querySelectorAll<HTMLElement>(TWEET_SELECTOR)) {
    if (article.dataset.ctAuthor !== handle) continue;
    if (article.dataset.ctId && crossedThisTurn.has(article.dataset.ctId)) continue;
    mountAccountSuggestion(article, handle, threshold);
  }
}

function commit(mutator: (current: RepeatState) => RepeatState): void {
  const prev = state;
  const mutated = mutator(prev);
  if (mutated === prev) return;
  const hideChanged = hiddenKey(prev) !== hiddenKey(mutated);
  state = { ...mutated, revision: prev.revision + 1 };
  // Queue the write before a rescan, so a scan that records more flags lines
  // up behind this change instead of landing in storage first.
  void updateRepeat(mutator).then((stored) => {
    if (stored.revision < state.revision) return;
    const external = stored.revision > state.revision;
    const hideNow = hiddenKey(state) !== hiddenKey(stored);
    state = stored;
    if (external || hideNow) rescan();
  });
  if (hideChanged) rescan();
}

function hiddenKey(current: RepeatState): string {
  return current.accounts
    .filter((account) => account.autoHide)
    .map((account) => account.handle)
    .sort()
    .join('\n');
}

function suggestionHost(article: HTMLElement): HTMLElement {
  const cell = article.closest<HTMLElement>('[data-testid="cellInnerDiv"]');
  if (cell && cell !== article) return cell;
  // Collapse hides the article element. The suggestion has to sit outside it.
  return article.parentElement ?? article;
}

function renderSuggestion(account: FlaggedAccount, article: HTMLElement): HTMLElement {
  const root = document.createElement('div');
  root.className = 'ct-suggest';
  root.dataset.handle = account.handle;
  root.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  const copy = document.createElement('p');
  copy.className = 'ct-suggest-copy';
  copy.textContent = `@${account.handle} has had ${account.count} posts hidden. Hide the rest from this account?`;

  const actions = document.createElement('div');
  actions.className = 'ct-suggest-actions';
  actions.append(
    actionButton('Hide all', 'ct-suggest-hide', () => {
      commit((current) => setAutoHide(current, account.handle, true));
    }),
    actionButton(
      'Mute on X…',
      '',
      () => {
        void runXAction(root, article, 'mute');
      },
      "Opens X's mute confirmation. Nothing is muted until you confirm there.",
    ),
    actionButton(
      'Block on X…',
      '',
      () => {
        void runXAction(root, article, 'block');
      },
      "Opens X's block confirmation. Nothing is blocked until you confirm there.",
    ),
    actionButton('Not now', '', () => {
      commit((current) => dismissSuggestion(current, account.handle));
      for (const node of document.querySelectorAll<HTMLElement>(`.ct-suggest[data-handle="${account.handle}"]`)) {
        node.remove();
      }
    }),
  );

  const status = document.createElement('p');
  status.className = 'ct-suggest-status';
  status.hidden = true;

  root.append(copy, actions, status);
  return root;
}

function actionButton(label: string, className: string, onClick: () => void, title?: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  if (title) button.title = title;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

async function runXAction(root: HTMLElement, article: HTMLElement, action: AccountAction): Promise<void> {
  const status = root.querySelector<HTMLElement>('.ct-suggest-status');
  if (!status) return;
  status.hidden = false;
  status.textContent =
    action === 'mute' ? "Opening X's mute confirmation…" : "Opening X's block confirmation…";
  let result: FlowStatus = 'unavailable';
  try {
    result = (await openXAccountFlow(document, article, action)).status;
  } catch (err) {
    console.warn('[x-anti-slop] could not open X account menu', err);
  }
  status.textContent = statusMessage(action, result);
}

function statusMessage(action: AccountAction, status: FlowStatus): string {
  const name = action === 'mute' ? 'mute' : 'block';
  if (status === 'confirmation') {
    return `Confirm the ${name} on X. This extension will not confirm it for you.`;
  }
  if (status === 'reverted') {
    return `X applied that ${name} without a confirmation, so it was undone. Nothing was changed.`;
  }
  return `X's ${name} menu did not open. Use the ... menu on the post, or hide the account here.`;
}
