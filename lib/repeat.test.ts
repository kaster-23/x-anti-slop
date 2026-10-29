import { describe, expect, test } from 'bun:test';
import { DEFAULT_SETTINGS } from './defaults';
import {
  DEFAULT_REPEAT_THRESHOLD,
  EMPTY_REPEAT_STATE,
  MAX_FLAGGED_ACCOUNTS,
  MAX_SEEN_POSTS,
  REPEAT_THRESHOLD_MAX,
  REPEAT_THRESHOLD_MIN,
  capAccounts,
  clampRepeatThreshold,
  dismissSuggestion,
  findAccount,
  forgetAccount,
  isAutoHidden,
  listFlaggedAccounts,
  normalizeRepeatState,
  recordFlaggedPost,
  resetCount,
  setAutoHide,
  shouldSuggest,
  type FlaggedAccount,
  type RepeatState,
} from './repeat';

function flag(state: RepeatState, handle: string, postId: string, displayName = ''): RepeatState {
  return recordFlaggedPost(state, { handle, postId, displayName, now: 1_000 });
}

/** The timeline asks before it records the post on screen. */
function suggestBeforeRecording(state: RepeatState, handle: string, threshold: number): boolean {
  return shouldSuggest(findAccount(state, handle), threshold);
}

describe('repeat threshold', () => {
  test('defaults to 3 and is the settings default', () => {
    expect(DEFAULT_REPEAT_THRESHOLD).toBe(3);
    expect(DEFAULT_SETTINGS.repeatThreshold).toBe(3);
  });

  test('clamps to the slider range and ignores junk', () => {
    expect(clampRepeatThreshold(3)).toBe(3);
    expect(clampRepeatThreshold(1.2)).toBe(1);
    expect(clampRepeatThreshold(0)).toBe(REPEAT_THRESHOLD_MIN);
    expect(clampRepeatThreshold(100)).toBe(REPEAT_THRESHOLD_MAX);
    expect(clampRepeatThreshold(Number.NaN)).toBe(3);
  });
});

describe('flagged-post counter', () => {
  test('counts each post once and treats @Handle as the same account', () => {
    let state = flag(EMPTY_REPEAT_STATE, '@Bob', '1', 'Bob');
    state = flag(state, 'bob', '1', 'Robert');
    state = flag(state, 'BOB', '2');

    const account = findAccount(state, '@bob');
    expect(account?.count).toBe(2);
    expect(account?.displayName).toBe('Robert');
    expect(account?.seenIds).toEqual(['2', '1']);
  });

  test('ignores a post with no handle or id', () => {
    const state = recordFlaggedPost(EMPTY_REPEAT_STATE, { handle: '  ', postId: '1' });
    expect(recordFlaggedPost(state, { handle: 'bob', postId: '  ' })).toBe(state);
    expect(state.accounts).toEqual([]);
  });

  test('keeps only the recent post ids, without shrinking the count', () => {
    let state = EMPTY_REPEAT_STATE;
    for (let n = 0; n < MAX_SEEN_POSTS + 5; n++) state = flag(state, 'bob', `p${n}`);
    const account = findAccount(state, 'bob');
    expect(account?.count).toBe(MAX_SEEN_POSTS + 5);
    expect(account?.seenIds).toHaveLength(MAX_SEEN_POSTS);
    expect(account?.seenIds).not.toContain('p0');

    const again = flag(state, 'bob', 'p0');
    expect(findAccount(again, 'bob')?.count).toBe(MAX_SEEN_POSTS + 6);
  });
});

describe('suggestion threshold', () => {
  test('asks on the next post after the default of 3, not on the post that crossed it', () => {
    let state = EMPTY_REPEAT_STATE;
    for (const id of ['a', 'b', 'c']) {
      expect(suggestBeforeRecording(state, 'bob', DEFAULT_REPEAT_THRESHOLD)).toBe(false);
      state = flag(state, 'bob', id);
    }
    expect(findAccount(state, 'bob')?.count).toBe(3);
    expect(suggestBeforeRecording(state, 'bob', 3)).toBe(true);
  });

  test('follows a configured threshold', () => {
    let state = EMPTY_REPEAT_STATE;
    for (let n = 0; n < 4; n++) {
      expect(suggestBeforeRecording(state, 'bob', 5)).toBe(false);
      state = flag(state, 'bob', `p${n}`);
    }
    expect(suggestBeforeRecording(state, 'bob', 5)).toBe(false);
    state = flag(state, 'bob', 'p4');
    expect(suggestBeforeRecording(state, 'bob', 5)).toBe(true);
    expect(suggestBeforeRecording(state, 'bob', 2)).toBe(true);
  });

  test('not now stays quiet until another post is flagged', () => {
    let state = EMPTY_REPEAT_STATE;
    for (const id of ['a', 'b', 'c']) state = flag(state, 'bob', id);
    state = dismissSuggestion(state, '@bob');
    expect(suggestBeforeRecording(state, 'bob', 3)).toBe(false);
    state = flag(state, 'bob', 'd');
    expect(suggestBeforeRecording(state, 'bob', 3)).toBe(true);
  });

  test('auto-hide suppresses the suggestion', () => {
    let state = EMPTY_REPEAT_STATE;
    for (const id of ['a', 'b', 'c']) state = flag(state, 'bob', id);
    state = setAutoHide(state, 'bob', true);
    expect(isAutoHidden(state, '@Bob')).toBe(true);
    expect(suggestBeforeRecording(state, 'bob', 3)).toBe(false);
  });
});

describe('flagged account settings', () => {
  test('reset clears the count and leaves auto-hide alone', () => {
    let state = flag(flag(EMPTY_REPEAT_STATE, 'bob', '1'), 'bob', '2');
    state = setAutoHide(state, 'bob', true);
    state = resetCount(state, 'bob');
    const account = findAccount(state, 'bob');
    expect(account).toMatchObject({ count: 0, seenIds: [], dismissedAt: 0, autoHide: true });
  });

  test('undo turns auto-hide off and keeps the count', () => {
    let state = flag(flag(flag(EMPTY_REPEAT_STATE, 'bob', '1'), 'bob', '2'), 'bob', '3');
    state = setAutoHide(state, 'bob', true);
    state = setAutoHide(state, 'bob', false);
    expect(isAutoHidden(state, 'bob')).toBe(false);
    expect(findAccount(state, 'bob')?.count).toBe(3);
    expect(suggestBeforeRecording(state, 'bob', 3)).toBe(true);
  });

  test('forget drops the account', () => {
    let state = flag(EMPTY_REPEAT_STATE, 'bob', '1');
    state = setAutoHide(state, 'bob', true);
    state = forgetAccount(state, '@bob');
    expect(findAccount(state, 'bob')).toBeUndefined();
    expect(isAutoHidden(state, 'bob')).toBe(false);
  });

  test('lists auto-hidden accounts first, then the highest counts', () => {
    let state = flag(EMPTY_REPEAT_STATE, 'cara', '1');
    state = flag(state, 'ann', '1');
    state = flag(state, 'ann', '2');
    state = flag(state, 'bob', '1');
    state = setAutoHide(state, 'bob', true);
    expect(listFlaggedAccounts(state).map((account) => account.handle)).toEqual(['bob', 'ann', 'cara']);
  });

  test('normalizes a stored record before the settings page reads it', () => {
    const state = normalizeRepeatState({
      revision: 4,
      accounts: [
        { handle: '@Ann', count: 2.9, seenIds: ['1', 2], autoHide: 1, displayName: ' Ann ' },
        { handle: '', count: 9 },
      ],
    });
    expect(state.revision).toBe(4);
    expect(state.accounts).toEqual([
      {
        handle: 'ann',
        displayName: 'Ann',
        count: 2,
        seenIds: ['1'],
        autoHide: false,
        dismissedAt: 0,
        updatedAt: 0,
      },
    ]);
  });
});

describe('storage cap', () => {
  function row(handle: string, count: number, autoHide = false): FlaggedAccount {
    return {
      handle,
      displayName: '',
      count,
      seenIds: [],
      autoHide,
      dismissedAt: 0,
      updatedAt: count,
    };
  }

  test('drops the smallest non-hidden tally and keeps auto-hides', () => {
    const accounts = [
      row('keep-me', 1, true),
      row('low', 1),
      row('high', 9),
    ];
    const capped = capAccounts(accounts, 2);
    expect(capped.map((account) => account.handle).sort()).toEqual(['high', 'keep-me']);
  });

  test('recordFlaggedPost refuses to grow past the account cap', () => {
    let state = EMPTY_REPEAT_STATE;
    for (let n = 0; n < MAX_FLAGGED_ACCOUNTS; n++) {
      state = recordFlaggedPost(state, { handle: `user${n}`, postId: '1', now: n + 10 });
    }
    const full = state.accounts.length;
    state = recordFlaggedPost(state, { handle: 'newcomer', postId: '1', now: 10_000 });
    expect(full).toBe(MAX_FLAGGED_ACCOUNTS);
    expect(state.accounts).toHaveLength(MAX_FLAGGED_ACCOUNTS);
    expect(state.accounts.some((account) => account.autoHide)).toBe(false);
  });

  test('an auto-hidden account survives a full book of one-off handles', () => {
    let state = recordFlaggedPost(EMPTY_REPEAT_STATE, { handle: 'keeper', postId: '1', now: 1 });
    state = setAutoHide(state, 'keeper', true, 1);
    for (let n = 0; n < MAX_FLAGGED_ACCOUNTS; n++) {
      state = recordFlaggedPost(state, { handle: `user${n}`, postId: '1', now: n + 2 });
    }
    expect(isAutoHidden(state, 'keeper')).toBe(true);
    expect(state.accounts).toHaveLength(MAX_FLAGGED_ACCOUNTS);
  });
});
