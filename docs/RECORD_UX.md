# Record UX Architecture (Step 14)

This document describes the canonical Record experience: lists, detail, draft
editing, copy, print and export. The invariant from `DEVELOPMENT_RULES.md`
applies: **ONE canonical Record is the source of truth** — every view in this
document is a projection of the same Record; nothing here stores a copy.

## 1. Record Lists

There is one listing architecture used by both surfaces:

- **Global Records** (`/app/records`) — Records across the workspace, with
  bucket Tabs (All / My Records / Received / Sent / Starred / Archived),
  canonical `Select` filters (status, priority, module, sort), a created-date
  window, page-scoped search, and cursor-stack `Pagination`.
- **Module Record List** (`/app/modules/:moduleId/records`) — the same
  `RecordTable` (design-system `DataGrid`) filtered by `moduleId`, with
  schema-derived data columns (`displayConfig.listFields` or first fields).

Query semantics:

- `RecordQueryService` executes bounded, cursor-paginated queries
  (`limit: 25`, `documentId()` tie-breaker). Collaboration buckets resolve
  bounded ID sets first, then fetch.
- Sorting is whitelist-only (`newest`, `oldest`, `recently updated` via
  `resolveRecordSort`). UI never passes raw field names or operators to the
  query layer.
- **Search is page-scoped by design.** The toolbar search filters the loaded
  page client-side (`filterRecordsBySearch`) and says so in the UI. Full
  workspace search remains Step 33 (Global Search) and must not be faked by
  downloading all Records to the browser.
- Loading, empty, error and no-search-result states use design-system
  `LoadingState` / `EmptyState` / `ErrorState`.

## 2. Record Display Title

`getRecordDisplayLabel(record, fields, moduleDefinition)` derives a
deterministic human label without mutating Records or adding title storage:

1. `displayConfig.primaryField` value, if configured and non-empty,
2. first text-like schema field (`text`, `textarea`, `email`, `phone`, `url`,
   `select`) with a non-empty value,
3. fallback: `{Module name} · {first 8 chars of recordId}`.

## 3. Record Detail

`RecordDetailPage` loads the Record, its Module, the historical Module
Version schema and Entity display names via `useRecordWithSchema`.

- **Header**: display label, `Badge` for status and priority, short Record ID.
- **Actions**: Edit draft (DRAFT only), Create copy, Print, Export JSON — all
  `no-print` and presentation-only.
- **Metadata**: Module (linked), Record Type, Module Version, Workspace,
  created/updated/submitted timestamps and actor labels (`formatActorLabel`).
  Cross-user Person profiles are not readable by Rules, so other users show a
  truncated ID — intentional.
- **Content**: values rendered with the historical FormSchema through
  `formatDisplayValue` (never only the newest Module schema). Date and
  datetime values parse as local wall-clock (`parseLocalDateTime`) to avoid
  accidental UTC day shifts.
- **Entity References**: resolved names link to Entity Detail; missing or
  unavailable Entities render as `entityId (unavailable)` without a link.
- **History**: `RecordHistory` reads durable Audit entries from the canonical
  Audit Service. Trusted Ledger/Audit backend authority is Step 16 — the UI
  does not reconstruct history from guesses.

## 4. Draft Editing and Autosave

`RecordEditPage` (`/app/records/:recordId/edit`) edits **DRAFT Records only**.

- Non-DRAFT Records get a read-only explanation and cannot open the editor.
- Saves go through the existing `RecordService.updateDraftRecord` path
  (client-authoritative): only `data` and `entityReferences` are written;
  provenance fields (`recordId`, `moduleId`, `moduleVersion`, `createdBy`, …)
  are stripped by the service and protected by Firestore Rules. Record data is
  frozen by Rules once the status leaves DRAFT.
- **Autosave**: `FormRenderer.onValuesChange` → debounced (1.2 s) update of
  the SAME Draft Record, with visible states `Unsaved changes… / Saving… /
  All changes saved · <time> / Save failed — Retry`. Autosave never creates a
  new Record and never fires on mount.
- **Known limitation:** DRAFT → SUBMITTED from the client is currently
  rejected by Firestore Rules because `submittedBy` is an always-immutable
  field. That transition needs a trusted Record command and is **deferred to
  Step 15** (Generic Record Actions/Lifecycle). The editor therefore offers
  "Save changes" but no client-side submit.

## 5. Create Copy

"Create copy" on Record Detail builds safe prefill values via
`buildRecordCopyValues` (only keys present in the schema, `file-reference`
excluded, deep-cloned) and opens the Module form with them:

```
Record Detail → Create copy → Module Form (prefilled, notice banner)
  → user reviews/edits → Submit → trusted recordCommand CREATE_RECORD
  → NEW canonical Record (new recordId, operationId, createdAt, actor)
```

Identity, provenance and audit history are never copied — by construction
they cannot appear as FormSchema field keys.

## 6. Print and Export

- **Print**: browser print of the SAME Record. Global `@media print` CSS
  hides the app shell chrome (`no-print` on header, sidebar, drawer, back
  links and action rows); the printed page shows header, metadata, data,
  Entity references, Ledger registration and history.
- **Export JSON**: single-Record sanitized download via `buildRecordExport`
  (actor labels instead of raw UIDs, no `_`-prefixed fields, no
  `entityReferenceIds` index). It reads the Record the user was already
  authorized to view.
- **PDF**: deferred. Deterministic generated PDFs belong to the Document
  Engine / Step 30; browser "Save as PDF" works on top of the print styles.
  No fake canonical PDF/Document subsystem exists.

## 7. Navigation Contract

- List row / title link → Record Detail (with `fromModule` back-context).
- Record Detail → source Module (`/app/modules/:moduleId`).
- Record Detail → referenced Entity (`/app/entities/:entityId`).
- Calendar event click → Record Detail (`CalendarPage`); Calendar owns no
  business data.
- Record Detail → Ledger Book when registered.

## 8. Security Boundaries (unchanged by Step 14)

- Canonical Record CREATE is server-authoritative via `recordCommand`;
  browser `create` on `records/{id}` remains denied by Rules.
- UI visibility is never authorization; every protected read/write relies on
  the existing Rules boundary.
- No user-controlled configuration can specify Firestore paths, operators or
  executable rendering; `DataGrid` renderers are trusted build-time code.
- Record values are rendered as text — no HTML injection.

## 9. Explicitly Deferred

Generic Record Actions/Lifecycle, Approval, Workflow, Attachments, Signatures,
Send/Share UI, Comments, saved views/filter definitions, bulk lifecycle
mutations, Global Search, generated PDF/Documents, timezone/i18n policy.
