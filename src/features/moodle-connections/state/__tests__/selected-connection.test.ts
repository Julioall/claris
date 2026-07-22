import { beforeEach, describe, expect, it } from 'vitest';

import {
  loadSelectedMoodleConnectionId,
  reconcileSelectedMoodleConnectionId,
  saveSelectedMoodleConnectionId,
} from '../selected-connection';

describe('selected Moodle connection UI context', () => {
  beforeEach(() => sessionStorage.clear());

  it('namespaces selection by the authenticated Claris account', () => {
    saveSelectedMoodleConnectionId('user-a', 'connection-fieg');
    saveSelectedMoodleConnectionId('user-b', 'connection-senai');

    expect(loadSelectedMoodleConnectionId('user-a')).toBe('connection-fieg');
    expect(loadSelectedMoodleConnectionId('user-b')).toBe('connection-senai');
  });

  it('does not choose an implicit default and clears unavailable selections', () => {
    expect(reconcileSelectedMoodleConnectionId('user-a', ['connection-fieg'])).toBeNull();

    saveSelectedMoodleConnectionId('user-a', 'connection-fieg');
    expect(reconcileSelectedMoodleConnectionId('user-a', ['connection-senai'])).toBeNull();
    expect(loadSelectedMoodleConnectionId('user-a')).toBeNull();
  });
});
