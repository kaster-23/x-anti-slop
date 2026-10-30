import { useEffect, useState } from 'react';
import { browser } from '#imports';
import { InfoTip } from '@/components/InfoTip';
import {
  AI_WRITTEN_HELP,
  AI_WRITTEN_HIDE_HELP,
  ALLOW_HELP,
  BLOCK_HELP,
  HIDE_MODE_HELP,
  HIDE_UNTIL_HELP,
  KEY_HELP,
  MEDIA_HELP,
  MODEL_HELP,
  PROMOTED_HELP,
  PROVIDER_HELP,
  QUALITY_HELP,
  REPEAT_HELP,
  SIGNAL_HELP,
} from '@/components/help';
import { ConfidenceSlider, LabeledSlider, ToggleRow } from '@/components/LabeledSlider';
import { PresetPicker } from '@/components/PresetPicker';
import { resetOverlayPosition } from '@/lib/overlay-store';
import { useAutosave } from '@/components/use-autosave';
import { AutosaveStatus } from '@/components/AutosaveStatus';
import { shouldDebounceSave } from '@/lib/autosave';
import { AI_WRITTEN_FLOORS, type AiWrittenFloor } from '@/lib/ai-written';
import { activeKey } from '@/lib/defaults';
import { loadSettings, saveSettings } from '@/lib/settings';
import { customSnapshot, presetChangePatch, presetName, presetPatch } from '@/lib/presets';
import { PROVIDERS, QUALITY_LEVELS, formatCost } from '@/lib/provider';
import { parseHandleList } from '@/lib/prefilter';
import { REPEAT_THRESHOLD_MAX, REPEAT_THRESHOLD_MIN } from '@/lib/repeat';
import CardAppearance from './CardAppearance';
import CustomFilters from './CustomFilters';
import { OptionsTabs } from './OptionsTabs';
import RepeatAccounts from './RepeatAccounts';
import { SlopAdvanced, SlopBuckets } from './SlopTuning';
import { initialTab, tabFromHash, type OptionsTab } from './tabs';
import type { HideMode, MediaFilterId, PresetId, ProviderId, Settings, SignalId, Stats } from '@/lib/types';

type UndoState = { name: string; patch: Partial<Settings> };

const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
const SIGNAL_IDS: SignalId[] = ['slop', 'ragebait', 'ads'];
const MEDIA_IDS: MediaFilterId[] = ['images', 'videos', 'gifs'];

const HIDE_MODES: Array<{ id: HideMode; label: string; hint: string }> = [
  { id: 'collapse', label: 'Collapse', hint: 'Replace the post with a one-line note' },
  { id: 'blur', label: 'Blur', hint: 'Blur the post but leave it in place' },
  { id: 'remove', label: 'Remove', hint: 'Delete it from the timeline entirely' },
];

type TestState = { status: 'idle' | 'testing' | 'ok' | 'error'; message?: string };

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [allowlistText, setAllowlistText] = useState('');
  const [blocklistText, setBlocklistText] = useState('');
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [tab, setTab] = useState<OptionsTab>('filtering');
  const autosave = useAutosave(async (patch) => {
    const saved = await saveSettings(patch);
    setSettings((prev) =>
      prev
        ? {
            ...saved,
            typesafeApiKey: patch.typesafeApiKey ?? prev.typesafeApiKey,
            openrouterApiKey: patch.openrouterApiKey ?? prev.openrouterApiKey,
          }
        : saved,
    );
  });

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setAllowlistText(s.allowlist.join('\n'));
      setBlocklistText((s.blocklist ?? []).join('\n'));
      const next = initialTab(window.location.hash, activeKey(s).length > 0);
      setTab(next);
      if (window.location.hash !== `#${next}`) history.replaceState(null, '', `#${next}`);
    });
    refreshStats();
    function onHash() {
      const next = tabFromHash(window.location.hash);
      if (next) setTab(next);
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function selectTab(id: OptionsTab) {
    setTab(id);
    if (window.location.hash !== `#${id}`) window.location.hash = id;
  }

  function refreshStats() {
    browser.runtime
      .sendMessage({ type: 'getStats' })
      .then((r: { stats?: Stats }) => setStats(r?.stats ?? null))
      .catch(() => {});
  }

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

  if (!settings) {
    return (
      <main className="page">
        <p className="hint">Loading settings…</p>
      </main>
    );
  }

  const provider = PROVIDERS[settings.provider];
  const keyField = settings.provider === 'openrouter' ? 'openrouterApiKey' : 'typesafeApiKey';
  const apiKey = settings[keyField];
  const hasKey = activeKey(settings).length > 0;

  async function runTest() {
    setTest({ status: 'testing' });
    const res = (await browser.runtime.sendMessage({
      type: 'testKey',
      provider: settings!.provider,
      apiKey,
      model: settings!.model,
    })) as { ok: boolean; model?: string; error?: string };
    setTest(
      res.ok
        ? { status: 'ok', message: `Connected — answered by ${res.model}` }
        : { status: 'error', message: res.error ?? 'Failed' },
    );
  }

  return (
    <main className="page">
      <header className="mast">
        <div>
          <h1>X-AntiSlop</h1>
          <p className="lede">Hides slop, rage bait, and ads on X.</p>
        </div>
        <div className="mast-side">
          <AutosaveStatus
            phase={autosave.phase}
            showHint={autosave.showHint}
            hint={autosave.hint}
            onRetry={autosave.retry}
          />
          <p className={`status${hasKey ? ' is-on' : ''}`} role="status">
            {hasKey ? 'Key connected' : 'No API key'}
          </p>
        </div>
      </header>

      <OptionsTabs tab={tab} onSelect={selectTab} />

      <div
        className="tab-panel"
        role="tabpanel"
        id="panel-filtering"
        aria-labelledby="tab-filtering"
        hidden={tab !== 'filtering'}
      >
      {!hasKey && (
        <p className="hint tab-note">
          No API key. Model filters are off.{' '}
          <button type="button" className="text-btn" onClick={() => selectTab('account')}>
            Add a key
          </button>
        </p>
      )}

      <section className="panel" aria-labelledby="preset-heading">
        <div className="panel-head">
          <h2 id="preset-heading">Preset</h2>
          {settings.preset !== 'custom' && <p className="hint">Balanced is the default.</p>}
        </div>
        <PresetPicker
          preset={settings.preset}
          presetBase={settings.presetBase}
          onSelect={choosePreset}
          onReset={() => update(presetPatch(settings.presetBase))}
          undoName={undo?.name}
          onUndo={undoPreset}
        />
      </section>

      <section className="panel" id="filters" aria-labelledby="filters-heading">
        <div className="panel-head">
          <h2 id="filters-heading">Filters</h2>
          <p className="hint">Left is relaxed. Right is strict. The number is the confidence required to hide.</p>
        </div>

        {SIGNAL_IDS.map((id) => {
          const help = SIGNAL_HELP[id];
          const cfg = settings.signals[id];
          return (
            <ConfidenceSlider
              key={id}
              id={`signal-${id}`}
              label={help.label}
              explanation={help.explanation}
              example={help.example}
              tipKey={id}
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

        <h3>
          <span className="field-label">
            AI-written label
            <InfoTip
              label={AI_WRITTEN_HELP.label}
              explanation={AI_WRITTEN_HELP.explanation}
              example={AI_WRITTEN_HELP.example}
            />
          </span>
        </h3>
        <div className="toggle-list">
          <ToggleRow
            id="ai-written-show"
            label="Show the label"
            explanation={AI_WRITTEN_HELP.explanation}
            example={AI_WRITTEN_HELP.example}
            tipKey="ai-written"
            checked={settings.aiWritten.show}
            onChange={(show) => update({ aiWritten: { ...settings.aiWritten, show } })}
          />
        </div>
        <div className="field-label">
          <span id="ai-written-floor-label">Show from</span>
        </div>
        <div className="seg" role="group" aria-labelledby="ai-written-floor-label">
          {AI_WRITTEN_FLOORS.map((floor) => (
            <button
              key={floor}
              type="button"
              aria-pressed={settings.aiWritten.floor === floor}
              onClick={() => update({ aiWritten: { ...settings.aiWritten, floor: floor as AiWrittenFloor } })}
            >
              {Math.round(floor * 100)}%
            </button>
          ))}
        </div>
        <p className="hint">Visible posts at or above this get a small AI label. Hidden posts do not.</p>
        <div className="toggle-list">
          <ToggleRow
            id="ai-written-hide"
            label={AI_WRITTEN_HIDE_HELP.label}
            explanation={AI_WRITTEN_HIDE_HELP.explanation}
            example={AI_WRITTEN_HIDE_HELP.example}
            tipKey="ai-written-hide"
            checked={settings.hideAiWritten}
            onChange={(hideAiWritten) => update({ hideAiWritten })}
          />
        </div>

        <div className="toggle-list">
          <ToggleRow
            id="hide-promoted"
            label={PROMOTED_HELP.label}
            explanation={PROMOTED_HELP.explanation}
            example={PROMOTED_HELP.example}
            tipKey="promoted"
            checked={settings.hidePromoted}
            onChange={(hidePromoted) => update({ hidePromoted })}
          />
          {MEDIA_IDS.map((id) => {
            const help = MEDIA_HELP[id];
            return (
              <ToggleRow
                key={id}
                id={`media-${id}`}
                label={help.label}
                explanation={help.explanation}
                example={help.example}
                tipKey={id}
                checked={settings.mediaFilters[id]}
                onChange={(checked) =>
                  update({ mediaFilters: { ...settings.mediaFilters, [id]: checked } })
                }
              />
            );
          })}
        </div>

        <div className="stack-5">
          <LabeledSlider
            id="repeat-threshold"
            label={REPEAT_HELP.label}
            explanation={REPEAT_HELP.explanation}
            example={REPEAT_HELP.example}
            tipKey="repeat"
            value={settings.repeatThreshold}
            min={REPEAT_THRESHOLD_MIN}
            max={REPEAT_THRESHOLD_MAX}
            step={1}
            invert
            display={String(settings.repeatThreshold)}
            left="Patient"
            right="Quick"
            onChange={(repeatThreshold) => update({ repeatThreshold })}
          />
        </div>

        <h3 className="group-label">Writing-style buckets</h3>
        <p className="hint">A bucket hides a post when its strongest tell clears this bar.</p>
        <div className="stack-3">
          <SlopBuckets settings={settings} onChange={update} />
        </div>

        <details className="advanced">
          <summary>
            <span className="summary-row">Advanced</span>
            <span className="hint">Reply bar, quality, marks, questions</span>
          </summary>
          <div className="advanced-body">
            <SlopAdvanced settings={settings} onChange={update} />
            <div className="stack-4">
              <LabeledSlider
                id="quality"
                label={QUALITY_HELP.label}
                explanation={QUALITY_HELP.explanation}
                example={QUALITY_HELP.example}
                tipKey="quality"
                checked={settings.minQuality > 0}
                onChecked={(on) => update({ minQuality: on ? 1 : 0 })}
                value={settings.minQuality || 1}
                min={0.5}
                max={2.5}
                step={0.5}
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
            <div className="stack-4">
              <ToggleRow
                id="hide-until"
                label={HIDE_UNTIL_HELP.label}
                explanation={HIDE_UNTIL_HELP.explanation}
                example={HIDE_UNTIL_HELP.example}
                tipKey="hide-until"
                checked={settings.hideUntilChecked}
                onChange={(hideUntilChecked) => update({ hideUntilChecked })}
              />
            </div>
            <div className="stack-5">
              <CustomFilters
                filters={settings.customFilters}
                onChange={(customFilters) => update({ customFilters })}
              />
            </div>
          </div>
        </details>
      </section>
      </div>

      <div
        className="tab-panel"
        role="tabpanel"
        id="panel-lists"
        aria-labelledby="tab-lists"
        hidden={tab !== 'lists'}
      >
      <section className="panel lists" aria-labelledby="lists-heading">
        <div className="panel-head">
          <h2 id="lists-heading">Lists</h2>
          <p className="hint">Allow list, block list, and flagged accounts.</p>
        </div>

        <h3>
          <span className="field-label">
            Never filter
            <InfoTip label={ALLOW_HELP.label} explanation={ALLOW_HELP.explanation} example={ALLOW_HELP.example} />
          </span>
        </h3>
        <textarea
          spellCheck={false}
          aria-label="Accounts that skip every filter"
          placeholder="@friend&#10;@favouriteaccount"
          value={allowlistText}
          onChange={(e) => setAllowlistText(e.target.value)}
          onBlur={() => update({ allowlist: parseHandleList(allowlistText) })}
        />
        <p className="hint stack-2">One handle per line. These accounts skip every filter.</p>

        <h3>
          <span className="field-label">
            Always hide
            <InfoTip label={BLOCK_HELP.label} explanation={BLOCK_HELP.explanation} example={BLOCK_HELP.example} />
          </span>
        </h3>
        <textarea
          spellCheck={false}
          aria-label="Accounts that are always hidden"
          placeholder="@spammer"
          value={blocklistText}
          onChange={(e) => setBlocklistText(e.target.value)}
          onBlur={() => update({ blocklist: parseHandleList(blocklistText) })}
        />
        <p className="hint stack-2">
          One handle per line. These accounts are hidden, and the post is not sent to the model.
          Posts under five words stay visible without a model call. Hashtag piles, emoji piles,
          link dumps, and all-caps shouting are hidden on this device.
        </p>

        <div className="stack-5">
          <RepeatAccounts threshold={settings.repeatThreshold} />
        </div>
      </section>
      </div>

      <div
        className="tab-panel"
        role="tabpanel"
        id="panel-appearance"
        aria-labelledby="tab-appearance"
        hidden={tab !== 'appearance'}
      >
      <section className="panel" aria-labelledby="appearance-heading">
        <div className="panel-head">
          <h2 id="appearance-heading">Appearance</h2>
        </div>
        <div className="field">
          <div className="field-label">
            <span id="hide-mode-label">When a post is filtered</span>
            <InfoTip
              label={HIDE_MODE_HELP.label}
              explanation={HIDE_MODE_HELP.explanation}
              example={HIDE_MODE_HELP.example}
            />
          </div>
          <div className="seg" role="group" aria-labelledby="hide-mode-label">
            {HIDE_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                title={mode.hint}
                aria-pressed={settings.hideMode === mode.id}
                onClick={() => update({ hideMode: mode.id })}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p className="hint stack-2">
            {HIDE_MODES.find((mode) => mode.id === settings.hideMode)?.hint}
          </p>
        </div>
        <div className="field">
          <div className="field-label">
            <span>Timeline counts</span>
          </div>
          <button
            type="button"
            aria-describedby="overlay-position-hint"
            onClick={() => {
              void resetOverlayPosition().catch(() => {});
            }}
          >
            Reset overlay position
          </button>
          <p id="overlay-position-hint" className="hint stack-2">
            Puts the on-feed counts back at the bottom left, clear of X's buttons. Double-click the
            overlay header to do the same.
          </p>
        </div>
        <CardAppearance cards={settings.cards} onChange={(cards) => update({ cards })} />
      </section>
      </div>

      <div
        className="tab-panel"
        role="tabpanel"
        id="panel-account"
        aria-labelledby="tab-account"
        hidden={tab !== 'account'}
      >
      <section className="panel" aria-labelledby="provider-heading">
        <div className="panel-head">
          <h2 id="provider-heading">Provider and API key</h2>
        </div>
        <div className="field">
          <div className="field-label">
            <span id="provider-label">{PROVIDER_HELP.label}</span>
            <InfoTip
              label={PROVIDER_HELP.label}
              explanation={PROVIDER_HELP.explanation}
              example={PROVIDER_HELP.example}
            />
          </div>
          <div className="seg" role="group" aria-labelledby="provider-label">
            {PROVIDER_IDS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={settings.provider === id}
                onClick={() => {
                  setTest({ status: 'idle' });
                  update({ provider: id });
                }}
              >
                {PROVIDERS[id].label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="field-label">
            <label htmlFor="key">{KEY_HELP.label}</label>
            <InfoTip label={KEY_HELP.label} explanation={KEY_HELP.explanation} example={KEY_HELP.example} />
          </div>
          <div className="key-row">
            <input
              id="key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={`${provider.keyPrefix}…`}
              value={apiKey}
              onChange={(e) => {
                setTest({ status: 'idle' });
                update({ [keyField]: e.target.value.trim() } as Partial<Settings>);
              }}
            />
            <button type="button" className="primary" onClick={runTest} disabled={!apiKey || test.status === 'testing'}>
              {test.status === 'testing' ? 'Testing…' : 'Test'}
            </button>
          </div>
          <p className="hint stack-2">
            {test.status === 'ok' && <span>{test.message}</span>}
            {test.status === 'error' && <span className="status-err">{test.message}</span>}
            {test.status !== 'ok' && test.status !== 'error' && (
              <>
                Stored in this browser. Sent only to {provider.name}.{' '}
                <a href={provider.keysUrl} target="_blank" rel="noreferrer">
                  Get a key
                </a>
                .
              </>
            )}
          </p>
        </div>

        <div className="field">
          <div className="field-label">
            <label htmlFor="model">{MODEL_HELP.label}</label>
            <InfoTip
              label={MODEL_HELP.label}
              explanation={MODEL_HELP.explanation}
              example={MODEL_HELP.example}
            />
          </div>
          <input
            id="model"
            type="text"
            spellCheck={false}
            placeholder={provider.defaultModel}
            value={settings.model}
            onChange={(e) => update({ model: e.target.value })}
          />
          <p className="hint stack-2">Blank uses the default.</p>
        </div>
      </section>

      {stats && (
        <section className="panel" aria-labelledby="usage-heading">
          <div className="panel-head">
            <h2 id="usage-heading">Usage</h2>
            <p className="hint">Since the last reset. Not split by day.</p>
          </div>
          <div className="stats-grid">
            <div className="stat">
              <b>{stats.checked.toLocaleString()}</b>
              <span>posts checked</span>
            </div>
            <div className="stat">
              <b>{stats.filtered.toLocaleString()}</b>
              <span>hidden</span>
            </div>
            <div className="stat">
              <b>{(stats.settledLocally ?? 0).toLocaleString()}</b>
              <span>settled locally</span>
            </div>
            <div className="stat">
              <b>{formatCost(stats.cost)}</b>
              <span>{stats.inputTokens.toLocaleString()} tokens</span>
            </div>
          </div>
          {Object.keys(stats.bySignal).length > 0 && (
            <p className="hint stack-3">
              {Object.entries(stats.bySignal)
                .sort((a, b) => b[1] - a[1])
                .map(([label, n]) => `${label}: ${n}`)
                .join(' · ')}
            </p>
          )}
          <div className="row wrap stack-4">
            <button
              type="button"
              onClick={async () => {
                await browser.runtime.sendMessage({ type: 'resetStats' });
                refreshStats();
              }}
            >
              Reset counters
            </button>
            <button
              type="button"
              title="Forget every cached verdict and re-check posts from scratch"
              onClick={() => browser.runtime.sendMessage({ type: 'clearCache' })}
            >
              Clear cached verdicts
            </button>
          </div>
        </section>
      )}
      </div>
    </main>
  );
}
