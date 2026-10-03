import { useCallback, useEffect, useMemo, useState } from 'react';
import services from '../../../infrastructure/services.js';

export function useCalendar({ workspace, membership }) {
  const workspaceId = workspace?.workspaceId;
  const canManage = useMemo(() => services?.capabilityDefinition?.canManage(workspace, membership) ?? false, [workspace, membership]);

  const [definitions, setDefinitions] = useState([]);
  const [loadingDefinitions, setLoadingDefinitions] = useState(false);
  const [definitionError, setDefinitionError] = useState(null);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('month');
  const [selectedDefinitionIds, setSelectedDefinitionIds] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState(null);

  const loadDefinitions = useCallback(async () => {
    if (!workspaceId) return;
    setLoadingDefinitions(true);
    setDefinitionError(null);
    try {
      const list = await services.capabilityDefinition.listDefinitions(workspace, { engineId: 'calendar', status: 'ACTIVE' });
      setDefinitions(list);
      setSelectedDefinitionIds((current) => {
        const activeIds = list.map((d) => d.definitionId);
        return current.filter((id) => activeIds.includes(id)).length > 0 ? current.filter((id) => activeIds.includes(id)) : activeIds;
      });
    } catch (err) {
      setDefinitionError(err.message);
    } finally {
      setLoadingDefinitions(false);
    }
  }, [workspace, workspaceId]);

  useEffect(() => { loadDefinitions(); }, [loadDefinitions]);

  const windowBounds = useMemo(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);
    if (view === 'month') {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1, 0);
    } else if (view === 'week') {
      const day = start.getDay();
      start.setDate(start.getDate() - day);
      end.setDate(end.getDate() + (6 - day));
    } else {
      end.setDate(end.getDate());
    }
    // Buffer for events spanning boundaries
    start.setDate(start.getDate() - 7);
    end.setDate(end.getDate() + 7);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [currentDate, view]);

  const loadEvents = useCallback(async () => {
    if (!workspaceId || selectedDefinitionIds.length === 0) {
      setEvents([]);
      return;
    }
    setLoadingEvents(true);
    setEventsError(null);
    try {
      const defs = definitions.filter((d) => selectedDefinitionIds.includes(d.definitionId));
      const result = await services.capabilityRuntime.createEngine(defs[0]).projectMultiple(defs, windowBounds);
      if (!result.ok) {
        setEventsError(result.errors.map((e) => e.message || e.code).join('; '));
        setEvents(result.events || []);
      } else {
        setEvents(result.events);
      }
    } catch (err) {
      setEventsError(err.message);
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, [definitions, selectedDefinitionIds, windowBounds, workspaceId]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const navigate = useCallback((direction) => {
    setCurrentDate((date) => {
      const next = new Date(date);
      if (view === 'month') next.setMonth(next.getMonth() + direction);
      else if (view === 'week') next.setDate(next.getDate() + direction * 7);
      else next.setDate(next.getDate() + direction);
      return next;
    });
  }, [view]);

  const goToday = useCallback(() => setCurrentDate(new Date()), []);

  return {
    workspace,
    canManage,
    definitions,
    loadingDefinitions,
    definitionError,
    currentDate,
    view,
    setView,
    navigate,
    goToday,
    selectedDefinitionIds,
    setSelectedDefinitionIds,
    events,
    loadingEvents,
    eventsError,
    windowBounds,
    refresh: loadDefinitions,
  };
}
