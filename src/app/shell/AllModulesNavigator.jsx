/**
 * AllModulesNavigator — authorized Module discovery (Step 17.2).
 *
 * My Modules = personalized working set.
 * All Modules = the full authorized discovery surface.
 * A Module hidden from the personal selection MUST remain discoverable here.
 *
 * Derives grouping from the SAME canonical moduleCategories collection —
 * never a parallel category list.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import services from '../../infrastructure/services.js';
import { buildModulePresentation } from '../../features/modules/model.js';

export default function AllModulesNavigator({ workspaceId, userId, className = '' }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [modules, setModules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) return undefined;
    Promise.all([
      services.module.listModules(workspaceId),
      services.moduleCategory?.listCategories(workspaceId) ?? Promise.resolve([]),
    ]).then(([mods, cats]) => {
      if (!cancelled) { setModules((mods || []).filter((m) => m.status !== 'ARCHIVED')); setCategories(cats || []); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [workspaceId]);

  useEffect(() => {
    if (!open) return undefined;
    function onDocDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const presentation = useMemo(
    () => buildModulePresentation(modules, categories, null, { search }),
    [modules, categories, search],
  );
  void userId;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        All Modules ▾
      </button>
      {open && (
        <div role="menu" className="absolute left-0 z-40 mt-1 w-72 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
          <input
            type="search"
            autoFocus
            placeholder="Search all modules…"
            aria-label="Search all modules"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <div className="max-h-96 overflow-y-auto">
            {presentation.groups.length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-neutral-500">No authorized Modules match.</p>
            )}
            {presentation.groups.map((group) => (
              <div key={group.categoryId} className="mb-1">
                <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  {group.displayName}
                </p>
                {group.modules.map((mod) => (
                  <button
                    key={mod.moduleId}
                    type="button"
                    role="menuitem"
                    onClick={() => { setOpen(false); navigate(`/app/modules/${mod.moduleId}/records`); }}
                    className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-primary-50 hover:text-primary-700"
                  >
                    {mod.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
