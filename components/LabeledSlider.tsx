import { THRESHOLD_MAX, THRESHOLD_MIN } from '@/lib/defaults';
import { InfoTip } from './InfoTip';

function quantize(value: number, step: number): number {
  const places = step < 1 ? 2 : 0;
  const snapped = Math.round(value / step) * step;
  return Number(snapped.toFixed(places));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function LabeledSlider({
  id,
  label,
  explanation,
  example,
  tipKey,
  checked,
  onChecked,
  value,
  min,
  max,
  step,
  invert = false,
  display,
  left,
  right,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  explanation: string;
  example: string;
  tipKey?: string;
  checked?: boolean;
  onChecked?: (checked: boolean) => void;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Left end stores the higher number, so Relaxed sits on the left. */
  invert?: boolean;
  display: string;
  left: string;
  right: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const sliderValue = invert ? quantize(min + max - value, step) : quantize(value, step);
  const sliderOff = disabled || checked === false;

  function commit(raw: number) {
    const stored = invert ? min + max - raw : raw;
    onChange(clamp(quantize(stored, step), min, max));
  }

  return (
    <div className={`slider-field${sliderOff ? ' is-off' : ''}`}>
      <div className="slider-top">
        {onChecked ? (
          <label className="check grow" htmlFor={`${id}-enabled`}>
            <input
              id={`${id}-enabled`}
              type="checkbox"
              checked={checked === true}
              onChange={(event) => onChecked(event.target.checked)}
            />
            <span>{label}</span>
          </label>
        ) : (
          <label className="grow slider-label" htmlFor={id}>
            {label}
          </label>
        )}
        <InfoTip label={label} explanation={explanation} example={example} tipKey={tipKey} align="end" />
        <span className="slider-value">{display}</span>
      </div>
      <div className="slider-line">
        <span className="slider-end">{left}</span>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={sliderValue}
          disabled={sliderOff}
          aria-label={`${label}, ${left} to ${right}`}
          aria-valuetext={`${display}. ${left} on the left, ${right} on the right.`}
          onChange={(event) => commit(Number(event.target.value))}
        />
        <span className="slider-end">{right}</span>
      </div>
    </div>
  );
}

export function ConfidenceSlider({
  id,
  label,
  explanation,
  example,
  tipKey,
  enabled,
  onEnabled,
  threshold,
  onThreshold,
}: {
  id: string;
  label: string;
  explanation: string;
  example: string;
  tipKey?: string;
  enabled: boolean;
  onEnabled: (enabled: boolean) => void;
  threshold: number;
  onThreshold: (threshold: number) => void;
}) {
  return (
    <LabeledSlider
      id={id}
      label={label}
      explanation={explanation}
      example={example}
      tipKey={tipKey}
      checked={enabled}
      onChecked={onEnabled}
      value={threshold}
      min={THRESHOLD_MIN}
      max={THRESHOLD_MAX}
      step={0.05}
      invert
      display={`${Math.round(threshold * 100)}%`}
      left="Relaxed"
      right="Strict"
      onChange={onThreshold}
    />
  );
}

export function ToggleRow({
  id,
  label,
  checked,
  onChange,
  explanation,
  example,
  tipKey,
  disabled = false,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  explanation: string;
  example: string;
  tipKey?: string;
  disabled?: boolean;
}) {
  return (
    <div className="toggle-row">
      <label className="check grow" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
      <InfoTip label={label} explanation={explanation} example={example} tipKey={tipKey} align="end" />
    </div>
  );
}
