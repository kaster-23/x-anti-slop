import { useEffect, useState } from 'react';
import {
  REPEAT_THRESHOLD_MAX,
  REPEAT_THRESHOLD_MIN,
  clampRepeatThreshold,
  type FlaggedAccount,
} from '@/lib/repeat';

export function RepeatAccountsView({
  threshold,
  accounts,
  onThreshold,
  onReset,
  onToggleAutoHide,
  onForget,
}: {
  threshold: number;
  accounts: FlaggedAccount[];
  onThreshold: (threshold: number) => void;
  onReset: (handle: string) => void;
  onToggleAutoHide: (handle: string, autoHide: boolean) => void;
  onForget: (handle: string) => void;
}) {
  const [draft, setDraft] = useState(String(threshold));

  useEffect(() => {
    setDraft(String(threshold));
  }, [threshold]);

  function commitDraft() {
    const next = clampRepeatThreshold(Number(draft));
    setDraft(String(next));
    if (next !== threshold) onThreshold(next);
  }

  return (
    <section className="card">
      <h2>Flagged accounts</h2>
      <p className="caption">
        After an account has this many posts hidden, the next post from that account offers to
        hide the rest. Mute and block open X&apos;s own confirmation. Nothing is muted or blocked
        from this page.
      </p>

      <div className="field">
        <label htmlFor="repeat-threshold">Flagged posts before suggesting</label>
        <input
          id="repeat-threshold"
          className="threshold-input"
          type="number"
          inputMode="numeric"
          min={REPEAT_THRESHOLD_MIN}
          max={REPEAT_THRESHOLD_MAX}
          step={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitDraft();
            }
          }}
        />
        <div className="sub">Default is 3. Counts stay on this device, capped at 200 accounts.</div>
      </div>

      {accounts.length === 0 ? (
        <p className="empty">No flagged accounts yet.</p>
      ) : (
        <div className="accounts">
          {accounts.map((account) => (
            <div className="account" key={account.handle}>
              <div className="grow">
                <b>@{account.handle}</b>
                {account.displayName ? <span className="sub"> {account.displayName}</span> : null}
                <div className="sub">
                  {account.count} hidden{account.autoHide ? ' · auto-hiding' : ''}
                </div>
              </div>
              <div className="row wrap">
                <button type="button" onClick={() => onReset(account.handle)}>
                  Reset count
                </button>
                <button
                  type="button"
                  onClick={() => onToggleAutoHide(account.handle, !account.autoHide)}
                >
                  {account.autoHide ? 'Undo auto-hide' : 'Hide all'}
                </button>
                <button type="button" className="danger" onClick={() => onForget(account.handle)}>
                  Forget
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
