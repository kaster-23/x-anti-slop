import { OPTIONS_TABS, tabFromKey, type OptionsTab } from './tabs';

export function OptionsTabs({
  tab,
  onSelect,
}: {
  tab: OptionsTab;
  onSelect: (id: OptionsTab) => void;
}) {
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const next = tabFromKey(tab, event.key);
    if (!next) return;
    event.preventDefault();
    onSelect(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`#tab-${next}`)?.focus();
  }

  return (
    <div className="tabs" role="tablist" aria-label="Settings" onKeyDown={onKeyDown}>
      {OPTIONS_TABS.map((item) => {
        const selected = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            className="tab"
            aria-selected={selected}
            aria-controls={`panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
