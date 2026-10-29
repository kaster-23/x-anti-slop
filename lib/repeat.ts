/**
 * Local memory of accounts whose posts keep getting hidden.
 *
 * Counts live in extension storage, capped so a long-lived profile cannot grow
 * the record without bound. Nothing here talks to X: auto-hide is a local
 * decision, and mute or block stays in X's own confirmation sheet.
 */

export const DEFAULT_REPEAT_THRESHOLD = 3;
export const REPEAT_THRESHOLD_MIN = 1;
export const REPEAT_THRESHOLD_MAX = 20;

/** Handles kept in storage. Auto-hidden accounts are the last to be dropped. */
export const MAX_FLAGGED_ACCOUNTS = 200;

/**
 * Recent post ids per account. A timeline rescan hides the same posts again;
 * remembering them keeps that from counting twice. Older than this window, a
 * post can be counted again — the cap matters more than a perfect history.
 */
export const MAX_SEEN_POSTS = 50;

export interface FlaggedAccount {
  /** Normalized, without a leading @. */
  handle: string;
  displayName: string;
  count: number;
  seenIds: string[];
  autoHide: boolean;
  /**
   * The inline suggestion stays quiet while `count` is at or below this.
   * "Not now" sets it to the current count, so one more flagged post asks again.
   */
  dismissedAt: number;
  updatedAt: number;
}

export interface RepeatState {
  /** Bumped on every write so a tab can ignore echoes of its own saves. */
  revision: number;
  /** Identifies the write that landed, so a raced save can be retried. */
  writeId?: string;
  accounts: FlaggedAccount[];
}

export const EMPTY_REPEAT_STATE: RepeatState = { revision: 0, accounts: [] };

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export function clampRepeatThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_REPEAT_THRESHOLD;
  return Math.min(REPEAT_THRESHOLD_MAX, Math.max(REPEAT_THRESHOLD_MIN, Math.round(value)));
}

export function autoHideReason(handle: string): string {
  return `Auto-hidden · @${normalizeHandle(handle)}`;
}

export function normalizeRepeatState(value: unknown): RepeatState {
  if (!value || typeof value !== 'object') return EMPTY_REPEAT_STATE;
  const raw = value as Partial<RepeatState>;
  const revision = Number(raw.revision);
  const accounts = Array.isArray(raw.accounts) ? raw.accounts.map(normalizeAccount).filter(present) : [];
  return {
    revision: Number.isFinite(revision) && revision > 0 ? Math.floor(revision) : 0,
    writeId: typeof raw.writeId === 'string' ? raw.writeId : '',
    accounts: capAccounts(dedupe(accounts)),
  };
}

function present<T>(value: T | null): value is T {
  return value !== null;
}

function normalizeAccount(value: unknown): FlaggedAccount | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<FlaggedAccount>;
  const handle = normalizeHandle(String(raw.handle ?? ''));
  if (!handle) return null;
  const count = Number(raw.count);
  const dismissedAt = Number(raw.dismissedAt);
  const updatedAt = Number(raw.updatedAt);
  const seenIds = Array.isArray(raw.seenIds)
    ? raw.seenIds.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, MAX_SEEN_POSTS)
    : [];
  return {
    handle,
    displayName: typeof raw.displayName === 'string' ? raw.displayName.trim() : '',
    count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
    seenIds,
    autoHide: raw.autoHide === true,
    dismissedAt: Number.isFinite(dismissedAt) && dismissedAt > 0 ? Math.floor(dismissedAt) : 0,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.floor(updatedAt) : 0,
  };
}

function dedupe(accounts: FlaggedAccount[]): FlaggedAccount[] {
  const byHandle = new Map<string, FlaggedAccount>();
  for (const account of accounts) {
    const prior = byHandle.get(account.handle);
    if (!prior || account.updatedAt >= prior.updatedAt) byHandle.set(account.handle, account);
  }
  return [...byHandle.values()];
}

/**
 * Drops the lowest-value rows once `cap` is exceeded. Auto-hidden accounts stay
 * until every other row is gone, because dropping one would let that account's
 * posts back onto the timeline with no signal to the user.
 */
export function capAccounts(accounts: FlaggedAccount[], cap = MAX_FLAGGED_ACCOUNTS): FlaggedAccount[] {
  if (accounts.length <= cap) return accounts;
  const ranked = [...accounts].sort((a, b) => {
    if (a.autoHide !== b.autoHide) return a.autoHide ? 1 : -1;
    if (a.count !== b.count) return a.count - b.count;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
    return a.handle.localeCompare(b.handle);
  });
  const drop = new Set(ranked.slice(0, accounts.length - cap).map((account) => account.handle));
  return accounts.filter((account) => !drop.has(account.handle));
}

export function findAccount(state: RepeatState, handle: string): FlaggedAccount | undefined {
  const key = normalizeHandle(handle);
  if (!key) return undefined;
  return state.accounts.find((account) => account.handle === key);
}

export function isAutoHidden(state: RepeatState, handle: string): boolean {
  return findAccount(state, handle)?.autoHide === true;
}

/**
 * True once this account has enough flagged posts and the user has not dismissed
 * the suggestion at the current count. Callers check this *before* recording the
 * post they are looking at, so the suggestion shows up on the following post.
 */
export function shouldSuggest(account: FlaggedAccount | undefined, threshold: number): boolean {
  if (!account || account.autoHide) return false;
  const needed = clampRepeatThreshold(threshold);
  return account.count >= needed && account.count > account.dismissedAt;
}

export interface FlagInput {
  handle: string;
  displayName?: string;
  postId: string;
  now?: number;
}

/** Counts a hidden post once per id. A repeated id refreshes the seen-window only. */
export function recordFlaggedPost(state: RepeatState, input: FlagInput): RepeatState {
  const handle = normalizeHandle(input.handle);
  const postId = input.postId.trim();
  if (!handle || !postId) return state;

  const now = input.now ?? Date.now();
  const displayName = input.displayName?.trim() ?? '';
  const existing = findAccount(state, handle);

  if (existing?.seenIds.includes(postId)) {
    if (!displayName || displayName === existing.displayName) return state;
    return replace(state, { ...existing, displayName, updatedAt: now });
  }

  const account: FlaggedAccount = existing
    ? {
        ...existing,
        displayName: displayName || existing.displayName,
        count: existing.count + 1,
        seenIds: [postId, ...existing.seenIds].slice(0, MAX_SEEN_POSTS),
        updatedAt: now,
      }
    : {
        handle,
        displayName,
        count: 1,
        seenIds: [postId],
        autoHide: false,
        dismissedAt: 0,
        updatedAt: now,
      };

  const accounts = existing
    ? state.accounts.map((row) => (row.handle === handle ? account : row))
    : [...state.accounts, account];
  return { ...state, accounts: capAccounts(accounts) };
}

export function setAutoHide(state: RepeatState, handle: string, autoHide: boolean, now = Date.now()): RepeatState {
  const account = findAccount(state, handle);
  if (!account || account.autoHide === autoHide) return state;
  return replace(state, { ...account, autoHide, updatedAt: now });
}

/** Clears the tally and the seen-window. Auto-hide is a separate switch. */
export function resetCount(state: RepeatState, handle: string, now = Date.now()): RepeatState {
  const account = findAccount(state, handle);
  if (!account || (account.count === 0 && account.seenIds.length === 0 && account.dismissedAt === 0)) {
    return state;
  }
  return replace(state, { ...account, count: 0, seenIds: [], dismissedAt: 0, updatedAt: now });
}

export function dismissSuggestion(state: RepeatState, handle: string, now = Date.now()): RepeatState {
  const account = findAccount(state, handle);
  if (!account || account.dismissedAt === account.count) return state;
  return replace(state, { ...account, dismissedAt: account.count, updatedAt: now });
}

export function forgetAccount(state: RepeatState, handle: string): RepeatState {
  const key = normalizeHandle(handle);
  if (!key || !state.accounts.some((account) => account.handle === key)) return state;
  return { ...state, accounts: state.accounts.filter((account) => account.handle !== key) };
}

/** Auto-hidden accounts first, then the ones closest to (or past) the suggestion. */
export function listFlaggedAccounts(state: RepeatState): FlaggedAccount[] {
  return [...state.accounts].sort((a, b) => {
    if (a.autoHide !== b.autoHide) return a.autoHide ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.handle.localeCompare(b.handle);
  });
}

function replace(state: RepeatState, account: FlaggedAccount): RepeatState {
  return {
    ...state,
    accounts: state.accounts.map((row) => (row.handle === account.handle ? account : row)),
  };
}
