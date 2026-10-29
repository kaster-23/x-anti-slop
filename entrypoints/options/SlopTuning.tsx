import { useEffect, useState } from 'react';
import { clearLabels, labelsStore, type StoredLabel } from '@/lib/labels';
import { THRESHOLD_MAX, THRESHOLD_MIN } from '@/lib/defaults';
import { fitFromLabels } from '@/lib/detect/fit';
import { SLOP_CATEGORIES, type SlopCategory } from '@/lib/detect/score';
import type { Settings } from '@/lib/types';

const CATEGORY_COPY: Record<SlopCategory, { label: string; hint: string }> = {
  assistant: { label: 'Assistant residue', hint: 'Chatbot leftovers, flattery, unprompted pivots' },
  profundity: { label: 'False profundity', hint: 'Announced insights, coined labels, inflated stakes' },
  cadence: { label: 'Machine cadence', hint: 'Even rhythm, tidy bows, engagement closes' },
  circumvention: { label: 'Circumvention', hint: 'Colons and performed casualness in place of known tells' },
  vocabulary: { label: 'Stock vocabulary', hint: 'Full signal at two always-tier words, or a cluster of them' },
  templates: { label: 'Templated structure', hint: 'Thread-bait, numbered lists, stacked short lines' },
};

export default function SlopTuning({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<unknown> | void;
}) {
  const [labels, setLabels] = useState<Record<string, StoredLabel>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    labelsStore.getValue().then((stored) => setLabels(stored ?? {})).catch(() => {});
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
    <section className="card">
      <h2>Slop score</h2>
      <p className="caption">
        Each post is one Jev request: about thirty writing-style questions, plus local counts
        of em dashes, stock vocabulary, and templated structure. Those become one score.
        A bucket can also hide a post when its strongest tell clears the bar below. Bot-style
        replies inside a thread use a lower bar. Marks stay in this browser.
      </p>

      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            checked={settings.labeling}
            onChange={(e) => onChange({ labeling: e.target.checked })}
          />
          <span>Show AI / Human marks on posts</span>
        </label>
      </div>

      <div className="field">
        <label htmlFor="reply-bot">Bot-style replies</label>
        <div className="row">
          <input
            id="reply-bot"
            className="grow"
            type="range"
            min={THRESHOLD_MIN}
            max={THRESHOLD_MAX}
            step={0.05}
            value={settings.replyBotThreshold}
            aria-label="Bot-style reply threshold"
            onChange={(e) => onChange({ replyBotThreshold: Number(e.target.value) })}
          />
          <span className="thresh sub">{Math.round(settings.replyBotThreshold * 100)}%</span>
        </div>
        <div className="sub">
          Used instead of the AI-slop threshold when a reply in a thread looks like a bot.
          The bucket bars drop by the same gap.
        </div>
      </div>

      {SLOP_CATEGORIES.map((id) => {
        const cfg = settings.slopCategories[id];
        const copy = CATEGORY_COPY[id];
        return (
          <div className="row" key={id}>
            <label className="check grow" title={copy.hint}>
              <input
                type="checkbox"
                checked={cfg.enabled}
                onChange={(e) =>
                  onChange({
                    slopCategories: {
                      ...settings.slopCategories,
                      [id]: { ...cfg, enabled: e.target.checked },
                    },
                  })
                }
              />
              <span>{copy.label}</span>
            </label>
            <input
              type="range"
              min={THRESHOLD_MIN}
              max={THRESHOLD_MAX}
              step={0.05}
              value={cfg.threshold}
              disabled={!cfg.enabled}
              aria-label={`${copy.label} threshold`}
              onChange={(e) =>
                onChange({
                  slopCategories: {
                    ...settings.slopCategories,
                    [id]: { ...cfg, threshold: Number(e.target.value) },
                  },
                })
              }
            />
            <span className="thresh sub">{Math.round(cfg.threshold * 100)}%</span>
          </div>
        );
      })}

      <div className="field">
        <div className="sub">
          {ai} AI · {human} human
          {settings.slopWeights ? ' · weights fitted from your marks' : ' · starting weights'}
        </div>
        <div className="row wrap" style={{ marginTop: 10 }}>
          <button type="button" onClick={fit} disabled={busy}>
            {busy ? 'Fitting…' : 'Fit weights'}
          </button>
          <button type="button" onClick={() => onChange({ slopWeights: null })} disabled={!settings.slopWeights}>
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
        {message && <div className="sub">{message}</div>}
      </div>
    </section>
  );
}
