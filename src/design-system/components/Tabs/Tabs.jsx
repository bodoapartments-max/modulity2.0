/**
 * Tabs
 *
 * Generic accessible tabs primitive. Feature code supplies tab definitions and
 * the active tab key.
 */
import { useState } from 'react';

export default function Tabs({
  tabs,
  activeTab,
  onChange,
  className = '',
  ariaLabel = 'Tabs',
}) {
  const [internalActive, setInternalActive] = useState(tabs[0]?.key);
  const activeKey = activeTab ?? internalActive;
  const activeTabDef = tabs.find((tab) => tab.key === activeKey) || tabs[0];

  const setActive = (key) => {
    if (onChange) onChange(key);
    if (activeTab === undefined) setInternalActive(key);
  };

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex border-b border-neutral-200"
      >
        {tabs.map((tab) => {
          const selected = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={selected}
              aria-controls={`tabpanel-${tab.key}`}
              id={`tab-${tab.key}`}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled || false}
              onClick={() => setActive(tab.key)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  event.preventDefault();
                  const enabledTabs = tabs.filter((t) => !t.disabled);
                  const currentIndex = enabledTabs.findIndex((t) => t.key === activeKey);
                  const nextIndex = event.key === 'ArrowRight'
                    ? (currentIndex + 1) % enabledTabs.length
                    : (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
                  setActive(enabledTabs[nextIndex].key);
                }
              }}
              className={`
                relative px-4 py-2.5 text-sm font-medium outline-none transition-colors
                focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset
                disabled:cursor-not-allowed disabled:text-neutral-400
                ${selected
                  ? 'text-primary-700 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary-600'
                  : 'text-neutral-500 hover:text-neutral-700'}
              `}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`tabpanel-${activeKey}`}
        aria-labelledby={`tab-${activeKey}`}
        className="mt-4"
      >
        {activeTabDef?.content}
      </div>
    </div>
  );
}
