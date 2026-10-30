import { useEffect, useState } from 'react';
import { browser } from '#imports';
import { InfoTip } from '@/components/InfoTip';
import { ENABLED_HELP, MEDIA_HELP, PROMOTED_HELP, QUALITY_HELP, SIGNAL_HELP } from '@/components/help';
import { ConfidenceSlider, LabeledSlider, ToggleRow } from '@/components/LabeledSlider';
import { PresetPicker } from '@/components/PresetPicker';
import { AutosaveStatus } from '@/components/AutosaveStatus';
import { useAutosave } from '@/components/use-autosave';
import { shouldDebounceSave } from '@/lib/autosave';
import { saveSettings } from '@/lib/settings';
import { blankKeys, isUsable, THRESHOLD_MAX, THRESHOLD_MIN } from '@/lib/defaults';
import { customSnapshot, presetChangePatch, presetName, presetPatch } from '@/lib/presets';
import { PROVIDERS, QUALITY_LEVELS, formatCost } from '@/lib/provider';
import type { MediaFilterId, PresetId, Settings, SignalId, Stats } from '@/lib/types';

type UndoState = { name: string; patch: Partial<Settings> };

const SIGNAL_IDS: SignalId[] = ['slop', 'ragebait', 'ads'];
const MEDIA_IDS: MediaFilterId[] = ['images', 'videos', 'gifs'];
const QUALITY_STEP = 0.5;

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [apiError, setApiError] = useState<{ message: string } | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const autosave = useAutosave(async (patch) => {
    setSettings(blankKeys(await saveSettings(patch)));
  });

  useEffect(() => {
    browser.runtime
      .sendMessage({ type: 'getPublicSettings' })
      .then((r: { settings?: Settings; hasKey?: boolean }) => {
        if (!r?.settings) return;
        setSettings(blankKeys(r.settings));
        setHasKey(r.hasKey === true);
      })
      .catch(() => {});
    browser.runtime
      .sendMessage({ type: 'getStats' })
      .then((r: { stats?: Stats }) => setStats(r?.stats ?? null))
      .catch(() => {});
    browser.runtime
      .sendMessage({ type: 'getError' })
      .then((r: { lastError?: { message: string } | null }) => setApiError(r?.lastError ?? null))
      .catch(() => {});
  }, []);

  async function update(patch: Partial<Settings>, kind: 'edit' | 'preset' | 'undo' = 'edit') {
    if (!settings) return;
    if (kind === 'edit') setUndo(null);
    const nextPatch = kind === 'undo' ? patch : presetChangePatch(settings, patch);
    setSettings((prev) => (prev ? { ...prev, ...nextPatch } : prev));
    autosave.submit(nextPatch, kind === 'edit' && shouldDebounceSave(nextPatch));
  }

  function choosePreset(id: PresetId) {
    if (!settings) return;
    setUndo(
      settings.preset === 'custom'
        ? { name: presetName(id), patch: customSnapshot(settings) }
        : null,
    );
    void update(presetPatch(id), 'preset');
  }

  function undoPreset() {
    if (!undo) return;
    const patch = undo.patch;
    setUndo(null);
    void update(patch, 'undo');
  }

  if (!settings) return <div className="pop"><p className="hint pad">Loading…</p></div>;

  const customFilters = (settings.customFilters ?? []).filter(isUsable);
  const mode =
    settings.preset === 'custom'
      ? `Custom, based on ${presetName(settings.presetBase)}`
      : presetName(settings.preset);
  const costLabel = stats ? formatCost(stats.cost) : '';

  function patchFilter(id: string, fields: Partial<(typeof customFilters)[number]>) {
    update({
      customFilters: (settings!.customFilters ?? []).map((filter) =>
        filter.id === id ? { ...filter, ...fields } : filter,
      ),
    });
  }

  return (
    <div className="pop">
      <header className="mast">
        <div className="grow">
          <h1>X-AntiSlop</h1>
          <p className="status-line">{hasKey ? 'Key connected' : 'No API key'} · {mode}</p>
        </div>
        <InfoTip
          label={ENABLED_HELP.label}
          explanation={ENABLED_HELP.explanation}
          example={ENABLED_HELP.example}
          align="end"
        />
        <div className="mast-side">
          <AutosaveStatus
            phase={autosave.phase}
            showHint={autosave.showHint}
            hint={autosave.hint}
            onRetry={autosave.retry}
          />
          <label className="switch">
          <input
            type="checkbox"
            checked={settings.enabled}
            aria-label={settings.enabled ? 'Turn filtering off' : 'Turn filtering on'}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          <span />
        </label>
        </div>
      </header>

      {apiError && (
        <div className="notice error" role="status">
          <div className="row">
            <span className="grow">
              {apiError.message}{' '}
              {apiError.message.startsWith('Check your key') && (
                  <a href="#" onClick={openOptions}>
                    Open settings
                  </a>
                )}
            </span>
            <button
              type="button"
              className="dismiss"
              aria-label="Dismiss"
              onClick={() => {
                setApiError(null);
                browser.runtime.sendMessage({ type: 'dismissError' }).catch(() => {});
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {!hasKey && (
        <div className="notice">
          No API key. Model filters are off.{' '}
          <a href="#" onClick={openOptions}>
            Add a {PROVIDERS[settings.provider].name} key
          </a>
          .
        </div>
      )}

      <section className="section" aria-labelledby="popup-preset">
        <h2 id="popup-preset">Preset</h2>
        <PresetPicker
          variant="compact"
          preset={settings.preset}
          presetBase={settings.presetBase}
          onSelect={choosePreset}
          onReset={() => update(presetPatch(settings.presetBase))}
          undoName={undo?.name}
          onUndo={undoPreset}
        />
      </section>

      <section className="section" aria-labelledby="popup-totals">
        <h2 id="popup-totals">Totals</h2>
        <div className="totals">
          <div className="total">
            <b>{(stats?.checked ?? 0).toLocaleString()}</b>
            <span>checked</span>
          </div>
          <div className="total">
            <b>{(stats?.filtered ?? 0).toLocaleString()}</b>
            <span>hidden</span>
          </div>
          <div className="total">
            <b>{(stats?.settledLocally ?? 0).toLocaleString()}</b>
            <span>local</span>
          </div>
        </div>
        <p className="hint total-note">
          Since the counters were reset
          {costLabel ? ` · ${costLabel}` : ''}
        </p>
      </section>

      <details className={`tune${settings.enabled ? '' : ' muted-panel'}`}>
        <summary>Adjust filters</summary>
        <div className={`tune-body${!hasKey ? ' muted-panel' : ''}`}>
          {SIGNAL_IDS.map((id) => {
            const help = SIGNAL_HELP[id];
            const cfg = settings.signals[id];
            return (
              <ConfidenceSlider
                key={id}
                id={`popup-${id}`}
                label={help.label}
                explanation={help.explanation}
                example={help.example}
                enabled={cfg.enabled}
                onEnabled={(enabled) =>
                  update({ signals: { ...settings.signals, [id]: { ...cfg, enabled } } })
                }
                threshold={cfg.threshold}
                onThreshold={(threshold) =>
                  update({ signals: { ...settings.signals, [id]: { ...cfg, threshold } } })
                }
              />
            );
          })}
          {customFilters.map((filter) => (
            <LabeledSlider
              key={filter.id}
              id={`popup-cf-${filter.id}`}
              label={filter.label}
              explanation={filter.instructions || 'A yes/no question you wrote.'}
              example="Example: the sample you tried this question on from settings."
              checked={filter.enabled}
              onChecked={(enabled) => patchFilter(filter.id, { enabled })}
              value={filter.threshold}
              min={THRESHOLD_MIN}
              max={THRESHOLD_MAX}
              step={0.05}
              invert
              display={`${Math.round(filter.threshold * 100)}%`}
              left="Relaxed"
              right="Strict"
              onChange={(threshold) => patchFilter(filter.id, { threshold })}
            />
          ))}
          <LabeledSlider
            id="popup-quality"
            label={QUALITY_HELP.label}
            explanation={QUALITY_HELP.explanation}
            example={QUALITY_HELP.example}
            checked={settings.minQuality > 0}
            onChecked={(on) => update({ minQuality: on ? 1 : 0 })}
            value={settings.minQuality || 1}
            min={QUALITY_STEP}
            max={2.5}
            step={QUALITY_STEP}
            display={settings.minQuality > 0 ? settings.minQuality.toFixed(1) : 'Off'}
            left="Lenient"
            right="Picky"
            onChange={(minQuality) => update({ minQuality })}
          />
          {settings.minQuality > 0 && (
            <p className="hint stack-2">
              Hides anything under “{QUALITY_LEVELS[Math.ceil(settings.minQuality)]}”.
            </p>
          )}
        </div>
        <div className="tune-body">
          <ToggleRow
            id="popup-promoted"
            label={PROMOTED_HELP.label}
            explanation={PROMOTED_HELP.explanation}
            example={PROMOTED_HELP.example}
            checked={settings.hidePromoted}
            onChange={(hidePromoted) => update({ hidePromoted })}
          />
          {MEDIA_IDS.map((id) => {
            const help = MEDIA_HELP[id];
            return (
              <ToggleRow
                key={id}
                id={`popup-media-${id}`}
                label={help.label}
                explanation={help.explanation}
                example={help.example}
                checked={settings.mediaFilters[id]}
                onChange={(checked) =>
                  update({ mediaFilters: { ...settings.mediaFilters, [id]: checked } })
                }
              />
            );
          })}
          <p className="hint stack-2">
            <a href="#" onClick={openOptions}>
              All settings
            </a>
          </p>
        </div>
      </details>

      <footer className="foot">
        <a className="grow" href="#" onClick={openOptions}>
          Settings
        </a>
        <span className="hint">{PROVIDERS[settings.provider].name}</span>
      </footer>
    </div>
  );
}

function openOptions(event: React.MouseEvent) {
  event.preventDefault();
  void browser.runtime.sendMessage({ type: 'openOptions' }).catch(() => {});
}
