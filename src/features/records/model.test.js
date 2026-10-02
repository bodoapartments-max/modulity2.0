import { describe, expect, it } from 'vitest';
import { getRecordBackNavigation } from './model.js';

describe('Record navigation context', () => {
  it('returns to the originating generic Module Record List', () => {
    expect(getRecordBackNavigation('reservation', { moduleId: 'reservation', name: 'Reservation' })).toEqual({ to: '/app/modules/reservation/records', label: 'Back to Reservation Records' });
  });

  it('returns to global Records when Module context is absent or mismatched', () => {
    expect(getRecordBackNavigation(null, { moduleId: 'reservation', name: 'Reservation' })).toEqual({ to: '/app/records', label: 'Back to Records' });
    expect(getRecordBackNavigation('other', { moduleId: 'reservation', name: 'Reservation' })).toEqual({ to: '/app/records', label: 'Back to Records' });
  });
});
