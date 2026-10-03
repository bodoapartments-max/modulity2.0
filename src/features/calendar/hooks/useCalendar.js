import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

  const loadGenerationRef = useRef(0);

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
    if (view === 'year') {
      start.setMonth(0, 1);
      end.setMonth(11, 31);
    } else if (view === 'month') {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1, 0);
    } else if (view === 'week') {
      const day = start.getDay();
      // Monday-first: Sunday becomes previous week
      const offset = day === 0 ? -6 : 1 - day;
      start.setDate(start.getDate() + offset);
      end.setDate(start.getDate() + 6);
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
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    setLoadingEvents(true);
    setEventsError(null);
    try {
      const defs = definitions.filter((d) => selectedDefinitionIds.includes(d.definitionId));
      const result = await services.capabilityRuntime.createEngine(defs[0]).projectMultiple(defs, windowBounds);
      if (loadGenerationRef.current !== generation) return;
      if (!result.ok) {
        const errorLines = result.errors.map((e) => {
          const prefix = e.definitionName || e.definitionId || 'Calendar';
          if (e.code === 'INVALID_DEFINITION' && Array.isArray(e.issues)) {
            return `${prefix}: ${e.issues.map((issue) => issue.message || issue.code).join(', ')}`;
          }
          return `${prefix}: ${e.message || e.code}`;
        });
        setEventsError(errorLines.join('; '));
        setEvents(result.events || []);
      } else {
        setEvents(result.events);
      }
    } catch (err) {
      if (loadGenerationRef.current !== generation) return;
      setEventsError(err.message);
      setEvents([]);
    } finally {
      if (loadGenerationRef.current === generation) {
        setLoadingEvents(false);
      }
    }
  }, [definitions, selectedDefinitionIds, windowBounds, workspaceId]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

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
    selectedDefinitionIds,
    setSelectedDefinitionIds,
    events,
    loadingEvents,
    eventsError,
    windowBounds,
    refresh: loadDefinitions,
  };
}
