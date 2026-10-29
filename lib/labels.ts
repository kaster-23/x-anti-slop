import { storage } from '#imports';

/** A post the user marked. Stays in extension local storage; never sent out. */
export interface StoredLabel {
  id: string;
  label: 0 | 1;
  features: Record<string, number>;
  text: string;
  author: string;
  at: number;
}

export const labelsStore = storage.defineItem<Record<string, StoredLabel>>('local:slopLabels', {
  fallback: {},
});

let queue: Promise<unknown> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

export function saveLabel(row: StoredLabel): Promise<void> {
  return enqueue(async () => {
    const all = { ...(await labelsStore.getValue()) };
    all[row.id] = row;
    await labelsStore.setValue(all);
  });
}

export function clearLabels(): Promise<void> {
  return enqueue(async () => {
    await labelsStore.setValue({});
  });
}

export async function labelMarks(): Promise<Record<string, 0 | 1>> {
  const all = await labelsStore.getValue();
  const marks: Record<string, 0 | 1> = {};
  for (const [id, row] of Object.entries(all ?? {})) marks[id] = row.label;
  return marks;
}
