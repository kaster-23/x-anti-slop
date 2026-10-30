import { autosaveText, type AutosavePhase } from '@/lib/autosave';

export function AutosaveStatus({
  phase,
  showHint,
  hint,
  onRetry,
}: {
  phase: AutosavePhase;
  showHint: boolean;
  hint: string;
  onRetry: () => void;
}) {
  const text = autosaveText(phase);
  return (
    <div className={`autosave is-${phase}`}>
      <p className="autosave-line" role="status" aria-live="polite">
        {text}
        {phase === 'error' && (
          <button type="button" className="text-btn" onClick={onRetry}>
            Retry
          </button>
        )}
      </p>
      {showHint && <p className="hint autosave-hint">{hint}</p>}
    </div>
  );
}
