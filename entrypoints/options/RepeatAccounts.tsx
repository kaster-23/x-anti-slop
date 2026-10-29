import { useEffect, useState } from 'react';
import {
  forgetAccount,
  listFlaggedAccounts,
  normalizeRepeatState,
  resetCount,
  setAutoHide,
  type FlaggedAccount,
} from '@/lib/repeat';
import { loadRepeat, repeatStore, updateRepeat } from '@/lib/repeat-store';
import { RepeatAccountsView } from './RepeatAccountsView';

/** Settings-page list. The timeline writes the counts; this page reviews them. */
export default function RepeatAccounts({ threshold }: { threshold: number }) {
  const [accounts, setAccounts] = useState<FlaggedAccount[]>([]);

  useEffect(() => {
    let alive = true;
    void loadRepeat().then((stored) => {
      if (alive) setAccounts(listFlaggedAccounts(stored));
    });
    const unwatch = repeatStore.watch((value) => {
      setAccounts(listFlaggedAccounts(normalizeRepeatState(value)));
    });
    return () => {
      alive = false;
      unwatch();
    };
  }, []);

  async function change(mutator: Parameters<typeof updateRepeat>[0]) {
    const next = await updateRepeat(mutator);
    setAccounts(listFlaggedAccounts(next));
  }

  return (
    <RepeatAccountsView
      threshold={threshold}
      accounts={accounts}
      onReset={(handle) => {
        void change((current) => resetCount(current, handle));
      }}
      onToggleAutoHide={(handle, autoHide) => {
        void change((current) => setAutoHide(current, handle, autoHide));
      }}
      onForget={(handle) => {
        void change((current) => forgetAccount(current, handle));
      }}
    />
  );
}
