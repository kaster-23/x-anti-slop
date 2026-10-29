import { nextPresetIndex, PRESETS, presetName, type Preset } from '@/lib/presets';
import type { PresetId } from '@/lib/types';

export function PresetPicker({
  preset,
  presetBase,
  onSelect,
  onReset,
  undoName,
  onUndo,
  variant = 'list',
}: {
  preset: PresetId | 'custom';
  presetBase: PresetId;
  onSelect: (id: PresetId) => void;
  onReset: () => void;
  /** Set after a preset replaces Custom, so the previous knobs can be restored. */
  undoName?: string | null;
  onUndo?: () => void;
  variant?: 'list' | 'compact';
}) {
  const baseName = presetName(presetBase);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-preset]'),
    );
    if (buttons.length === 0) return;
    const active = buttons.findIndex((button) => button === document.activeElement);
    const checked = buttons.findIndex((button) => button.getAttribute('aria-pressed') === 'true');
    const index = active >= 0 ? active : Math.max(0, checked);
    const next = nextPresetIndex(buttons.length, index, event.key);
    if (next === null) return;
    event.preventDefault();
    buttons[next]?.focus();
  }

  return (
    <div className={`preset-block ${variant}`}>
      {preset === 'custom' ? (
        <div className="custom-banner">
          <p>Custom (based on {baseName})</p>
          <button type="button" onClick={onReset}>
            Reset to {baseName}
          </button>
        </div>
      ) : null}
      {undoName && onUndo && (
        <p className="undo-line">
          {undoName} applied.{' '}
          <button type="button" className="text-btn" onClick={onUndo}>
            Undo
          </button>
        </p>
      )}
      <div
        className={variant === 'list' ? 'preset-list' : 'preset-switch'}
        role="group"
        aria-label="Presets"
        onKeyDown={onKeyDown}
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
  variant: 'list' | 'compact';
  onSelect: (id: PresetId) => void;
}) {
  return (
    <button
      type="button"
      className="preset-row"
      data-preset={preset.id}
      aria-pressed={selected}
      tabIndex={tabStop ? 0 : -1}
      onClick={() => onSelect(preset.id)}
    >
      <span className="preset-name">{preset.name}</span>
      {variant === 'list' ? (
        <span className="preset-desc">{preset.description}</span>
      ) : (
        <span className="sr-only">{preset.description}</span>
      )}
    </button>
  );
}
