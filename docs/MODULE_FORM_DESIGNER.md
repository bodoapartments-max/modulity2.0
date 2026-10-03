# Generic Module & Form Designer

## Status

Step 10.3 production foundation.

## Architecture audit

| Concern | Existing architecture reused |
|---|---|
| Module identity and lifecycle | `module.js`, `ModuleService`, immutable moduleCode reservation |
| Module persistence | Existing Workspace-scoped Module repository |
| Published history | Immutable `modules/{moduleId}/versions/{version}` snapshots |
| Form contract | Existing `FormSchema` and shared `FIELD_TYPES` |
| Field rendering | Existing deterministic Field Registry and FormRenderer |
| Validation | `validateFormSchema`, shared field/value validation, Designer bounds |
| EntityReference | Existing canonical Entity Type IDs and EntityReference runtime |
| Records | Existing ModuleSubmissionService and RecordService |
| Record lists | Existing `displayConfig.listFields` and generic Module Record List |
| Record details | Existing historical Module Version renderer |
| Authorization | Existing Personal owner / Organization ADMIN or OWNER Module Rules |
| Automat Modules | Same canonical Module/Form schema; no conversion |
| Capability architecture | Future independent CapabilityDefinitions; no embedding in schema |

No second form, Module, Record, Entity, or Designer persistence architecture was introduced.

## Canonical flow

```text
Human Designer
→ Designer draft state
→ deterministic validation
→ existing ModuleService
→ immutable Module Version
→ existing FormRenderer
→ existing ModuleSubmissionService
→ canonical Record
```

The Designer edits declarative configuration. It is not the FormRenderer, Module Engine, Record Engine, Entity store, or Capability Engine.

## Designer state

- Canonical persisted Module: Workspace-scoped Module document.
- Published Module Version: immutable historical snapshot.
- Designer draft: bounded in-memory React state only.
- Preview state: FormRenderer-local values only.

No localStorage, `formDesignerDrafts`, parallel `forms`, or generated JSX is used. Cancel/back never publishes. Dirty state and browser-unload warnings protect unsaved changes.

## Create and publish

Create can:

1. save a canonical DRAFT Module using existing ModuleService; or
2. create the DRAFT and immediately activate it, producing immutable Version 1.

Module code is stable and permanently reserved.

## Editing and versioning

Current ModuleService behavior is authoritative:

- DRAFT schema edits update the draft without a version snapshot.
- First activation creates immutable Version 1.
- ACTIVE schema publication atomically increments the Module version and creates the new immutable snapshot.
- Historical Records retain their immutable `moduleId + moduleVersion` and render through the corresponding historical snapshot.
- ARCHIVED Modules cannot be edited.

The same Designer opens manual and Automat-created Modules. No author-specific schema format exists.

## Field palette

The palette is derived from registered production Field Registry types:

- text
- textarea
- number
- date
- datetime
- boolean
- select
- email
- phone
- url
- entity-reference
- file-reference

Unsupported types are not advertised.

## Field configuration

Common editable properties:

- stable key
- label
- type
- required
- placeholder
- help text
- deterministic order
- Record List visibility

Supported type-specific properties:

- select: bounded static values or value/label pairs
- entity-reference: canonical current-Workspace Core or Domain Entity Type
- number: min/max
- text/textarea: minLength/maxLength

No expressions, scripts, Firestore paths, executable option providers, remote modules, or JavaScript configuration are accepted.

## Record List

Field selections produce the existing:

```text
displayConfig.listFields
```

The generic Module Record List uses these fields. No per-Module list component is generated.

## Preview

Preview passes the current validated draft FormSchema directly to the production FormRenderer. The preview submit callback only confirms local validation and never calls ModuleSubmissionService or creates a Record.

## Bounds

- Maximum 50 fields
- Maximum 50 options per select
- Maximum 8 explicit Record List fields
- Module name: 120 characters
- Module code: 80 characters
- Description: 1,000 characters
- Category: 120 characters
- Field label: 160 characters
- Help text: 500 characters
- Placeholder: 200 characters
- Schema: 64 KB
- Configuration depth: 8

Existing Form Schema and field validators remain authoritative in addition to these Designer bounds.

## EntityReference integrity

The selector loads bounded Entity Type metadata for the current Workspace and treats Core and Domain types through the same contract. Designer validation and ModuleService both reject unknown or cross-Workspace Entity Type references. No collection path is stored.

## Authorization

No Designer permission was added. Existing Module authorization remains authoritative:

- Personal Workspace owner can create/update.
- Organization ADMIN/OWNER can create/update.
- Ordinary members and outsiders are denied by Firestore Rules.
- UI visibility is not authorization.

## Multiple authors, one schema

```text
Human Designer
Automat / Workspace Architect
Future document understanding/import
Future trusted external API
        ↓
same ModuleDefinition + FormSchema
        ↓
deterministic validation
        ↓
human review / trusted service
        ↓
ModuleService versioning
```

There is no `manualFormSchema`, `aiFormSchema`, or `importedFormSchema`.

## Future Photo/PDF import seam

```text
Photo / Scan / PDF
→ document understanding
→ proposed declarative FormSchema
→ Workspace semantic reuse
→ createModuleDesignerDraft/importProposedSchemaToDesignerDraft
→ human review/edit
→ deterministic validation
→ ModuleService publish
```

No OCR, vision, PDF, Word, Excel, or image processing exists in Step 10.3.

## Future AI seam

Automat may propose Module/Form configuration. Humans can open the same schema in Designer before publishing. Automat remains proposal intelligence, not Module execution authority.

## Future Capability seam

A future Designer section may author independent CapabilityDefinitions. Capability configuration will not be embedded as executable behavior in Module schemas. Step 10.2 availability remains truthful and no CapabilityDefinition persistence is added here.

## Verification

Authenticated Reset Test Hotel verification passed for Vehicle Entity creation, generic Vehicle Inspection design/preview/publication, Vehicle/Employee EntityReference selection, canonical Record submission/list/detail, and responsive desktop/768px/375px layouts. The same Designer loaded the Automat-generated Reservation schema, published an Internal Notes change as v2, preserved historical v1 Record rendering, and created a new v2 Record through the production FormRenderer/Record Engine.

## Security invariants

- No generated form JSX
- No arbitrary executable configuration
- No arbitrary Firestore paths
- No cross-Workspace Entity Type references
- No permission/role/entitlement grants
- No historical version mutation
- No Record creation from preview
- No capability configuration embedded into canonical Module data
