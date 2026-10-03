import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { userActor } from '../../../../core/data/actorRef.js';
import { workspaceQueryCache } from '../../../../core/cache/workspaceQueryCache.js';
import services from '../../../../infrastructure/services.js';
import { addDesignerField, createModuleDesignerDraft, designerFieldTypeOptions, isModuleDesignerDirty, moveDesignerField, removeDesignerField, toFieldKey, toggleListField, updateDesignerField, validateModuleDesignerDraft } from '../model.js';

export function useModuleDesigner({ workspace, user, moduleId = null }) {
  const navigate = useNavigate();
  const [moduleDefinition, setModuleDefinition] = useState(null);
  const [entityTypes, setEntityTypes] = useState([]);
  const [draft, setDraft] = useState(() => createModuleDesignerDraft());
  const [initialDraft, setInitialDraft] = useState(() => createModuleDesignerDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const workspaceId = workspace?.workspaceId;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!workspaceId) return;
      setLoading(true);
      try {
        await services.entityType.seedCoreTypes(workspaceId);
        const [types, mod] = await Promise.all([services.entityType.listEntityTypes(workspaceId), moduleId ? services.module.getModule(workspaceId, moduleId) : Promise.resolve(null)]);
        if (moduleId && !mod) throw new Error('Module not found.');
        if (!cancelled) {
          const next = createModuleDesignerDraft(mod);
          setEntityTypes([...types].sort((left, right) => left.name.localeCompare(right.name)));
          setModuleDefinition(mod);
          setDraft(next);
          setInitialDraft(next);
        }
      } catch (loadError) { if (!cancelled) setError(loadError.message); } finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [workspaceId, moduleId]);

  const validation = useMemo(() => validateModuleDesignerDraft(draft, entityTypes), [draft, entityTypes]);
  const dirty = useMemo(() => isModuleDesignerDirty(draft, initialDraft), [draft, initialDraft]);
  useEffect(() => {
    const warn = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const changeMetadata = useCallback((changes) => setDraft((current) => ({ ...current, ...changes })), []);
  const addField = useCallback((type) => setDraft((current) => addDesignerField(current, type)), []);
  const changeField = useCallback((designerId, changes) => setDraft((current) => {
    const field = current.fields.find((item) => item._designerId === designerId);
    const normalized = changes.label !== undefined && field && !field.key ? { ...changes, key: toFieldKey(changes.label) } : changes;
    return updateDesignerField(current, designerId, normalized);
  }), []);
  const removeField = useCallback((designerId) => setDraft((current) => removeDesignerField(current, designerId)), []);
  const moveField = useCallback((designerId, direction) => setDraft((current) => moveDesignerField(current, designerId, direction)), []);
  const toggleFieldInList = useCallback((key) => setDraft((current) => toggleListField(current, key)), []);

  const save = useCallback(async ({ publish }) => {
    const currentValidation = validateModuleDesignerDraft(draft, entityTypes);
    if (!currentValidation.valid) { setError('Fix Designer validation errors before saving.'); return null; }
    setSaving(true);
    setError(null);
    try {
      const actor = userActor(user.userId || user.uid);
      let saved;
      if (!moduleId) {
        saved = await services.module.createModule({ workspaceId, ...currentValidation.payload, createdBy: actor });
        if (publish) saved = await services.module.activateModule(workspaceId, saved.moduleId, actor);
      } else {
        saved = await services.module.updateModule(workspaceId, moduleId, { name: currentValidation.payload.name, description: currentValidation.payload.description, category: currentValidation.payload.category, formSchema: currentValidation.payload.formSchema, displayConfig: currentValidation.payload.displayConfig }, actor);
        if (publish && saved.status !== 'ACTIVE') saved = await services.module.activateModule(workspaceId, moduleId, actor);
      }
      workspaceQueryCache.invalidate(`${workspaceId}:modules:`);
      setInitialDraft(createModuleDesignerDraft(saved));
      navigate(`/app/modules/${saved.moduleId}`);
      return saved;
    } catch (saveError) { setError(saveError.message || 'Module could not be saved.'); return null; } finally { setSaving(false); }
  }, [draft, entityTypes, moduleId, navigate, user, workspaceId]);

  const cancel = useCallback(() => {
    if (!dirty || window.confirm('Discard unsaved Designer changes?')) navigate(moduleId ? `/app/modules/${moduleId}` : '/app/modules');
  }, [dirty, moduleId, navigate]);

  return { moduleDefinition, entityTypes, draft, validation, dirty, loading, saving, error, fieldTypes: designerFieldTypeOptions(), changeMetadata, addField, changeField, removeField, moveField, toggleFieldInList, saveDraft: () => save({ publish: false }), publish: () => save({ publish: true }), cancel };
}
