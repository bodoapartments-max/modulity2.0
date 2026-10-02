import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(readFileSync(resolve('firestore.indexes.json'), 'utf8'));
const recordIndexes = config.indexes.filter((item) => item.collectionGroup === 'records');
const hasIndex = (field, direction) => recordIndexes.some((item) => item.fields[0]?.fieldPath === field && item.fields[1]?.fieldPath === '_createdAt' && item.fields[1]?.order === direction);

describe('canonical Record query indexes', () => {
  it.each(['status', 'moduleId', 'recordType', 'priority', 'createdBy.actorId'])('supports bounded %s filters with deterministic created ordering', (field) => {
    expect(hasIndex(field, 'DESCENDING')).toBe(true);
    expect(hasIndex(field, 'ASCENDING')).toBe(true);
  });
});
