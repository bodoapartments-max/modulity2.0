import Alert from '../../../../design-system/components/Alert/Alert.jsx';
import Button from '../../../../design-system/components/Button/Button.jsx';
import Card from '../../../../design-system/components/Card/Card.jsx';
import Input from '../../../../design-system/components/Input/Input.jsx';
import Label from '../../../../design-system/components/Label/Label.jsx';
import LoadingState from '../../../../design-system/components/LoadingState/LoadingState.jsx';
import PageContainer from '../../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../../design-system/components/PageHeader/PageHeader.jsx';
import { useAuth } from '../../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../../app/providers/WorkspaceProvider.jsx';
import DesignerFieldEditor from './DesignerFieldEditor.jsx';
import DesignerPreview from './DesignerPreview.jsx';
import ModuleCapabilitiesPanel from './ModuleCapabilitiesPanel.jsx';
import { useModuleDesigner } from '../hooks/useModuleDesigner.js';

export default function ModuleDesigner({ moduleId = null }) {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const designer = useModuleDesigner({ workspace: currentWorkspace, user, moduleId });
  if (designer.loading) return <PageContainer><LoadingState message="Loading Module Designer…" /></PageContainer>;
  const editing = Boolean(moduleId);
  const active = designer.moduleDefinition?.status === 'ACTIVE';
  const previewSchema = designer.validation.payload?.formSchema || { schemaVersion: '1.0.0', fields: [] };
  return <PageContainer>
    <PageHeader title={editing ? `Design ${designer.moduleDefinition?.name || 'Module'}` : 'Create Module'} description="One declarative Module/Form schema rendered by the canonical FormRenderer." action={<div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-medium ${designer.dirty ? 'bg-yellow-50 text-yellow-700' : 'bg-neutral-100 text-neutral-600'}`}>{designer.dirty ? 'Unsaved changes' : 'No unsaved changes'}</span><Button type="button" variant="ghost" onClick={designer.cancel}>Cancel</Button></div>} />
    {designer.error && <Alert variant="error" className="mb-4">{designer.error}</Alert>}
    {!designer.validation.valid && <Alert variant="warning" className="mb-4"><p className="font-medium">Designer validation</p><ul className="mt-1 list-disc pl-5">{designer.validation.errors.map((item) => <li key={item}>{item}</li>)}</ul></Alert>}
    <div className="space-y-6">
      <Card><h2 className="text-lg font-semibold text-neutral-900">Module</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><Label htmlFor="designer-name" required>Name</Label><Input id="designer-name" value={designer.draft.name} onChange={(event) => designer.changeMetadata({ name: event.target.value })} /></div><div><Label htmlFor="designer-code" required>Code</Label><Input id="designer-code" value={designer.draft.moduleCode} disabled={editing} onChange={(event) => designer.changeMetadata({ moduleCode: event.target.value.toUpperCase().replace(/[^A-Z0-9]+/g, '_') })} /><p className="mt-1 text-xs text-neutral-500">Stable and immutable after creation.</p></div><div className="sm:col-span-2"><Label htmlFor="designer-description">Description</Label><textarea id="designer-description" rows={3} value={designer.draft.description} onChange={(event) => designer.changeMetadata({ description: event.target.value })} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" /></div><div><Label htmlFor="designer-category">Category</Label><Input id="designer-category" value={designer.draft.category} onChange={(event) => designer.changeMetadata({ category: event.target.value })} /></div>{editing && <div><Label>Status and version</Label><p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700">{designer.moduleDefinition.status} · v{designer.moduleDefinition.version}{active ? ` → publishing creates v${designer.moduleDefinition.version + 1}` : ''}</p></div>}</div></Card>
      <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-neutral-900">Field Palette</h2><p className="text-sm text-neutral-600">Types come from the production Field Registry.</p></div><span className="text-sm text-neutral-500">{designer.draft.fields.length} fields</span></div><div className="mt-4 flex flex-wrap gap-2">{designer.fieldTypes.map((item) => <Button key={item.value} type="button" variant="secondary" size="sm" onClick={() => designer.addField(item.value)}>Add {item.label}</Button>)}</div></Card>
      <section aria-labelledby="designer-fields-title"><div className="mb-3"><h2 id="designer-fields-title" className="text-lg font-semibold text-neutral-900">Form Fields</h2><p className="text-sm text-neutral-600">Ordered schema fields. Move controls remain keyboard accessible.</p></div><div className="space-y-4">{designer.draft.fields.map((field, index) => <DesignerFieldEditor key={field._designerId} field={field} index={index} total={designer.draft.fields.length} fieldTypes={designer.fieldTypes} entityTypes={designer.entityTypes} listSelected={designer.draft.listFields.includes(field.key)} onChange={(changes) => designer.changeField(field._designerId, changes)} onMove={(direction) => designer.moveField(field._designerId, direction)} onRemove={() => designer.removeField(field._designerId)} onToggleList={() => designer.toggleFieldInList(field.key)} />)}{designer.draft.fields.length === 0 && <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-600">Choose a field type from the palette to begin.</div>}</div></section>
      <Card><h2 className="text-lg font-semibold text-neutral-900">Record List</h2><p className="mt-1 text-sm text-neutral-600">Selected fields feed the existing generic Module Record List through displayConfig.listFields.</p><div className="mt-3 flex flex-wrap gap-2">{designer.draft.listFields.length ? designer.draft.listFields.map((key) => <span key={key} className="rounded-full bg-primary-50 px-3 py-1 text-sm text-primary-700">{designer.draft.fields.find((field) => field.key === key)?.label || key}</span>) : <span className="text-sm text-neutral-500">No explicit list fields; the runtime will use its deterministic fallback.</span>}</div></Card>
      <DesignerPreview schema={previewSchema} workspaceId={currentWorkspace.workspaceId} valid={designer.validation.valid} />
      <ModuleCapabilitiesPanel moduleDefinition={designer.moduleDefinition} />
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"><p className="text-sm text-neutral-600">{active ? 'Publishing a schema change creates an immutable next Module version.' : 'Save an editable draft or publish the first immutable version.'}</p><div className="flex flex-wrap gap-2">{!active && <Button type="button" variant="secondary" disabled={!designer.dirty || designer.saving} loading={designer.saving} onClick={designer.saveDraft}>Save Draft</Button>}<Button type="button" disabled={!designer.dirty || !designer.validation.valid || designer.saving} loading={designer.saving} onClick={designer.publish}>{active ? `Publish v${designer.moduleDefinition.version + 1}` : 'Publish Module'}</Button></div></div>
    </div>
  </PageContainer>;
}
