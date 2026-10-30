import { useEffect, useState } from 'react';
import { clearLabels, labelsStore, type StoredLabel } from '@/lib/labels';
import { THRESHOLD_MAX, THRESHOLD_MIN } from '@/lib/defaults';
import { fitFromLabels } from '@/lib/detect/fit';
import { SLOP_CATEGORIES } from '@/lib/detect/score';
import type { Settings } from '@/lib/types';
import { CATEGORY_HELP, LABELING_HELP, REPLY_HELP } from '@/components/help';
import { ConfidenceSlider, LabeledSlider, ToggleRow } from '@/components/LabeledSlider';

export function SlopBuckets({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  return (
    <>
      {SLOP_CATEGORIES.map((id) => {
        const cfg = settings.slopCategories[id];
        const copy = CATEGORY_HELP[id];
        if (!cfg) return null;
        return (
          <ConfidenceSlider
            key={id}
            id={`bucket-${id}`}
            label={copy.label}
            explanation={copy.explanation}
            example={copy.example}
            tipKey={id}
            enabled={cfg.enabled}
            onEnabled={(enabled) =>
              onChange({
                slopCategories: {
                  ...settings.slopCategories,
                  [id]: { ...cfg, enabled },
                },
              })
            }
            threshold={cfg.threshold}
            onThreshold={(threshold) =>
              onChange({
                slopCategories: {
                  ...settings.slopCategories,
                  [id]: { ...cfg, threshold },
                },
              })
            }
          />
        );
      })}
    </>
  );
}

export function SlopAdvanced({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const [labels, setLabels] = useState<Record<string, StoredLabel>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    labelsStore
      .getValue()
      .then((stored) => setLabels(stored ?? {}))
      .catch(() => {});
  }, []);

  const rows = Object.values(labels);
  const ai = rows.filter((row) => row.label === 1).length;
  const human = rows.length - ai;

  async function fit() {
    setBusy(true);
    setMessage(null);
    const result = fitFromLabels(rows.map((row) => ({ label: row.label, features: row.features })));
    if (!result.ok) {
      setMessage(result.error);
      setBusy(false);
      return;
    }
    await onChange({ slopWeights: result.weights });
    const precision =
      result.precisionAtDefault === null || Number.isNaN(result.precisionAtDefault)
        ? ''
        : ` Out-of-fold precision at 70% is ${Math.round(result.precisionAtDefault * 100)}%.`;
    setMessage(
      `Fitted on ${result.ai} AI and ${result.human} human labels.${precision} Cached verdicts will be re-checked.`,
    );
    setBusy(false);
  }

  function exportLabels() {
    const blob = new Blob([JSON.stringify(labels, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'slop-labels.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <LabeledSlider
        id="reply-bot"
        label={REPLY_HELP.label}
        explanation={REPLY_HELP.explanation}
        example={REPLY_HELP.example}
        tipKey="reply-bot"
        value={settings.replyBotThreshold}
        min={THRESHOLD_MIN}
        max={THRESHOLD_MAX}
        step={0.05}
        invert
        display={`${Math.round(settings.replyBotThreshold * 100)}%`}
        left="Relaxed"
        right="Strict"
        onChange={(replyBotThreshold) => onChange({ replyBotThreshold })}
      />

      <div className="field">
        <ToggleRow
          id="labeling"
          label={LABELING_HELP.label}
          explanation={LABELING_HELP.explanation}
          example={LABELING_HELP.example}
          tipKey="labeling"
          checked={settings.labeling}
          onChange={(labeling) => onChange({ labeling })}
        />
        <p className="hint stack-2">
          {ai} AI · {human} human
          {settings.slopWeights ? ' · weights fitted from your marks' : ' · starting weights'}
        </p>
        <div className="row wrap stack-3">
          <button type="button" onClick={fit} disabled={busy}>
            {busy ? 'Fitting…' : 'Fit weights'}
          </button>
          <button
            type="button"
            onClick={() => onChange({ slopWeights: null })}
            disabled={!settings.slopWeights}
          >
            Reset weights
          </button>
          <button type="button" onClick={exportLabels} disabled={rows.length === 0}>
            Export labels
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={async () => {
              await clearLabels();
              setLabels({});
              setMessage('Labels cleared. Weights were left as they are.');
            }}
          >
            Clear labels
          </button>
        </div>
        {message && <p className="hint stack-2">{message}</p>}
      </div>
    </>
  );
}
