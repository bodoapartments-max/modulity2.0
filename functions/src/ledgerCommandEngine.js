/**
 * Trusted Ledger Command Engine (server-side, Admin SDK).
 *
 * Canonical Ledger Books/Blocks/Entries and Record ledger linkage are
 * authored HERE — browsers are readers only.
 *
 * Commands:
 *   CREATE_LEDGER_BOOK    — code reservation + book + initial block, atomic
 *   REGISTER_LEDGER_ENTRY — deterministic entry id, sequence allocation with
 *                           block rollover, Record linkage, atomic with the
 *                           operation journal and the authoritative Audit doc
 *
 * Authorization happens HERE explicitly — Firestore Rules do not apply to
 * Admin SDK writes.
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  validateLedgerCommand,
  LEDGER_COMMAND_TYPES,
  LEDGER_COMMAND_ERROR_CODES,
  LEDGER_COMMAND_CONTRACT_VERSION,
} from './generated/src/core/ledger/ledgerCommandContract.js';
import { createLedgerBook, formatReferenceNumber } from './generated/src/core/ledger/ledgerBook.js';
import {
  LEDGER_SOURCE_TYPES,
  LEDGER_BOOK_PROVISIONERS,
} from './generated/src/core/ledger/ledgerSourceDefinition.js';
import { createAuditEntry } from './generated/src/core/audit/auditEntry.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES, AUDIT_SOURCES } from './generated/src/core/audit/auditActions.js';
import {
  OPERATION_STATUS,
  OPERATION_LEASE_MS,
  MAX_RECOVERY_ATTEMPTS,
  computeOperationFingerprint,
  operationDoc,
  buildOperationDocument,
  peekCompletedOperation,
} from './operationJournal.js';

const CODES = LEDGER_COMMAND_ERROR_CODES;

const fail = (code, message, details = {}) => {
  const httpCode =
    code === CODES.UNAUTHENTICATED ? 'unauthenticated'
    : code === CODES.WORKSPACE_NOT_FOUND || code === CODES.RECORD_NOT_FOUND || code === CODES.BOOK_NOT_FOUND ? 'not-found'
    : code === CODES.WORKSPACE_FORBIDDEN ? 'permission-denied'
    : code === CODES.OPERATION_CONFLICT || code === CODES.OPERATION_MISMATCH || code === CODES.CODE_CONFLICT ? 'already-exists'
    : 'failed-precondition';
  throw new HttpsError(httpCode, message, { code, ...details });
};

/** Record statuses eligible for Ledger registration (unchanged semantics). */
const REGISTRABLE_STATUSES = ['SUBMITTED', 'ACTIVE', 'COMPLETED'];

/**
 * Step 17.1.1 — normalize the book's evidence source. A bare `moduleId`
 * stays supported (contract 1.0.0) and is interpreted as a MODULE source.
 * The sourceDefinition object is the typed declarative form.
 */
function normalizeSourceDefinition(payload) {
  if (payload.sourceDefinition) return payload.sourceDefinition;
  if (payload.moduleId) return { type: LEDGER_SOURCE_TYPES.MODULE, moduleId: payload.moduleId };
  return null;
}

/**
 * Server-authoritative source validation: the referenced canonical source
 * must exist in this workspace (Admin SDK bypasses Rules, so re-verify here).
 * Currently the only supported source is a Module.
 */
async function validateSourceReferences(db, { workspaceId, sourceDefinition }) {
  if (!sourceDefinition) return;
  if (sourceDefinition.type === LEDGER_SOURCE_TYPES.MODULE) {
    const modSnap = await db.doc(`workspaces/${workspaceId}/modules/${sourceDefinition.moduleId}`).get();
    if (!modSnap.exists) fail(CODES.COMMAND_INVALID, 'sourceDefinition references a Module that does not exist in this workspace.');
  }
}

function recordDoc(db, workspaceId, recordId) {
  return db.doc(`workspaces/${workspaceId}/records/${recordId}`);
}
function bookDoc(db, workspaceId, ledgerBookId) {
  return db.doc(`workspaces/${workspaceId}/ledgerBooks/${ledgerBookId}`);
}
function blockDoc(db, workspaceId, ledgerBookId, blockId) {
  return db.doc(`workspaces/${workspaceId}/ledgerBooks/${ledgerBookId}/blocks/${blockId}`);
}
function entryDoc(db, workspaceId, entryId) {
  return db.doc(`workspaces/${workspaceId}/ledgerEntries/${entryId}`);
}
function codeDoc(db, workspaceId, ledgerCode) {
  return db.doc(`workspaces/${workspaceId}/ledgerCodes/${ledgerCode}`);
}
function auditDoc(db, workspaceId, docId) {
  return db.doc(`workspaces/${workspaceId}/auditEntries/${docId}`);
}

/** Deterministic entry id — at most one entry per (book, record). */
export function deterministicLedgerEntryId(ledgerBookId, recordId) {
  return `le_${ledgerBookId}_${recordId}`;
}

/** Deterministic book bootstrap id for retry-safe CREATE_LEDGER_BOOK. */
function deriveLedgerBookId(operationId) {
  return `lb_${createHash('sha256').update(String(operationId)).digest('hex').slice(0, 24)}`;
}

async function loadWorkspaceAndAuthorize(db, workspaceId, userId) {
  const wsSnap = await db.doc(`workspaces/${workspaceId}`).get();
  if (!wsSnap.exists) fail(CODES.WORKSPACE_NOT_FOUND, 'Workspace not found.', {});
  const workspace = wsSnap.data();
  if (workspace.type === 'PERSONAL') {
    if (workspace.ownerUserId !== userId) fail(CODES.WORKSPACE_FORBIDDEN, 'Only the Personal Workspace owner may perform this operation.');
    return { workspace, authority: 'PERSONAL_OWNER' };
  }
  if (workspace.type === 'ORGANIZATION') {
    const member = await db.doc(`organizations/${workspace.organizationId}/members/${userId}`).get();
    if (!member.exists || member.data().status !== 'ACTIVE') {
      fail(CODES.WORKSPACE_FORBIDDEN, 'Active workspace membership is required.');
    }
    return { workspace, authority: 'ORGANIZATION_MEMBER', member: member.data() };
  }
  fail(CODES.WORKSPACE_FORBIDDEN, 'Unsupported workspace type.');
}

function writeAuditInTransaction(transaction, db, workspaceId, { operationId, action, resourceType, resourceId, userId, metadata, timestamp }) {
  const docId = `op_${operationId}_${action}`;
  const entry = createAuditEntry({
    auditEntryId: docId,
    workspaceId,
    actor: { actorType: 'USER', actorId: userId },
    action,
    resourceType,
    resourceId,
    timestamp,
    metadata: { ...(metadata || {}), operationId },
    source: AUDIT_SOURCES.WEB,
    correlationId: `op:${operationId}`,
  });
  transaction.set(auditDoc(db, workspaceId, docId), {
    ...entry,
    _timestamp: FieldValue.serverTimestamp(),
  });
}

export async function executeLedgerCommand(db, { userId, command, internal = false }) {
  if (!userId) fail(CODES.UNAUTHENTICATED, 'Authentication required.');

  const envelope = validateLedgerCommand(command);
  if (!envelope.valid) fail(envelope.code || CODES.COMMAND_INVALID, envelope.errors.join('; '));

  if (command.commandType === LEDGER_COMMAND_TYPES.CREATE_LEDGER_BOOK) {
    return executeCreateLedgerBook(db, { userId, command, internal });
  }
  if (command.commandType === LEDGER_COMMAND_TYPES.REGISTER_LEDGER_ENTRY) {
    return executeRegisterLedgerEntry(db, { userId, command });
  }
  fail(CODES.UNSUPPORTED_COMMAND, `Command ${command.commandType} is not implemented.`);
}

// ────────────────────────────────────────────────────────────────────────────
// Step 17.1 — Universal Form Ledger orchestration.
// Trusted automatic provisioning + registration used by recordCommand.
// Manual-Designer Modules and Automat-created Modules converge here because
// EVERY canonical Record flows through recordCommand.
// ────────────────────────────────────────────────────────────────────────────

/** Deterministic automatic book identity for a Module: stable across renames. */
export function deriveAutoLedgerBookId(moduleId) {
  return `lb_auto_${moduleId}`;
}

function deriveAutoLedgerCode(moduleId) {
  return `AUTO_${createHash('sha256').update(String(moduleId)).digest('hex').slice(0, 16).toUpperCase()}`;
}

/** Default automatic Form Book capacity (V1 paper-book metaphor, 100/block). */
const AUTO_REGISTER_DEFAULT_BLOCK_SIZE = 100;

/**
 * Finds or creates (server-atomically) the register for a Module.
 *
 * Step 17.1.1 routing: an intentionally USER-provisioned ACTIVE book whose
 * sourceDefinition matches the Module WINS; the per-Module AUTO book is only
 * a fallback so evidence always has a home even before anyone configures one.
 * Book identity never depends on display text — a Module rename or a new
 * Module version keeps the same logical book.
 */
export async function ensureModuleLedgerBook(db, { workspaceId, module, userId }) {
  // Prefer the workspace's intentionally configured register for this Module.
  const configuredSnap = await db.collection(`workspaces/${workspaceId}/ledgerBooks`)
    .where('moduleId', '==', module.moduleId)
    .where('provisionedBy', '==', LEDGER_BOOK_PROVISIONERS.USER)
    .where('status', '==', 'ACTIVE')
    .limit(1)
    .get();
  if (!configuredSnap.empty) {
    const docSnap = configuredSnap.docs[0];
    return { ...docSnap.data(), ledgerBookId: docSnap.id };
  }

  const ledgerBookId = deriveAutoLedgerBookId(module.moduleId);
  const snap = await bookDoc(db, workspaceId, ledgerBookId).get();
  if (snap.exists) return { ...snap.data(), ledgerBookId };

  const { buildCreateLedgerBookCommand } = await import('./generated/src/core/ledger/ledgerCommandContract.js');
  const result = await executeLedgerCommand(db, {
    userId,
    command: buildCreateLedgerBookCommand({
      operationId: `auto-book-${workspaceId}-${module.moduleId}`,
      workspaceId,
      ledgerCode: deriveAutoLedgerCode(module.moduleId),
      name: `${module.name} Register`,
      blockSize: AUTO_REGISTER_DEFAULT_BLOCK_SIZE,
      // Human-readable prefix: the canonical moduleCode (e.g. ROOMINS-2026-000043)
      referencePrefix: module.moduleCode || null,
      moduleId: module.moduleId,
    }),
    internal: true,
  });
  return result.book;
}

/**
 * Automatically registers a canonical submitted Record into its Module's
 * Form Book. Called AFTER the canonical Record mutation commits
 * (post-transaction chaining). Deterministic per record-operation: replays
 * converge to the same entry and never consume a second sequence.
 */
export async function autoRegisterRecordInLedger(db, { workspaceId, record, module, userId, operationId }) {
  const book = await ensureModuleLedgerBook(db, { workspaceId, module, userId });
  const { buildRegisterLedgerEntryCommand } = await import('./generated/src/core/ledger/ledgerCommandContract.js');
  const result = await executeLedgerCommand(db, {
    userId,
    command: buildRegisterLedgerEntryCommand({
      operationId: `auto-register-${operationId}`,
      workspaceId,
      recordId: record.recordId,
      ledgerBookId: book.ledgerBookId,
    }),
  });
  return result.entry;
}

/**
 * Marks Ledger entries for a cancelled Record as CANCELLED (never deleted).
 * Sequence positions stay consumed — paper-book principle. Post-transaction
 * chaining after a trusted CANCEL_RECORD.
 */
export async function cancelLedgerRegistrationForRecord(db, { workspaceId, recordId, userId, cancellationReason = null }) {
  const snap = await db.collection(`workspaces/${workspaceId}/ledgerEntries`)
    .where('recordId', '==', recordId)
    .limit(10)
    .get();
  const batch = db.batch();
  let cancelled = 0;
  for (const entryDocSnap of snap.docs) {
    const entry = entryDocSnap.data();
    if (entry.entryStatus !== 'ACTIVE') continue;
    batch.update(entryDocSnap.ref, {
      entryStatus: 'CANCELLED',
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledBy: { actorType: 'USER', actorId: userId },
      cancellationReason: cancellationReason || 'Record cancelled',
    });
    cancelled += 1;
  }
  if (cancelled > 0) await batch.commit();
  return { cancelled };
}

async function executeCreateLedgerBook(db, { userId, command, internal = false }) {
  const p = command.payload;
  await loadWorkspaceAndAuthorize(db, p.workspaceId, userId);
  const sourceDefinition = normalizeSourceDefinition(p);
  await validateSourceReferences(db, { workspaceId: p.workspaceId, sourceDefinition });
  // provisionedBy is NEVER a client claim: internal AUTO books come only from
  // the trusted per-Module fallback path inside this engine.
  const provisionedBy = internal ? LEDGER_BOOK_PROVISIONERS.AUTO : LEDGER_BOOK_PROVISIONERS.USER;
  const fingerprint = computeOperationFingerprint(userId, command);
  const workspaceId = p.workspaceId;
  const ledgerBookId = deriveLedgerBookId(command.operationId);
  const now = new Date().toISOString();
  const actor = { actorType: 'USER', actorId: userId };

  const peek = await peekCompletedOperation(db, {
    workspaceId, operationId: command.operationId, userId, fingerprint, fail, codes: CODES,
  });
  if (peek) {
    const bookSnap = await bookDoc(db, workspaceId, ledgerBookId).get();
    const book = bookSnap.exists ? { ...bookSnap.data(), ledgerBookId } : null;
    // Backfill is deterministic/idempotent — a replay continues it so a
    // previously interrupted creation converges without duplicate sequences.
    let backfill = null;
    if (book && sourceDefinition && !internal) {
      backfill = await backfillLedgerSource(db, {
        workspaceId, ledgerBookId, sourceDefinition, userId, operationId: command.operationId,
      }).catch(() => null);
    }
    return backfill ? { book, operationId: command.operationId, idempotent: true, backfill } : { book, operationId: command.operationId, idempotent: true };
  }

  const opRef = operationDoc(db, workspaceId, command.operationId);
  const result = await db.runTransaction(async (transaction) => {
    // Firestore transactions require ALL reads before ALL writes.
    const opSnap = await transaction.get(opRef);
    const codeSnap = await transaction.get(codeDoc(db, workspaceId, p.ledgerCode));

    if (opSnap.exists) {
      const op = opSnap.data();
      if (op.userId !== userId || op.workspaceId !== workspaceId) fail(CODES.OPERATION_CONFLICT, 'Operation identity mismatch.');
      if (op.fingerprint !== fingerprint) fail(CODES.OPERATION_MISMATCH, 'Operation command mismatch.');
      if (op.status === OPERATION_STATUS.COMPLETED) return { replay: true };
      if (op.status === OPERATION_STATUS.FAILED) fail(CODES.OPERATION_CONFLICT, 'Operation exists with terminal or failed status.');
      // PROCESSING: recover when stale
      const leaseExpired = !op.leaseExpiresAt || op.leaseExpiresAt.toMillis() <= Timestamp.now().toMillis();
      if (!leaseExpired) return { inProgress: true };
      const attemptCount = (op.attemptCount || 1) + 1;
      if (attemptCount > MAX_RECOVERY_ATTEMPTS) fail(CODES.OPERATION_FAILED, 'Operation recovery limit exceeded.');
      transaction.update(opRef, {
        status: OPERATION_STATUS.PROCESSING,
        attemptCount,
        leaseExpiresAt: Timestamp.fromMillis(Timestamp.now().toMillis() + OPERATION_LEASE_MS),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      transaction.set(opRef, buildOperationDocument({ command, userId, fingerprint, status: OPERATION_STATUS.PROCESSING }));
    }

    // Code uniqueness inside the transaction — never orphan reservations
    if (codeSnap.exists) {
      const existing = codeSnap.data();
      if (existing.ledgerBookId === ledgerBookId) {
        // Same operation re-run after partial success — finish atomically
      } else {
        fail(CODES.CODE_CONFLICT, `Ledger code "${p.ledgerCode}" is already in use.`);
      }
    }

    const book = createLedgerBook({
      ledgerBookId,
      workspaceId,
      ledgerCode: p.ledgerCode,
      name: p.name,
      description: p.description || '',
      moduleId: sourceDefinition?.type === LEDGER_SOURCE_TYPES.MODULE ? sourceDefinition.moduleId : (p.moduleId || null),
      recordType: p.recordType || null,
      sourceDefinition,
      provisionedBy,
      blockSize: p.blockSize || 100,
      referencePrefix: p.referencePrefix || p.ledgerCode,
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
    });

    transaction.set(codeDoc(db, workspaceId, p.ledgerCode), {
      workspaceId,
      ledgerCode: p.ledgerCode,
      ledgerBookId,
      _createdAt: FieldValue.serverTimestamp(),
    });

    transaction.set(bookDoc(db, workspaceId, ledgerBookId), {
      ...book,
      createdBy: actor,
      _createdAt: FieldValue.serverTimestamp(),
      _updatedAt: FieldValue.serverTimestamp(),
    });

    // Initial block
    transaction.set(blockDoc(db, workspaceId, ledgerBookId, 'block_1'), {
      ledgerBlockId: 'block_1',
      ledgerBookId,
      workspaceId,
      blockNumber: 1,
      startSequence: 1,
      endSequence: planEndSequence(book.blockSize),
      nextSequence: 1,
      capacity: book.blockSize,
      status: 'OPEN',
      closedAt: null,
      createdBy: actor,
      _createdAt: FieldValue.serverTimestamp(),
      _openedAt: FieldValue.serverTimestamp(),
    });

    // Book points at the initial block
    transaction.update(bookDoc(db, workspaceId, ledgerBookId), {
      currentBlockId: 'block_1',
      _updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.update(opRef, {
      status: OPERATION_STATUS.COMPLETED,
      recordId: null,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Authoritative audit evidence in the SAME transaction
    writeAuditInTransaction(transaction, db, workspaceId, {
      operationId: command.operationId,
      action: AUDIT_ACTIONS.LEDGER_BOOK_CREATED,
      resourceType: AUDIT_RESOURCE_TYPES.LEDGER_BOOK,
      resourceId: ledgerBookId,
      userId,
      timestamp: now,
      metadata: { ledgerCode: p.ledgerCode, name: p.name, blockSize: book.blockSize },
    });

    return { book: { ...book, currentBlockId: 'block_1' }, idempotent: false };
  });

  if (result.replay) {
    const bookSnap = await bookDoc(db, workspaceId, ledgerBookId).get();
    const book = bookSnap.exists ? { ...bookSnap.data(), ledgerBookId } : null;
    let backfill = null;
    if (book && sourceDefinition && !internal) {
      backfill = await backfillLedgerSource(db, {
        workspaceId, ledgerBookId, sourceDefinition, userId, operationId: command.operationId,
      }).catch(() => null);
    }
    return backfill ? { book, operationId: command.operationId, idempotent: true, backfill } : { book, operationId: command.operationId, idempotent: true };
  }
  if (result.inProgress) {
    fail(CODES.OPERATION_IN_PROGRESS, 'The same operation is already being processed.');
  }

  // Step 17.1.1 — deterministic historical backfill. An intentionally
  // configured book organizes EXISTING eligible evidence: eligible Records
  // submitted before the book existed are registered in _createdAt order via
  // ordinary REGISTER_LEDGER_ENTRY executions (server-derived sequence,
  // journal + transaction-committed Audit rows). Op ids are deterministic so
  // a retried backfill converges and never consumes a second sequence;
  // already-registered Records converge to their deterministic entry id.
  if (sourceDefinition && !internal && !result.replay) {
    try {
      const summary = await backfillLedgerSource(db, {
        workspaceId,
        ledgerBookId,
        sourceDefinition,
        userId,
        operationId: command.operationId,
      });
      return { book: result.book, operationId: command.operationId, idempotent: false, backfill: summary };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('ledger source backfill failed', err?.message || err);
    }
  }

  return { book: result.book, operationId: command.operationId, idempotent: false };
}

const BACKFILL_PAGE_SIZE = 100;
const BACKFILL_MAX_PAGES = 10; // bounded: at most 1000 historical records per creation

/**
 * Registers eligible historical evidence into a newly configured book.
 * Never fabricates: only canonical Records in REGISTRABLE_STATUSES, ordered
 * by their canonical _createdAt, get register identity; cancelled/trashed
 * history keeps its existing evidence untouched.
 */
async function backfillLedgerSource(db, { workspaceId, ledgerBookId, sourceDefinition, userId, operationId }) {
  if (sourceDefinition.type !== LEDGER_SOURCE_TYPES.MODULE) return { registered: 0, scanned: 0 };
  let scanned = 0;
  let registered = 0;
  let cursor = null;
  for (let page = 0; page < BACKFILL_MAX_PAGES; page += 1) {
    let q = db.collection(`workspaces/${workspaceId}/records`)
      .where('moduleId', '==', sourceDefinition.moduleId)
      .orderBy('_createdAt', 'asc')
      .limit(BACKFILL_PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    for (const recSnap of snap.docs) {
      const rec = recSnap.data();
      scanned += 1;
      cursor = recSnap;
      if (!REGISTRABLE_STATUSES.includes(rec.status)) continue;
      if (rec.workspaceId !== workspaceId) continue;
      try {
        const result = await executeLedgerCommand(db, {
          userId,
          command: {
            contractVersion: LEDGER_COMMAND_CONTRACT_VERSION,
            operationId: `backfill-${operationId}-${recSnap.id}`,
            commandType: LEDGER_COMMAND_TYPES.REGISTER_LEDGER_ENTRY,
            payload: { workspaceId, recordId: recSnap.id, ledgerBookId },
          },
        });
        void result;
        registered += 1;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`ledger backfill failed for record ${recSnap.id}:`, err?.message || err);
      }
    }
    if (snap.size < BACKFILL_PAGE_SIZE) break;
  }
  return { registered, scanned };
}

function planEndSequence(blockSize) {
  return blockSize; // block 1 spans 1..blockSize
}

async function executeRegisterLedgerEntry(db, { userId, command }) {
  const p = command.payload;
  await loadWorkspaceAndAuthorize(db, p.workspaceId, userId);
  const fingerprint = computeOperationFingerprint(userId, command);
  const workspaceId = p.workspaceId;
  const entryId = deterministicLedgerEntryId(p.ledgerBookId, p.recordId);
  const now = new Date().toISOString();

  const peek = await peekCompletedOperation(db, {
    workspaceId, operationId: command.operationId, userId, fingerprint, fail, codes: CODES,
  });
  if (peek) {
    const entrySnap = await entryDoc(db, workspaceId, entryId).get();
    return { entry: entrySnap.exists ? { ...entrySnap.data(), ledgerEntryId: entryId } : null, operationId: command.operationId, idempotent: true };
  }

  const opRef = operationDoc(db, workspaceId, command.operationId);
  const recRef = recordDoc(db, workspaceId, p.recordId);
  const bkRef = bookDoc(db, workspaceId, p.ledgerBookId);
  const entryRef = entryDoc(db, workspaceId, entryId);

  // Sequence allocation serializes on a single block document. Under heavy
  // concurrent load (many DISTINCT registrations), transactions must retry
  // more than the Admin SDK default allows — mirror the historical
  // maxAttempts: 50 semantics from the old client implementation.
  const TX_OPTIONS = { maxAttempts: 50 };
  const result = await db.runTransaction(async (transaction) => {
    // ── READ PHASE — Firestore transactions require all reads before writes
    const opSnap = await transaction.get(opRef);
    const existingEntrySnap = await transaction.get(entryRef);
    const recSnap = await transaction.get(recRef);
    const rec = recSnap.exists ? recSnap.data() : null;

    // Defense-in-depth link read must also happen in the read phase.
    const linkedSnap = (rec?.ledgerEntryId && rec.ledgerBookId === p.ledgerBookId)
      ? await transaction.get(entryDoc(db, workspaceId, rec.ledgerEntryId))
      : null;

    const bookSnap = await transaction.get(bkRef);
    const book = bookSnap.exists ? bookSnap.data() : null;
    const blkRef = book ? blockDoc(db, workspaceId, p.ledgerBookId, book.currentBlockId) : null;
    const blockSnap = blkRef ? await transaction.get(blkRef) : null;

    // ── JOURNAL VALIDATION (no writes yet)
    if (opSnap.exists) {
      const op = opSnap.data();
      if (op.userId !== userId || op.workspaceId !== workspaceId) fail(CODES.OPERATION_CONFLICT, 'Operation identity mismatch.');
      if (op.fingerprint !== fingerprint) fail(CODES.OPERATION_MISMATCH, 'Operation command mismatch.');
      if (op.status === OPERATION_STATUS.COMPLETED) return { replay: true };
      if (op.status === OPERATION_STATUS.FAILED) fail(CODES.OPERATION_CONFLICT, 'Operation exists with terminal or failed status.');
    }

    // ── DOMAIN VALIDATION
    if (!recSnap.exists) fail(CODES.RECORD_NOT_FOUND, 'Record not found.');
    if (rec.workspaceId !== workspaceId) fail(CODES.WORKSPACE_FORBIDDEN, 'Record workspace mismatch.');
    if (!REGISTRABLE_STATUSES.includes(rec.status)) {
      fail(CODES.RECORD_NOT_ELIGIBLE, `Record status "${rec.status}" is not eligible for Ledger registration. Must be: ${REGISTRABLE_STATUSES.join(', ')}`);
    }
    if (!bookSnap.exists) fail(CODES.BOOK_NOT_FOUND, 'Ledger book not found.');
    if (book.status !== 'ACTIVE') fail(CODES.BOOK_NOT_ACTIVE, 'Ledger book is not active.');
    if (book.moduleId && rec.moduleId !== book.moduleId) fail(CODES.RECORD_NOT_ELIGIBLE, 'Record moduleId does not match Ledger Book scope.');
    if (book.recordType && rec.recordType !== book.recordType) fail(CODES.RECORD_NOT_ELIGIBLE, 'Record recordType does not match Ledger Book scope.');
    if (!blockSnap || !blockSnap.exists) fail(CODES.BOOK_NOT_FOUND, 'Current ledger block not found.');
    const block = blockSnap.data();

    // ── JOURNAL GATING (writes begin here — all reads complete)
    if (opSnap.exists) {
      const op = opSnap.data();
      const leaseExpired = !op.leaseExpiresAt || op.leaseExpiresAt.toMillis() <= Timestamp.now().toMillis();
      if (!leaseExpired) return { inProgress: true };
      const attemptCount = (op.attemptCount || 1) + 1;
      if (attemptCount > MAX_RECOVERY_ATTEMPTS) fail(CODES.OPERATION_FAILED, 'Operation recovery limit exceeded.');
      transaction.update(opRef, {
        status: OPERATION_STATUS.PROCESSING,
        attemptCount,
        leaseExpiresAt: Timestamp.fromMillis(Timestamp.now().toMillis() + OPERATION_LEASE_MS),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      transaction.set(opRef, buildOperationDocument({ command, userId, fingerprint, status: OPERATION_STATUS.PROCESSING, recordId: p.recordId }));
    }

    const completeJournal = () => transaction.update(opRef, {
      status: OPERATION_STATUS.COMPLETED,
      recordId: p.recordId,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Idempotency by deterministic entry id — checked INSIDE the transaction
    if (existingEntrySnap.exists) {
      const existing = existingEntrySnap.data();
      completeJournal();
      return { entry: { ...existing, ledgerEntryId: entryId }, idempotentEntry: true };
    }

    // Record already registered in this book (defense-in-depth)
    if (linkedSnap?.exists) {
      const linked = linkedSnap.data();
      completeJournal();
      return { entry: { ...linked, ledgerEntryId: linkedSnap.id }, idempotentEntry: true };
    }

    // ── SEQUENCE ALLOCATION + block rollover
    let currentBlockId = book.currentBlockId;
    let currentBlock = block;

    if (block.nextSequence > block.endSequence) {
      transaction.update(blkRef, { status: 'FULL', _closedAt: FieldValue.serverTimestamp() });
      const newBlockNumber = block.blockNumber + 1;
      const newStartSequence = block.endSequence + 1;
      const newEndSequence = newStartSequence + book.blockSize - 1;
      const newBlockId = `block_${newBlockNumber}`;
      transaction.set(blockDoc(db, workspaceId, p.ledgerBookId, newBlockId), {
        ledgerBlockId: newBlockId,
        ledgerBookId: p.ledgerBookId,
        workspaceId,
        blockNumber: newBlockNumber,
        startSequence: newStartSequence,
        endSequence: newEndSequence,
        nextSequence: newStartSequence,
        capacity: book.blockSize,
        status: 'OPEN',
        closedAt: null,
        createdBy: { actorType: 'USER', actorId: userId },
        _createdAt: FieldValue.serverTimestamp(),
        _openedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(bkRef, { currentBlockId: newBlockId, _updatedAt: FieldValue.serverTimestamp() });
      currentBlockId = newBlockId;
      currentBlock = { blockNumber: newBlockNumber, startSequence: newStartSequence, endSequence: newEndSequence, nextSequence: newStartSequence };
    }

    const sequenceNumber = currentBlock.nextSequence;
    const referenceNumber = formatReferenceNumber(
      book.referencePrefix || book.ledgerCode,
      sequenceNumber,
      book.referenceFormatVersion || 1,
    );

    transaction.update(blockDoc(db, workspaceId, p.ledgerBookId, currentBlockId), { nextSequence: sequenceNumber + 1 });

    const entryData = {
      ledgerEntryId: entryId,
      workspaceId,
      ledgerBookId: p.ledgerBookId,
      ledgerBlockId: currentBlockId,
      recordId: p.recordId,
      moduleId: rec.moduleId || null,
      moduleVersion: rec.moduleVersion || null,
      recordType: rec.recordType || null,
      sequenceNumber,
      referenceNumber,
      referenceFormatVersion: book.referenceFormatVersion || 1,
      entryStatus: 'ACTIVE',
      registeredBy: { actorType: 'USER', actorId: userId },
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      supersededByRecordId: null,
      _registeredAt: FieldValue.serverTimestamp(),
    };
    transaction.set(entryRef, entryData);

    // Server-owned Record linkage — only the FIRST registration writes it
    if (!rec.ledgerEntryId) {
      transaction.update(recRef, {
        ledgerEntryId: entryId,
        ledgerBookId: p.ledgerBookId,
        referenceNumber,
        _updatedAt: FieldValue.serverTimestamp(),
      });
    }

    completeJournal();

    // Authoritative audit evidence in the SAME transaction as the entry.
    // Subject = the Record ("what happened to this canonical object"), with
    // the Ledger entry referenced in metadata — Record History reads it.
    writeAuditInTransaction(transaction, db, workspaceId, {
      operationId: command.operationId,
      action: AUDIT_ACTIONS.LEDGER_ENTRY_REGISTERED,
      resourceType: AUDIT_RESOURCE_TYPES.RECORD,
      resourceId: p.recordId,
      userId,
      timestamp: now,
      metadata: { ledgerBookId: p.ledgerBookId, ledgerEntryId: entryId, sequenceNumber, referenceNumber },
    });

    return { entry: { ...entryData, _idempotent: false }, idempotentEntry: false };
  }, TX_OPTIONS);

  if (result.replay) {
    const entrySnap = await entryDoc(db, workspaceId, entryId).get();
    return { entry: entrySnap.exists ? { ...entrySnap.data(), ledgerEntryId: entryId } : null, operationId: command.operationId, idempotent: true };
  }
  if (result.inProgress) {
    fail(CODES.OPERATION_IN_PROGRESS, 'The same operation is already being processed.');
  }

  return { entry: result.entry, operationId: command.operationId, idempotent: false };
}
