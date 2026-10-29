import { PRESETS, presetName, type Preset } from '@/lib/presets';
import type { PresetId } from '@/lib/types';

export function PresetPicker({
  preset,
  presetBase,
  onSelect,
  onReset,
  variant = 'cards',
}: {
  preset: PresetId | 'custom';
  presetBase: PresetId;
  onSelect: (id: PresetId) => void;
  onReset: () => void;
  variant?: 'cards' | 'compact';
}) {
  const baseName = presetName(presetBase);
  const order = PRESETS.map((item) => item.id);

  function move(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = preset === 'custom' ? -1 : order.indexOf(preset);
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % order.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = index <= 0 ? order.length - 1 : index - 1;
    } else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = order.length - 1;
    else return;
    event.preventDefault();
    const id = order[next];
    if (!id) return;
    onSelect(id);
    const button = event.currentTarget.querySelector(`[data-preset="${id}"]`);
    if (button instanceof HTMLButtonElement) button.focus();
  }

  return (
    <div className={`preset-block ${variant}`}>
      {preset === 'custom' ? (
        <div className="custom-banner">
          <p>
            Custom (based on {baseName})
          </p>
          <button type="button" onClick={onReset}>
            Reset to {baseName}
          </button>
        </div>
      ) : (
        variant === 'cards' && (
          <p className="hint">
            Move any filter below and this becomes Custom (based on {presetName(preset)}).
          </p>
        )
      )}
      <div
        className={variant === 'cards' ? 'preset-grid' : 'preset-switch'}
        role="radiogroup"
        aria-label="Presets"
        onKeyDown={move}
      >
        {PRESETS.map((item) => (
          <PresetOption
            key={item.id}
            preset={item}
            selected={preset === item.id}
            tabStop={preset === 'custom' ? item.id === 'light' : preset === item.id}
            variant={variant}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function PresetOption({
  preset,
  selected,
  tabStop,
  variant,
  onSelect,
}: {
  preset: Preset;
  selected: boolean;
  tabStop: boolean;
  variant: 'cards' | 'compact';
  onSelect: (id: PresetId) => void;
}) {
  return (
    <button
      type="button"
      className="preset"
      role="radio"
      data-preset={preset.id}
      aria-checked={selected}
      tabIndex={tabStop ? 0 : -1}
      onClick={() => onSelect(preset.id)}
    >
      <span className="preset-name">
        {preset.name}
        {preset.id === 'balanced' && variant === 'cards' && <span className="pill">Default</span>}
      </span>
      {variant === 'cards' ? (
        <span className="preset-desc">{preset.description}</span>
      ) : (
        <span className="sr-only">{preset.description}</span>
      )}
    </button>
  );
}
