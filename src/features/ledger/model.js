/**
 * Ledger Form-Book presentation model (pure).
 *
 * A Form Book row answers: which Module does this register belong to, which
 * block is current, how many sequence slots are consumed (filled), how many
 * of those are voided, and how many remain. Voided slots are consumed
 * forever — they're part of `used`, and they never become "remaining" again.
 */

export const FORM_BOOK_DEFAULT_BLOCK_SIZE = 100;

/**
 * @param {Object|null} block — current/active block
 * @param {Array} entries — entries inside THAT block (bounded)
 * @param {Object} book
 */
export function deriveFormBookCounters(book, block, entries = []) {
  if (!block) {
    return {
      blockNumber: null, capacity: book?.blockSize ?? FORM_BOOK_DEFAULT_BLOCK_SIZE,
      used: 0, filled: 0, voided: 0, remaining: 0, status: book?.status ?? null,
      currentBlockId: null,
    };
  }
  const capacity = block.capacity ?? book?.blockSize ?? FORM_BOOK_DEFAULT_BLOCK_SIZE;
  const consumedInBlock = Math.max(0, (block.nextSequence ?? block.startSequence ?? 1) - (block.startSequence ?? 1));
  const voided = entries.filter((entry) => entry.entryStatus && entry.entryStatus !== 'ACTIVE').length;
  const filled = Math.max(0, consumedInBlock - voided);
  const remaining = Math.max(0, (block.endSequence ?? 0) - (block.nextSequence ?? 1) + 1);
  return {
    blockNumber: block.blockNumber ?? null,
    capacity,
    used: consumedInBlock,
    filled,
    voided,
    remaining,
    status: block.status ?? book?.status ?? null,
    currentBlockId: block.ledgerBlockId ?? null,
    rangeStart: block.startSequence ?? null,
    rangeEnd: block.endSequence ?? null,
  };
}

/**
 * Chooses the block that should drive the Form Book row: the ACTIVE/open
 * block if present, otherwise the most recent block.
 */
export function selectCurrentBlock(blocks = []) {
  if (!blocks.length) return null;
  const open = blocks.find((block) => block.status === 'OPEN');
  return open || blocks[blocks.length - 1];
}

/** Stable ordering for the Historical Form Viewer navigation. */
export function sortEntriesForViewer(entries = []) {
  return [...entries].sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0));
}

/** Position label like "43 / 100" inside the viewed block. */
export function viewerPositionLabel(entry, entries = []) {
  const ordered = sortEntriesForViewer(entries);
  const index = ordered.findIndex((item) => item.ledgerEntryId === entry?.ledgerEntryId);
  if (index < 0) return null;
  return `${index + 1} / ${ordered.length}`;
}
