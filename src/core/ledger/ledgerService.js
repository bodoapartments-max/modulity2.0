/**
 * Modulity 2.0 — Ledger Registration Service
 *
 * Focused service for Ledger Book management and Record registration.
 * Uses Firestore transactions for atomic sequence allocation.
 *
 * INVARIANTS:
 *   - Concurrent registration can never create duplicate sequence numbers.
 *   - One Record may appear at most once in the same Ledger Book.
 *   - A Ledger number, once allocated, is never reused.
 *   - Registration is idempotent (same bookId + recordId = same entry).
 *   - Idempotency check is INSIDE the Firestore transaction.
 *   - Record linkage update is INSIDE the same transaction.
 *   - LedgerBook bootstrap (code + book + block) is atomic.
 *
 * AUDIT OWNERSHIP:
 *   - LedgerService owns durable audit writes for ledger operations.
 *   - AuditBridge does NOT map ledger Event Bus events (no duplication).
 *   - Event Bus events are emitted for runtime reactions only.
 *
 * @module core/ledger/ledgerService
 */

import { createLedgerBook, validateLedgerCode, LEDGER_BOOK_STATUSES } from './ledgerBook.js';
import { LEDGER_ENTRY_STATUSES } from './ledgerEntry.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES, AUDIT_SOURCES } from '../audit/auditActions.js';
import { generateId } from '../utils/generateId.js';
import { eventBus, createEvent } from '../events/eventBus.js';
import { AppError } from '../errors/appError.js';

/** Record statuses eligible for Ledger registration. */
const REGISTRABLE_STATUSES = ['SUBMITTED', 'ACTIVE', 'COMPLETED'];

/**
 * @param {Object} deps
 * @param {Object} deps.ledgerBookRepo — must have bootstrapBookAtomic()
 * @param {Object} deps.ledgerEntryRepo — must have registerRecordAtomic()
 * @param {Object} deps.recordRepo — to verify Record exists and is eligible
 * @param {Object} [deps.auditService] — optional, for durable audit trail
 */
export function createLedgerService({
  ledgerBookRepo,
  ledgerEntryRepo,
  recordRepo,
  auditService = null,
}) {
  /**
   * Creates a new Ledger Book with atomic code reservation + book + initial block.
   * No orphan code reservations on failure.
   * Idempotent on retry with same bookId.
   */
  async function createBook({
    workspaceId,
    ledgerCode,
    name,
    description = '',
    moduleId = null,
    recordType = null,
    blockSize = 100,
    referencePrefix = '',
    actor,
  }) {
    // Validate code format
    const codeValidation = validateLedgerCode(ledgerCode);
    if (!codeValidation.valid) {
      throw new AppError('validation_error', codeValidation.errors.join(', '));
    }

    const ledgerBookId = generateId();
    const book = createLedgerBook({
      ledgerBookId,
      workspaceId,
      ledgerCode,
      name,
      description,
      moduleId,
      recordType,
      blockSize,
      referencePrefix: referencePrefix || ledgerCode,
      createdBy: actor,
    });

    // ATOMIC: code reservation + book + initial block in one transaction
    const created = await ledgerBookRepo.bootstrapBookAtomic(book, actor);

    const correlationId = `corr:${generateId()}`;
    eventBus.emit(createEvent({
      eventType: 'ledger.book_created',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { ledgerBookId, ledgerCode, name },
      correlationId,
    }));

    // Durable audit write (owned by LedgerService, NOT AuditBridge)
    if (auditService) {
      try {
        await auditService.record({
          workspaceId,
          actor,
          action: AUDIT_ACTIONS.LEDGER_BOOK_CREATED,
          resourceType: AUDIT_RESOURCE_TYPES.LEDGER_BOOK,
          resourceId: ledgerBookId,
          metadata: { ledgerCode, name, blockSize },
          correlationId,
          source: AUDIT_SOURCES.WEB,
        });
      } catch {
        // Audit write failure after successful book creation:
        // Book exists and is usable. Audit gap is documented.
      }
    }

    return created;
  }

  /**
   * Registers a Record in a Ledger Book.
   *
   * CRITICAL: The authoritative idempotency check and sequence allocation
   * happen INSIDE a single Firestore transaction in registerRecordAtomic().
   *
   * The outer pre-checks (book status, record eligibility) are optimistic
   * fast-path validations. The transaction re-validates everything.
   *
   * Record linkage (ledgerEntryId, ledgerBookId, referenceNumber) is also
   * updated atomically inside the same transaction.
   *
   * A Record may participate in MULTIPLE LedgerBooks. The singular Record
   * linkage fields point to the FIRST registration (primary reference).
   * Additional registrations create LedgerEntries but don't overwrite the
   * Record's primary linkage.
   */
  async function registerRecord({
    workspaceId,
    ledgerBookId,
    recordId,
    actor,
    correlationId = null,
  }) {
    // Optimistic pre-check (not the correctness boundary)
    const book = await ledgerBookRepo.getById(workspaceId, ledgerBookId);
    if (!book) throw new AppError('not_found', 'Ledger book not found');
    if (book.status !== LEDGER_BOOK_STATUSES.ACTIVE) {
      throw new AppError('forbidden', 'Ledger book is not active');
    }

    const record = await recordRepo.getById(workspaceId, recordId);
    if (!record) throw new AppError('not_found', 'Record not found');
    if (!REGISTRABLE_STATUSES.includes(record.status)) {
      throw new AppError('forbidden', `Record status "${record.status}" is not eligible for Ledger registration. Must be: ${REGISTRABLE_STATUSES.join(', ')}`);
    }

    // ATOMIC: idempotency check + record verification + sequence allocation
    // + entry creation + record linkage update — all in ONE transaction
    const entry = await ledgerEntryRepo.registerRecordAtomic(workspaceId, {
      ledgerBookId,
      recordId,
      moduleId: record.moduleId,
      moduleVersion: record.moduleVersion,
      recordType: record.recordType,
      referencePrefix: book.referencePrefix,
      referenceFormatVersion: book.referenceFormatVersion,
      actor,
    });

    // If idempotent return, skip event/audit emission
    if (entry._idempotent) {
      return entry;
    }

    const corrId = correlationId || `corr:${generateId()}`;

    eventBus.emit(createEvent({
      eventType: 'ledger.entry_registered',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: {
        ledgerEntryId: entry.ledgerEntryId,
        ledgerBookId,
        recordId,
        sequenceNumber: entry.sequenceNumber,
        referenceNumber: entry.referenceNumber,
      },
      correlationId: corrId,
    }));

    // Durable audit write (owned by LedgerService, NOT AuditBridge)
    if (auditService) {
      try {
        await auditService.record({
          workspaceId,
          actor,
          action: AUDIT_ACTIONS.LEDGER_ENTRY_REGISTERED,
          resourceType: AUDIT_RESOURCE_TYPES.LEDGER_ENTRY,
          resourceId: entry.ledgerEntryId,
          metadata: {
            ledgerBookId,
            recordId,
            sequenceNumber: entry.sequenceNumber,
            referenceNumber: entry.referenceNumber,
          },
          correlationId: corrId,
          source: AUDIT_SOURCES.WEB,
        });
      } catch {
        // Audit write failure after successful registration:
        // Entry exists with correct sequence. Audit gap is documented.
      }
    }

    return entry;
  }

  /**
   * Cancels a Ledger Entry. The number is NOT reused.
   * Durable audit is written explicitly (not via AuditBridge).
   */
  async function cancelEntry(workspaceId, ledgerEntryId, reason, actor) {
    const entry = await ledgerEntryRepo.getById(workspaceId, ledgerEntryId);
    if (!entry) throw new AppError('not_found', 'Ledger entry not found');
    if (entry.entryStatus !== LEDGER_ENTRY_STATUSES.ACTIVE) {
      throw new AppError('forbidden', `Cannot cancel entry with status: ${entry.entryStatus}`);
    }

    const updated = await ledgerEntryRepo.update(workspaceId, ledgerEntryId, {
      entryStatus: LEDGER_ENTRY_STATUSES.CANCELLED,
      cancelledBy: { actorType: actor.actorType, actorId: actor.actorId },
      cancellationReason: reason || null,
    });

    if (auditService) {
      try {
        await auditService.record({
          workspaceId,
          actor,
          action: AUDIT_ACTIONS.LEDGER_ENTRY_CANCELLED,
          resourceType: AUDIT_RESOURCE_TYPES.LEDGER_ENTRY,
          resourceId: ledgerEntryId,
          metadata: { reason, sequenceNumber: entry.sequenceNumber, referenceNumber: entry.referenceNumber },
          source: AUDIT_SOURCES.WEB,
        });
      } catch {
        // Audit failure documented
      }
    }

    return updated;
  }

  /**
   * Voids a Ledger Entry. The number is NOT reused.
   */
  async function voidEntry(workspaceId, ledgerEntryId, reason, actor) {
    const entry = await ledgerEntryRepo.getById(workspaceId, ledgerEntryId);
    if (!entry) throw new AppError('not_found', 'Ledger entry not found');
    if (entry.entryStatus !== LEDGER_ENTRY_STATUSES.ACTIVE) {
      throw new AppError('forbidden', `Cannot void entry with status: ${entry.entryStatus}`);
    }

    const updated = await ledgerEntryRepo.update(workspaceId, ledgerEntryId, {
      entryStatus: LEDGER_ENTRY_STATUSES.VOIDED,
      voidedBy: { actorType: actor.actorType, actorId: actor.actorId },
      voidReason: reason || null,
    });

    if (auditService) {
      try {
        await auditService.record({
          workspaceId,
          actor,
          action: AUDIT_ACTIONS.LEDGER_ENTRY_VOIDED,
          resourceType: AUDIT_RESOURCE_TYPES.LEDGER_ENTRY,
          resourceId: ledgerEntryId,
          metadata: { reason, sequenceNumber: entry.sequenceNumber, referenceNumber: entry.referenceNumber },
          source: AUDIT_SOURCES.WEB,
        });
      } catch {
        // Audit failure documented
      }
    }

    return updated;
  }

  /**
   * Closes a Ledger Book. No more entries can be registered.
   */
  async function closeBook(workspaceId, ledgerBookId, actor) {
    const book = await ledgerBookRepo.getById(workspaceId, ledgerBookId);
    if (!book) throw new AppError('not_found', 'Ledger book not found');
    if (book.status !== LEDGER_BOOK_STATUSES.ACTIVE) {
      throw new AppError('forbidden', 'Ledger book is not active');
    }

    const updated = await ledgerBookRepo.update(workspaceId, ledgerBookId, {
      status: LEDGER_BOOK_STATUSES.CLOSED,
      closedBy: { actorType: actor.actorType, actorId: actor.actorId },
    });

    if (auditService) {
      try {
        await auditService.record({
          workspaceId,
          actor,
          action: AUDIT_ACTIONS.LEDGER_BOOK_CLOSED,
          resourceType: AUDIT_RESOURCE_TYPES.LEDGER_BOOK,
          resourceId: ledgerBookId,
          metadata: { ledgerCode: book.ledgerCode },
          source: AUDIT_SOURCES.WEB,
        });
      } catch {
        // Audit failure documented
      }
    }

    return updated;
  }

  async function getBook(workspaceId, ledgerBookId) {
    return ledgerBookRepo.getById(workspaceId, ledgerBookId);
  }

  async function listBooks(workspaceId) {
    return ledgerBookRepo.listByWorkspace(workspaceId);
  }

  async function listBlocks(workspaceId, ledgerBookId) {
    return ledgerBookRepo.listBlocks(workspaceId, ledgerBookId);
  }

  async function getEntry(workspaceId, ledgerEntryId) {
    return ledgerEntryRepo.getById(workspaceId, ledgerEntryId);
  }

  async function getEntryByRecord(workspaceId, ledgerBookId, recordId) {
    return ledgerEntryRepo.getByBookAndRecord(workspaceId, ledgerBookId, recordId);
  }

  async function getEntriesForRecord(workspaceId, recordId) {
    return ledgerEntryRepo.listByRecord(workspaceId, recordId);
  }

  return {
    createBook,
    registerRecord,
    cancelEntry,
    voidEntry,
    closeBook,
    getBook,
    listBooks,
    listBlocks,
    getEntry,
    getEntryByRecord,
    getEntriesForRecord,
  };
}
