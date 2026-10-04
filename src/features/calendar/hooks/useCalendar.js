/**
 * useCalendar — Calendar page state backed by the workspace query cache.
 *
 * Root-cause fix for the navigation reload flash: definitions and events used
 * to live only in a component-scope useState, so every revisit remounted with
 * an empty state and forced a full refetch. Now the canonical
 * `workspaceQueryCache` holds the data keyed by workspace, so a revisit shows
 * the previous period instantly while a background refresh silently replaces
 * it. Cache is presentation-only; Calendar business semantics are unchanged.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import services from '../../../infrastructure/services.js';
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';

export function useCalendar({ workspace, membership }) {
  const workspaceId = workspace?.workspaceId;
  const canManage = useMemo(() => services?.capabilityDefinition?.canManage(workspace, membership) ?? false, [workspace, membership]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('month');
  const [selectedDefinitionIds, setSelectedDefinitionIds] = useState(null); // null = not initialized from defs yet

  const definitionLoader = useCallback(
    () => services.capabilityDefinition.listDefinitions(workspace, { engineId: 'calendar', status: 'ACTIVE' }),
    [workspace],
  );
  const defsQuery = useWorkspaceQuery({
    workspaceId,
    resource: 'calendarDefinitions',
    loader: definitionLoader,
    enabled: Boolean(workspaceId),
  });
  const definitions = defsQuery.data || [];
  const loadingDefinitions = defsQuery.initialLoading;
  const definitionError = defsQuery.error?.message || null;

  const windowBounds = useMemo(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);
    if (view === 'year') {
      start.setMonth(0, 1);
      end.setMonth(11, 31);
    } else if (view === 'month') {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1, 0);
    } else if (view === 'week') {
      const day = start.getDay();
      const offset = day === 0 ? -6 : 1 - day; // Monday-first
      start.setDate(start.getDate() + offset);
      end.setDate(start.getDate() + 6);
    } else {
      end.setDate(end.getDate());
    }
    start.setDate(start.getDate() - 7);
    end.setDate(end.getDate() + 7);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [currentDate, view]);

  const selectedIds = useMemo(() => {
    if (selectedDefinitionIds !== null) return selectedDefinitionIds;
    return definitions.map((d) => d.definitionId);
  }, [selectedDefinitionIds, definitions]);

  const eventLoader = useCallback(async () => {
    const defs = definitions.filter((d) => selectedIds.includes(d.definitionId));
    if (!defs.length) return { events: [], errors: [] };
    const result = await services.capabilityRuntime.createEngine(defs[0]).projectMultiple(defs, windowBounds);
    if (!result.ok) {
      const errorLines = (result.errors || []).map((e) => {
        const prefix = e.definitionName || e.definitionId || 'Calendar';
        if (e.code === 'INVALID_DEFINITION' && Array.isArray(e.issues)) {
          return `${prefix}: ${e.issues.map((issue) => issue.message || issue.code).join(', ')}`;
        }
        return `${prefix}: ${e.message || e.code}`;
      });
      return { events: result.events || [], errors: errorLines };
    }
    return { events: result.events || [], errors: [] };
  }, [definitions, selectedIds, windowBounds]);

  const eventsQuery = useWorkspaceQuery({
    workspaceId,
    resource: 'calendarEvents',
    params: { window: windowBounds.end, ids: selectedIds.join(','), view },
    loader: eventLoader,
    enabled: Boolean(workspaceId && selectedIds.length > 0),
  });
  const events = eventsQuery.data?.events || [];

  const eventErrorText = eventsQuery.error?.message || (eventsQuery.data?.errors?.length ? eventsQuery.data.errors.join('; ') : null);
  const loadingEvents = eventsQuery.initialLoading;

  const navigate = useCallback((direction) => {
    setCurrentDate((date) => {
      const next = new Date(date);
      if (view === 'year') next.setFullYear(next.getFullYear() + direction);
      else if (view === 'month') next.setMonth(next.getMonth() + direction);
      else if (view === 'week') next.setDate(next.getDate() + direction * 7);
      else next.setDate(next.getDate() + direction);
      return next;
    });
  }, [view]);

  const goToday = useCallback(() => setCurrentDate(new Date()), []);

  useEffect(() => {
    // Workspace switch wipes the previously recorded selection so the new
    // workspace starts with all of its own calendars selected.
    setSelectedDefinitionIds(null);
  }, [workspaceId]);

  return {
    workspace,
    canManage,
    definitions,
    loadingDefinitions,
    definitionError,
    currentDate,
    setCurrentDate,
    view,
    setView,
    navigate,
    goToday,
    selectedDefinitionIds: selectedIds,
    setSelectedDefinitionIds,
    events,
    loadingEvents,
    eventsError: eventErrorText,
    windowBounds,
    refresh: defsQuery.refresh,
  };
}
