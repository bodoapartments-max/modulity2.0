import { useCallback, useEffect, useMemo, useState } from 'react';
import services from '../../../infrastructure/services.js';
import { createCalendarDefinitionV1 } from '../../../core/capabilities/calendarDefinitionV1.js';
import { userActor } from '../../../core/data/actorRef.js';

export function useCalendarDefinitions({ workspace, membership, user }) {
  const workspaceId = workspace?.workspaceId;
  const [definitions, setDefinitions] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const canManage = useMemo(() => services?.capabilityDefinition?.canManage(workspace, membership) ?? false, [workspace, membership]);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const [defs, mods] = await Promise.all([
        services.capabilityDefinition.listDefinitions(workspace, { engineId: 'calendar' }),
        services.module.listModules(workspaceId),
      ]);
      setDefinitions(defs);
      setModules(mods.filter((m) => m.status !== 'ARCHIVED'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [workspace, workspaceId]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async ({ name, description, sourceModuleId, mapping }) => {
    if (!canManage) throw new Error('Not authorized');
    const module = modules.find((m) => m.moduleId === sourceModuleId);
    if (!module) throw new Error('Source module not found');
    setSaving(true);
    setError(null);
    try {
      const actor = userActor(user?.userId || user?.uid);
      const def = createCalendarDefinitionV1({
        definitionId: `calendar:${module.moduleCode.toLowerCase()}:${Date.now()}`,
        workspaceId,
        sourceRef: `module:${module.moduleCode}`,
        mapping,
        status: 'ACTIVE',
      });
      const created = await services.capabilityDefinition.createDefinition({
        workspace,
        membership,
        engineId: 'calendar',
        name,
        description,
        source: def.source,
        configuration: def.configuration,
        status: 'ACTIVE',
        createdBy: actor,
      });
      await load();
      return created;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [workspace, membership, workspaceId, modules, user, load, canManage]);

  const setStatus = useCallback(async (definitionId, status) => {
    if (!canManage) throw new Error('Not authorized');
    setSaving(true);
    try {
      await services.capabilityDefinition.setStatus({ workspace, membership, definitionId, status });
      await load();
    } finally {
      setSaving(false);
    }
  }, [workspace, membership, load, canManage]);

  const update = useCallback(async (definitionId, { name, description, sourceModuleId, mapping }) => {
    if (!canManage) throw new Error('Not authorized');
    const module = modules.find((m) => m.moduleId === sourceModuleId);
    if (!module) throw new Error('Source module not found');
    setSaving(true);
    setError(null);
    try {
      const def = createCalendarDefinitionV1({
        definitionId,
        workspaceId,
        sourceRef: `module:${module.moduleCode}`,
        mapping,
        status: undefined,
      });
      await services.capabilityDefinition.updateDefinition({
        workspace,
        membership,
        definitionId,
        changes: {
          name,
          description,
          source: def.source,
          configuration: def.configuration,
        },
      });
      await load();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [workspace, membership, workspaceId, modules, load, canManage]);

  const remove = useCallback(async (definitionId) => {
    if (!canManage) throw new Error('Not authorized');
    setSaving(true);
    setError(null);
    try {
      await services.capabilityDefinition.deleteDefinition({ workspace, membership, definitionId });
      await load();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [workspace, membership, load, canManage]);

  return { definitions, modules, loading, saving, error, canManage, refresh: load, create, update, remove, setStatus };
}
