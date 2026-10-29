import { useId, useState } from 'react';

/**
 * A short explanation that opens on hover and on keyboard focus.
 * Escape dismisses it until the pointer leaves or focus moves on.
 */
export function InfoTip({
  label,
  explanation,
  example,
  tipKey,
  align = 'start',
  forceOpen = false,
}: {
  label: string;
  explanation: string;
  example: string;
  tipKey?: string;
  /** `end` opens the bubble toward the left, for controls that sit on the right. */
  align?: 'start' | 'end';
  /** Renders the bubble immediately. Used by tests and screenshots. */
  forceOpen?: boolean;
}) {
  const reactId = useId();
  const tipId = `tip-${reactId.replace(/:/g, '')}`;
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = !dismissed && (forceOpen || hover || focus);

  return (
    <span
      className={align === 'end' ? 'tip align-end' : 'tip'}
      onMouseEnter={() => {
        setDismissed(false);
        setHover(true);
      }}
      onMouseLeave={() => {
        setHover(false);
        setDismissed(false);
      }}
    >
      <button
        type="button"
        className="tip-btn"
        data-tip={tipKey}
        aria-label={`About ${label}`}
        aria-describedby={open ? tipId : undefined}
        onFocus={() => {
          setDismissed(false);
          setFocus(true);
        }}
        onBlur={() => {
          setFocus(false);
          setDismissed(false);
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setDismissed(true);
          }
        }}
      >
        <InfoIcon />
      </button>
      {open && (
        <span role="tooltip" id={tipId} className="tip-pop">
          <span className="tip-body">{explanation}</span>
          <span className="tip-example">{example}</span>
        </span>
      )}
    </span>
  );
}

function InfoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.15V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="4.85" r="0.8" fill="currentColor" />
    </svg>
  );
}
