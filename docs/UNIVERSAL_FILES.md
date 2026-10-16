# Universal Files & Attachments — Step 30

Step 30 introduces a **generic, platform-level file architecture**. Files are a
platform capability, not a Module feature and not a domain-owned array on
Records or Entities.

> Canonical metadata lives in Firestore. Binary content lives in object storage.
> All metadata/relationship mutations go through the trusted `fileCommand`
> callable boundary. Browsers upload bytes to a server-derived Storage path,
> then register metadata via command.

## Canonical Model

Three canonical document kinds, all workspace-scoped:

| Document | Collection | Mutability |
|---|---|---|
| `File` | `workspaces/{ws}/files/{fileId}` | Status/currentVersion mutable via trusted commands only |
| `FileVersion` | `workspaces/{ws}/files/{fileId}/versions/{version}` | Immutable after creation |
| `FileAttachment` | `workspaces/{ws}/fileAttachments/{attachmentId}` | Append-only history; detach is a status transition, never a delete |

- `File` carries: name, MIME type, byte size, optional SHA-256 checksum,
  `source` provenance (USER_UPLOAD / GENERATED / IMPORTED /
  EXTERNAL_CONNECTOR / AGENT_PRODUCED), lifecycle `status`
  (ACTIVE / ARCHIVED / DELETED), `currentVersion`, storage `provider` +
  `storagePath`, actor attribution, timestamps, bounded `metadata` (16 KiB).
- `FileVersion` is an immutable snapshot of one binary: version number,
  storage path, size, checksum, MIME type.
- `FileAttachment` pins the **exact version attached at attach time**
  (`attachedVersion`) to a typed target (`RECORD`, `ENTITY`). `CONVERSATION`
  is a reserved, non-active target — chat membership semantics are not
  implemented yet.

`record.attachments` / `entity.attachments` remain **derived indexes** kept in
sync by the trusted command transaction. They are read-optimized copies, never
the relationship of record — the `FileAttachment` document is.

## Command Boundary

All mutations execute server-side via the `fileCommand` Cloud Function
(`functions/src/fileCommandEngine.js`), mirroring the trusted Record command
pattern:

- Command contract `FILE_COMMAND_CONTRACT` (`src/core/files/fileCommandContract.js`)
  validates version, type, payload shape and rejects server-authoritative
  fields (actor, ids, versions, statuses, storagePath, timestamps).
- Actor identity derives from the callable auth context — never the payload.
- File IDs (`f_{operationId}`), attachment IDs (`att_{operationId}`),
  version numbers, storage paths and timestamps are all derived server-side.
- The canonical operation journal provides idempotent replay, in-progress
  detection and conflict semantics.
- Domain mutation + journal completion + BusinessEvent + AuditEntry commit in
  a single Firestore transaction.

Command types: `CREATE_FILE`, `CREATE_FILE_VERSION`, `ATTACH_FILE`,
`DETACH_FILE`, `ARCHIVE_FILE`, `RESTORE_FILE`. There is intentionally **no
purge command** — DELETED is a defined terminal state reserved for a future
retention capability; archive/detach never physically remove binary content.

## Storage Boundary

`src/core/files/fileStorageContract.js` defines the provider-independent
adapter: `upload`, `getDownloadUrl`, `remove`, `exists`. Implementations:

- `inMemoryFileStorageAdapter` — tests.
- `firebaseStorageAdapter` — Firebase Storage.

Canonical object path (server-derived, never caller-chosen):

```
workspaces/{workspaceId}/files/{fileId}/v{version}/{sanitizedName}
```

Upload pipeline (`src/features/files/model.js`): derive path → upload bytes →
SHA-256 checksum → invoke `fileCommand` CREATE_FILE (+ optional ATTACH_FILE).
Raw bytes never enter Firestore or command envelopes.

`storage.rules` enforce: canonical-path-only writes, 50 MiB size bound,
workspace-scoped authorization (personal owner / active organization member
via cross-service `firestore.get`), deny-by-default everywhere else.
Organization uploads to workspaces are denied unless the caller is an ACTIVE
member.

## Authorization

`fileActionPolicy.js` is a pure policy evaluated both in the UI
(non-authoritative affordance discovery) and authoritatively inside the
trusted executor. Workspace existence + owner/membership is verified
server-side every command.

## Read Path

- `fileService` — read-only: `getFile`, `listVersions`,
  `listAttachmentsForTarget`, `listAttachmentsForFile`.
- Repositories (`firestoreFileRepository`, `firestoreFileAttachmentRepository`,
  FileVersion reads inside the file repository) perform **no writes**.
- Firestore Rules: `files`, `files/*/versions`, `fileAttachments` are
  workspace-readable; browser writes are denied — trusted path only.

## Gateway & Capability

- Gateway operations: `file.get`, `file.list` (READ, `file.read`) and
  `file.attach`, `file.detach` (MUTATION, `file.write`, operationId required).
- Capability catalog registers `file` (distinct from the existing `document`
  capability; Document/PDF generation remains the separate Step-30-product
  gap PD-009).

## Deferred / Known Limitations

- Production Storage bucket provisioning is not part of this milestone.
- Malware scanning and content-type spoof detection require a trusted
  post-upload pipeline — deferred.
- `getDownloadUrl` returns Firebase bearer token URLs, not bounded capability
  URLs. Expiring/audited download authorization is deferred.
- No physical purge / retention command yet (`DELETED` state reserved).
- `CONVERSATION` attachment target reserved until chat membership semantics
  land.
- **Test-infra note:** the Storage emulator evaluates cross-service
  `firestore.get` against the *emulator's own* project, not the request
  project. `npm run test:rules` pins `--project modulity-storage-rules-test`
  so Storage rules tests can seed workspace docs via the rules-disabled SDK.
