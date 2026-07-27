import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearClarisAccountSessionState,
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

  it('removes only the logged-out account session state', () => {
    saveSelectedMoodleConnectionId('user-a', 'connection-fieg');
    saveSelectedMoodleConnectionId('user-b', 'connection-senai');
    sessionStorage.setItem('claris_moodle_chat_cache:user-a%3Aconnection-fieg', 'private-a');
    sessionStorage.setItem('claris_moodle_chat_cache:user-b%3Aconnection-senai', 'private-b');
    sessionStorage.setItem('claris:course-auto-sync:user-a:course-1', '1');
    sessionStorage.setItem('claris:course-auto-sync:user-b:course-1', '2');

    clearClarisAccountSessionState('user-a');

    expect(loadSelectedMoodleConnectionId('user-a')).toBeNull();
    expect(sessionStorage.getItem('claris_moodle_chat_cache:user-a%3Aconnection-fieg')).toBeNull();
    expect(sessionStorage.getItem('claris:course-auto-sync:user-a:course-1')).toBeNull();
    expect(loadSelectedMoodleConnectionId('user-b')).toBe('connection-senai');
    expect(sessionStorage.getItem('claris_moodle_chat_cache:user-b%3Aconnection-senai')).toBe('private-b');
    expect(sessionStorage.getItem('claris:course-auto-sync:user-b:course-1')).toBe('2');
  });
});
