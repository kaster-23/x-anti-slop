import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FlaggedAccount } from '@/lib/repeat';
import { RepeatAccountsView } from './RepeatAccountsView';

function account(fields: Partial<FlaggedAccount> = {}): FlaggedAccount {
  return {
    handle: 'bob',
    displayName: 'Bob',
    count: 4,
    seenIds: [],
    autoHide: false,
    dismissedAt: 0,
    updatedAt: 1,
    ...fields,
  };
}

function markup(props: Partial<Parameters<typeof RepeatAccountsView>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(RepeatAccountsView, {
      threshold: 3,
      accounts: [],
      onReset: () => {},
      onToggleAutoHide: () => {},
      onForget: () => {},
      ...props,
    }),
  );
}

describe('flagged account settings section', () => {
  test('shows the default threshold and an empty list', () => {
    const html = markup();
    expect(html).toContain('Flagged accounts');
    expect(html).toContain('After an account has 3 slop or ad posts hidden');
    expect(html).toContain('No flagged accounts yet');
    expect(html).toContain('Nothing is muted or blocked');
    expect(html).not.toContain('type="number"');
  });

  test('lists a handle with reset, hide, and forget', () => {
    const html = markup({ accounts: [account()] });
    expect(html).toContain('@bob');
    expect(html).toContain('Bob');
    expect(html).toContain('4 hidden');
    expect(html).toContain('Reset count');
    expect(html).toContain('Hide all');
    expect(html).toContain('Forget');
    expect(html).not.toContain('Undo auto-hide');
  });

  test('offers undo when the account is auto-hidden', () => {
    const html = markup({ accounts: [account({ autoHide: true, count: 3 })] });
    expect(html).toContain('Undo auto-hide');
    expect(html).toContain('auto-hiding');
    expect(html).toContain('3 hidden');
  });
});
