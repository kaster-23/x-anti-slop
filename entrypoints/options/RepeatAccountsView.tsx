import type { FlaggedAccount } from '@/lib/repeat';

export function RepeatAccountsView({
  threshold,
  accounts,
  onReset,
  onToggleAutoHide,
  onForget,
}: {
  threshold: number;
  accounts: FlaggedAccount[];
  onReset: (handle: string) => void;
  onToggleAutoHide: (handle: string, autoHide: boolean) => void;
  onForget: (handle: string) => void;
}) {
  const posts = threshold === 1 ? 'post' : 'posts';

  return (
    <div>
      <h3>Flagged accounts</h3>
      <p className="hint">
        After an account has {threshold} slop or ad {posts} hidden, the next post from that
        account offers to hide the rest. Promoted posts, media, and your own filters do not
        count. Mute and block open X&apos;s own confirmation. Nothing is muted or blocked from
        this page. Counts stay on this device, capped at 200 accounts.
      </p>

      {accounts.length === 0 ? (
        <p className="empty">No accounts have crossed the slop or ad bar.</p>
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
    </div>
  );
}
