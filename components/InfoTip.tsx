import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { TIP_MAX_WIDTH, clampTipShift } from './tip-place';

/**
 * Explanation that opens on hover and on keyboard focus.
 * Escape dismisses it, including when it was opened by hover, until the
 * pointer leaves or focus moves on.
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
  const popRef = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = !dismissed && (forceOpen || hover || focus);

  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!open || !pop) return;
    const rect = pop.getBoundingClientRect();
    const shift = clampTipShift(rect.left, Math.min(rect.width, TIP_MAX_WIDTH), window.innerWidth);
    pop.style.translate = shift === 0 ? '' : `${shift}px 0`;
  }, [open, explanation, example]);

  useEffect(() => {
    if (!hover && !focus) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setDismissed(true);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hover, focus]);

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
        ?
      </button>
      {open && (
        <span ref={popRef} role="tooltip" id={tipId} className="tip-pop">
          <span className="tip-body">{explanation}</span>
          <span className="tip-example">{example}</span>
        </span>
      )}
    </span>
  );
}
