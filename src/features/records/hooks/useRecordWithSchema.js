/**
 * useRecordWithSchema — loads a Record together with the Module, the
 * historical Module Version schema that created it, and resolved Entity
 * display names. Shared by the Record detail and draft-edit pages.
 *
 * CRITICAL INVARIANT: a historical Record must always be interpreted using
 * the exact Module Version that created it — never only the current schema.
 */
import { useState, useEffect, useCallback } from 'react';
import services from '../../../infrastructure/services.js';

export function useRecordWithSchema(workspaceId, recordId) {
  const [record, setRecord] = useState(null);
  const [mod, setMod] = useState(null);
  const [versionSchema, setVersionSchema] = useState(null);
  const [entityNames, setEntityNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!workspaceId || !recordId) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    services?.record?.getRecord(workspaceId, recordId)
      .then(async (rec) => {
        if (cancelled || !rec) return;
        setRecord(rec);

        if (rec.moduleId && services?.module) {
          try {
            const m = await services.module.getModule(workspaceId, rec.moduleId);
            if (!cancelled) setMod(m);

            if (rec.moduleVersion && services.module.getModuleVersion) {
              try {
                const version = await services.module.getModuleVersion(
                  workspaceId, rec.moduleId, rec.moduleVersion,
                );
                if (!cancelled && version) setVersionSchema(version);
              } catch {
                // Version snapshot may not exist for pre-4.1 records
              }
            }
          } catch {
            // Module may not exist or be accessible
          }
        }

        if (rec.entityReferences?.length > 0 && services?.entity) {
          const names = {};
          await Promise.all(
            rec.entityReferences.map(async (ref) => {
              try {
                const entity = await services.entity.getEntity(ref.workspaceId || workspaceId, ref.entityId);
                if (entity) names[ref.entityId] = entity.displayName;
              } catch {
                // Entity may not be accessible
              }
            }),
          );
          if (!cancelled) setEntityNames(names);
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [workspaceId, recordId, reloadToken]);

  const historicalSchema = versionSchema?.formSchema || mod?.formSchema;
  const fields = historicalSchema?.fields || [];
  const schemaSource = versionSchema ? 'historical' : (mod ? 'current' : 'none');

  return { record, mod, versionSchema, fields, schemaSource, entityNames, loading, error, reload };
}
