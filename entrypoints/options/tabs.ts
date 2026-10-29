export const OPTIONS_TABS = [
  { id: 'filtering', label: 'Filtering' },
  { id: 'lists', label: 'Lists' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'account', label: 'Account' },
] as const;

export type OptionsTab = (typeof OPTIONS_TABS)[number]['id'];

/** Older anchors and the key field still open the tab that contains them. */
const HASH_ALIASES: Record<string, OptionsTab> = {
  filtering: 'filtering',
  filters: 'filtering',
  preset: 'filtering',
  lists: 'lists',
  appearance: 'appearance',
  account: 'account',
  key: 'account',
  provider: 'account',
  usage: 'account',
};

/** The tab named by a location hash, or null when the hash is empty or unknown. */
export function tabFromHash(hash: string): OptionsTab | null {
  const id = hash.replace(/^#/, '').trim().toLowerCase();
  if (!id) return null;
  return HASH_ALIASES[id] ?? null;
}

/** Hash wins. With no hash, a missing key opens Account so the key field is first. */
export function initialTab(hash: string, hasKey: boolean): OptionsTab {
  return tabFromHash(hash) ?? (hasKey ? 'filtering' : 'account');
}

/** Left, Right, Home, and End move between tabs. Other keys do not. */
export function tabFromKey(current: OptionsTab, key: string): OptionsTab | null {
  const ids = OPTIONS_TABS.map((tab) => tab.id);
  const index = ids.indexOf(current);
  if (index < 0) return null;
  if (key === 'ArrowRight') return ids[(index + 1) % ids.length] ?? null;
  if (key === 'ArrowLeft') return ids[index <= 0 ? ids.length - 1 : index - 1] ?? null;
  if (key === 'Home') return ids[0] ?? null;
  if (key === 'End') return ids[ids.length - 1] ?? null;
  return null;
}
