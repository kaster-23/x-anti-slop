import { formatCost } from '@/lib/provider';

export interface MeterCounts {
  checked: number;
  hidden: number;
  settledLocally: number;
  cost: number;
}

export interface Meter {
  update(counts: MeterCounts): void;
  setVisible(visible: boolean): void;
  remove(): void;
}

/**
 * Small fixed panel for the timeline currently open. Counts are for this page,
 * not the lifetime totals in the popup.
 */
export function mountMeter(doc: Document): Meter {
  const root = doc.createElement('div');
  root.className = 'ct-meter';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-label', 'X-AntiSlop counts for this timeline');

  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ct-meter-toggle';
  toggle.textContent = 'X-AntiSlop';
  toggle.title = 'Counts for this timeline. Estimated cost uses the published Jev input rate.';

  const body = doc.createElement('div');
  body.className = 'ct-meter-body';
  const checked = addRow(doc, body, 'Checked');
  const hidden = addRow(doc, body, 'Hidden');
  const local = addRow(doc, body, 'Settled locally');
  const cost = addRow(doc, body, 'Est. cost');

  root.append(toggle, body);
  // On body, so color inherits X's page text instead of the OS canvas color.
  (doc.body ?? doc.documentElement).append(root);

  let collapsed = false;
  let latest: MeterCounts = { checked: 0, hidden: 0, settledLocally: 0, cost: 0 };

  const stop = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  toggle.addEventListener('pointerdown', stop);
  toggle.addEventListener('click', (event) => {
    stop(event);
    collapsed = !collapsed;
    root.classList.toggle('is-collapsed', collapsed);
    body.hidden = collapsed;
    toggle.textContent = collapsed ? `${latest.hidden.toLocaleString()} hidden` : 'X-AntiSlop';
  });

  return {
    update(counts) {
      latest = counts;
      checked.textContent = counts.checked.toLocaleString();
      hidden.textContent = counts.hidden.toLocaleString();
      local.textContent = counts.settledLocally.toLocaleString();
      const costLabel = formatCost(counts.cost);
      cost.textContent = costLabel;
      if (cost.parentElement) cost.parentElement.hidden = costLabel === '';
      if (collapsed) toggle.textContent = `${counts.hidden.toLocaleString()} hidden`;
    },
    setVisible(visible) {
      root.hidden = !visible;
    },
    remove() {
      root.remove();
    },
  };
}

function addRow(doc: Document, parent: HTMLElement, label: string): HTMLElement {
  const row = doc.createElement('div');
  row.className = 'ct-meter-row';
  const name = doc.createElement('span');
  name.textContent = label;
  const value = doc.createElement('b');
  value.textContent = '0';
  row.append(name, value);
  parent.append(row);
  return value;
}
