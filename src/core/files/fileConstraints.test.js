import { describe, it, expect } from 'vitest';
import {
  sanitizeFileName,
  isSafeFileName,
  extractFileExtension,
  validateMimeType,
  validateFileSize,
  validateChecksum,
  deriveFileId,
  deriveAttachmentId,
  buildFileStoragePath,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_NAME_LENGTH,
} from './fileConstraints.js';

describe('sanitizeFileName', () => {
  it('neutralizes path traversal and separators', () => {
    expect(sanitizeFileName('../etc/passwd')).not.toContain('/');
    expect(sanitizeFileName('..\\..\\windows\\system32')).not.toContain('\\');
    expect(sanitizeFileName('a/b/c.pdf').includes('/')).toBe(false);
  });

  it('strips leading dots that could hide names or form dot-segments', () => {
    expect(sanitizeFileName('.hidden')).toBe('hidden');
    expect(sanitizeFileName('...x')).toBe('x');
  });

  it('replaces control characters and reserved characters', () => {
    expect(sanitizeFileName('na\x1fme.doc')).toBe('na_me.doc');
    expect(sanitizeFileName('a<b>c:d|e.doc')).toBe('a_b_c_d_e.doc');
  });

  it('collapses whitespace and preserves usable names', () => {
    expect(sanitizeFileName('My Doc (final).PDF')).toBe('My Doc (final).PDF');
    expect(sanitizeFileName('normal-name_v2.pdf')).toBe('normal-name_v2.pdf');
  });

  it('returns null for unusable names', () => {
    expect(sanitizeFileName('')).toBe(null);
    expect(sanitizeFileName('.')).toBe(null);
    expect(sanitizeFileName('..')).toBe(null);
    expect(sanitizeFileName('   ')).toBe(null);
    expect(sanitizeFileName(null)).toBe(null);
    expect(sanitizeFileName(42)).toBe(null);
  });

  it('enforces the canonical length bound', () => {
    const long = `${'a'.repeat(MAX_FILE_NAME_LENGTH + 50)}.pdf`;
    expect(sanitizeFileName(long).length).toBeLessThanOrEqual(MAX_FILE_NAME_LENGTH);
  });
});

describe('isSafeFileName / extractFileExtension', () => {
  it('detects already-safe names', () => {
    expect(isSafeFileName('report.pdf')).toBe(true);
    expect(isSafeFileName('../report.pdf')).toBe(false);
  });
  it('extracts lowercase extension or null', () => {
    expect(extractFileExtension('Doc.PDF')).toBe('pdf');
    expect(extractFileExtension('archive.tar.gz')).toBe('gz');
    expect(extractFileExtension('noext')).toBe(null);
    expect(extractFileExtension('.hidden')).toBe(null);
  });
});

describe('validateMimeType / validateFileSize / validateChecksum', () => {
  it('accepts standard mime types, rejects malformed', () => {
    expect(validateMimeType('application/pdf').valid).toBe(true);
    expect(validateMimeType('image/png').valid).toBe(true);
    expect(validateMimeType('text/csv').valid).toBe(true);
    expect(validateMimeType('').valid).toBe(false);
    expect(validateMimeType('pdf').valid).toBe(false);
    expect(validateMimeType('a b/c').valid).toBe(false);
  });
  it('bounds size', () => {
    expect(validateFileSize(0).valid).toBe(true);
    expect(validateFileSize(MAX_FILE_SIZE_BYTES).valid).toBe(true);
    expect(validateFileSize(MAX_FILE_SIZE_BYTES + 1).valid).toBe(false);
    expect(validateFileSize(-1).valid).toBe(false);
    expect(validateFileSize('10').valid).toBe(false);
  });
  it('validates SHA-256 hex shape; checksum optional', () => {
    expect(validateChecksum('a'.repeat(64)).valid).toBe(true);
    expect(validateChecksum(null).valid).toBe(true);
    expect(validateChecksum(undefined).valid).toBe(true);
    expect(validateChecksum('A'.repeat(64)).valid).toBe(false);
    expect(validateChecksum('abc').valid).toBe(false);
  });
});

describe('canonical identity + storage path derivation', () => {
  it('derives deterministic ids from operationId', () => {
    expect(deriveFileId('op-1')).toBe('f_op-1');
    expect(deriveAttachmentId('op-2')).toBe('att_op-2');
  });
  it('builds the canonical workspace-scoped path', () => {
    expect(buildFileStoragePath({ workspaceId: 'w1', fileId: 'f_abc', version: 2, name: 'a b.pdf' }))
      .toBe('workspaces/w1/files/f_abc/v2/a b.pdf');
  });
  it('rejects unusable path segments', () => {
    expect(() => buildFileStoragePath({ workspaceId: 'w1', fileId: 'f_1', version: 1, name: '..' })).toThrow();
    expect(() => buildFileStoragePath({ workspaceId: '', fileId: 'f_1', version: 1, name: 'x' })).toThrow();
  });
});
