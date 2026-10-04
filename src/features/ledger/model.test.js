import { describe, it, expect } from 'vitest';
import {
  deriveFormBookCounters,
  selectCurrentBlock,
  sortEntriesForViewer,
  viewerPositionLabel,
  FORM_BOOK_DEFAULT_BLOCK_SIZE,
} from './model.js';

const book = { ledgerBookId: 'lb-1', blockSize: 100, status: 'ACTIVE' };

describe('deriveFormBookCounters', () => {
  it('derives consumed/filled/voided/remaining from block + entries, never resuscitating voided slots', () => {
    const block = { blockNumber: 1, ledgerBlockId: 'block_1', startSequence: 1, endSequence: 100, nextSequence: 46, capacity: 100 };
    const entries = [
      { ledgerEntryId: 'le-1', entryStatus: 'ACTIVE' },
      { ledgerEntryId: 'le-2', entryStatus: 'CANCELLED' },
      { ledgerEntryId: 'le-3', entryStatus: 'VOIDED' },
    ];
    const counters = deriveFormBookCounters(book, block, entries);
    // 45 slots consumed (1..45), 2 voided stays consumed, 43 filled
    expect(counters.used).toBe(45);
    expect(counters.voided).toBe(2);
    expect(counters.filled).toBe(43);
    expect(counters.remaining).toBe(55);
    expect(counters.filled + counters.voided + counters.remaining).toBe(100);
  });

  it('empty current block gives a zero-state with the default capacity', () => {
    const counters = deriveFormBookCounters(book, null, []);
    expect(counters.capacity).toBe(FORM_BOOK_DEFAULT_BLOCK_SIZE);
    expect(counters.used).toBe(0);
    expect(counters.remaining).toBe(0);
  });

  it('full block has zero remaining', () => {
    const block = { blockNumber: 2, ledgerBlockId: 'block_2', startSequence: 101, endSequence: 200, nextSequence: 201, status: 'FULL' };
    const counters = deriveFormBookCounters(book, block, []);
    expect(counters.remaining).toBe(0);
    expect(counters.used).toBe(100);
  });
});

describe('selectCurrentBlock', () => {
  it('prefers the OPEN block over full historical blocks', () => {
    const blocks = [
      { ledgerBlockId: 'block_1', status: 'FULL' },
      { ledgerBlockId: 'block_2', status: 'OPEN' },
    ];
    expect(selectCurrentBlock(blocks).ledgerBlockId).toBe('block_2');
  });

  it('falls back to the latest block when none is open (all closed)', () => {
    const blocks = [{ ledgerBlockId: 'block_1', status: 'FULL' }, { ledgerBlockId: 'block_2', status: 'FULL' }];
    expect(selectCurrentBlock(blocks).ledgerBlockId).toBe('block_2');
    expect(selectCurrentBlock([])).toBeNull();
  });
});

describe('viewer navigation model', () => {
  it('sorts entries by sequence and labels positions', () => {
    const entries = [
      { ledgerEntryId: 'le-3', sequenceNumber: 5 },
      { ledgerEntryId: 'le-1', sequenceNumber: 1 },
      { ledgerEntryId: 'le-2', sequenceNumber: 3 },
    ];
    const sorted = sortEntriesForViewer(entries);
    expect(sorted.map((e) => e.sequenceNumber)).toEqual([1, 3, 5]);
    expect(viewerPositionLabel(entries[1], entries)).toBe('1 / 3');
    expect(viewerPositionLabel(entries[2], entries)).toBe('2 / 3');
    expect(viewerPositionLabel(entries[0], entries)).toBe('3 / 3');
    expect(viewerPositionLabel({ ledgerEntryId: 'missing' }, entries)).toBeNull();
  });
});
