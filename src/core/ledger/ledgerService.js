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
 * @param {Object} deps.ledgerBookRepo
 * @param {Object} deps.ledgerEntryRepo — must have registerRecordAtomic()
 * @param {Object} deps.ledgerCodeRepo — for atomic code reservation
 * @param {Object} deps.recordRepo — to verify Record exists and is eligible
 * @param {Object} [deps.auditService] — optional, for durable audit trail
 */
export function createLedgerService({
  ledgerBookRepo,
  ledgerEntryRepo,
  ledgerCodeRepo,
  recordRepo,
  auditService = null,
}) {
  /**
   * Creates a new Ledger Book with atomic code reservation.
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

    // Atomic code reservation (prevents race conditions)
    const reserved = await ledgerCodeRepo.reserve(workspaceId, ledgerCode, actor);
    if (!reserved) {
      throw new AppError('conflict', `Ledger code "${ledgerCode}" is already in use`);
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

    const created = await ledgerBookRepo.create(book);

    // Open the initial block via the repository
    const initialBlockId = await ledgerBookRepo.openInitialBlock(workspaceId, ledgerBookId, blockSize, actor);
    // Update book with current block ID
    await ledgerBookRepo.update(workspaceId, ledgerBookId, { currentBlockId: initialBlockId });

    const correlationId = `corr:${generateId()}`;
    eventBus.emit(createEvent({
      eventType: 'ledger.book_created',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { ledgerBookId, ledgerCode, name },
      correlationId,
    }));

    if (auditService) {
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
    }

    return { ...created, currentBlockId: initialBlockId };
  }

  /**
   * Registers a Record in a Ledger Book.
   * Atomic: sequence allocation + entry creation in one Firestore transaction.
   * Idempotent: same bookId + recordId returns existing entry.
   */
  async function registerRecord({
    workspaceId,
    ledgerBookId,
    recordId,
    actor,
    correlationId = null,
  }) {
    // Load the book
    const book = await ledgerBookRepo.getById(workspaceId, ledgerBookId);
    if (!book) {
      throw new AppError('not_found', 'Ledger book not found');
    }
    if (book.status !== LEDGER_BOOK_STATUSES.ACTIVE) {
      throw new AppError('forbidden', 'Ledger book is not active');
    }

    // Verify Record exists and is eligible
    const record = await recordRepo.getById(workspaceId, recordId);
    if (!record) {
      throw new AppError('not_found', 'Record not found');
    }
    if (!REGISTRABLE_STATUSES.includes(record.status)) {
      throw new AppError('forbidden', `Record status "${record.status}" is not eligible for Ledger registration. Must be: ${REGISTRABLE_STATUSES.join(', ')}`);
    }

    // Check Module/RecordType scope if the book is scoped
    if (book.moduleId && record.moduleId !== book.moduleId) {
      throw new AppError('validation_error', `Record moduleId does not match Ledger Book scope`);
    }
    if (book.recordType && record.recordType !== book.recordType) {
      throw new AppError('validation_error', `Record recordType does not match Ledger Book scope`);
    }

    // Idempotency: check if already registered
    const existing = await ledgerEntryRepo.getByBookAndRecord(workspaceId, ledgerBookId, recordId);
    if (existing) {
      return existing; // Idempotent return
    }

    // Atomic registration: allocate sequence + create entry
    // The repository handles block fullness detection and rollover
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

    if (auditService) {
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
    }

    return entry;
  }

  /**
   * Cancels a Ledger Entry. The number is NOT reused.
   */
  async function cancelEntry(workspaceId, ledgerEntryId, reason, actor) {
    const entry = await ledgerEntryRepo.getById(workspaceId, ledgerEntryId);
    if (!entry) {
      throw new AppError('not_found', 'Ledger entry not found');
    }
    if (entry.entryStatus !== LEDGER_ENTRY_STATUSES.ACTIVE) {
      throw new AppError('forbidden', `Cannot cancel entry with status: ${entry.entryStatus}`);
    }

    const now = new Date().toISOString();
    const updated = await ledgerEntryRepo.update(workspaceId, ledgerEntryId, {
      entryStatus: LEDGER_ENTRY_STATUSES.CANCELLED,
      cancelledAt: now,
      cancelledBy: { actorType: actor.actorType, actorId: actor.actorId },
      cancellationReason: reason || null,
    });

    if (auditService) {
      await auditService.record({
        workspaceId,
        actor,
        action: AUDIT_ACTIONS.LEDGER_ENTRY_CANCELLED,
        resourceType: AUDIT_RESOURCE_TYPES.LEDGER_ENTRY,
        resourceId: ledgerEntryId,
        metadata: { reason, sequenceNumber: entry.sequenceNumber, referenceNumber: entry.referenceNumber },
        source: AUDIT_SOURCES.WEB,
      });
    }

    return updated;
  }

  /**
   * Voids a Ledger Entry. The number is NOT reused.
   */
  async function voidEntry(workspaceId, ledgerEntryId, reason, actor) {
    const entry = await ledgerEntryRepo.getById(workspaceId, ledgerEntryId);
    if (!entry) {
      throw new AppError('not_found', 'Ledger entry not found');
    }
    if (entry.entryStatus !== LEDGER_ENTRY_STATUSES.ACTIVE) {
      throw new AppError('forbidden', `Cannot void entry with status: ${entry.entryStatus}`);
    }

    const now = new Date().toISOString();
    const updated = await ledgerEntryRepo.update(workspaceId, ledgerEntryId, {
      entryStatus: LEDGER_ENTRY_STATUSES.VOIDED,
      voidedAt: now,
      voidedBy: { actorType: actor.actorType, actorId: actor.actorId },
      voidReason: reason || null,
    });

    if (auditService) {
      await auditService.record({
        workspaceId,
        actor,
        action: AUDIT_ACTIONS.LEDGER_ENTRY_VOIDED,
        resourceType: AUDIT_RESOURCE_TYPES.LEDGER_ENTRY,
        resourceId: ledgerEntryId,
        metadata: { reason, sequenceNumber: entry.sequenceNumber, referenceNumber: entry.referenceNumber },
        source: AUDIT_SOURCES.WEB,
      });
    }

    return updated;
  }

  /**
   * Closes a Ledger Book. No more entries can be registered.
   */
  async function closeBook(workspaceId, ledgerBookId, actor) {
    const book = await ledgerBookRepo.getById(workspaceId, ledgerBookId);
    if (!book) {
      throw new AppError('not_found', 'Ledger book not found');
    }
    if (book.status !== LEDGER_BOOK_STATUSES.ACTIVE) {
      throw new AppError('forbidden', 'Ledger book is not active');
    }

    const now = new Date().toISOString();
    const updated = await ledgerBookRepo.update(workspaceId, ledgerBookId, {
      status: LEDGER_BOOK_STATUSES.CLOSED,
      closedAt: now,
      closedBy: { actorType: actor.actorType, actorId: actor.actorId },
    });

    if (auditService) {
      await auditService.record({
        workspaceId,
        actor,
        action: AUDIT_ACTIONS.LEDGER_BOOK_CLOSED,
        resourceType: AUDIT_RESOURCE_TYPES.LEDGER_BOOK,
        resourceId: ledgerBookId,
        metadata: { ledgerCode: book.ledgerCode },
        source: AUDIT_SOURCES.WEB,
      });
    }

    return updated;
  }

  /**
   * Gets a single Ledger Book.
   */
  async function getBook(workspaceId, ledgerBookId) {
    return ledgerBookRepo.getById(workspaceId, ledgerBookId);
  }

  /**
   * Lists Ledger Books for a workspace.
   */
  async function listBooks(workspaceId) {
    return ledgerBookRepo.listByWorkspace(workspaceId);
  }

  /**
   * Gets a single Ledger Entry.
   */
  async function getEntry(workspaceId, ledgerEntryId) {
    return ledgerEntryRepo.getById(workspaceId, ledgerEntryId);
  }

  /**
   * Gets the Ledger Entry for a specific Record in a specific Book.
   */
  async function getEntryByRecord(workspaceId, ledgerBookId, recordId) {
    return ledgerEntryRepo.getByBookAndRecord(workspaceId, ledgerBookId, recordId);
  }

  /**
   * Finds all Ledger Entries for a specific Record across all Books.
   */
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
    getEntry,
    getEntryByRecord,
    getEntriesForRecord,
  };
}
