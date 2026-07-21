import { describe, expect, it, vi } from 'vitest';

import { parseMoodleReauthSettingsPayload } from '../../../../supabase/functions/moodle-reauth-settings/payload.ts';
import type {
  MoodleReauthCredentialState,
  MoodleReauthSettingsRepository,
  MoodleReauthSettingsState,
} from '../../../../supabase/functions/moodle-reauth-settings/repository.ts';
import {
  getMoodleReauthSettings,
  updateMoodleReauthSettings,
} from '../../../../supabase/functions/moodle-reauth-settings/service.ts';

const credential: MoodleReauthCredentialState = {
  credentialCiphertext: 'encrypted',
  lastError: null,
  lastReauthAt: '2026-07-21T13:00:00.000Z',
  lastTokenIssuedAt: '2026-07-21T13:00:00.000Z',
  moodleService: 'moodle_mobile_app',
  moodleUrl: 'https://moodle.example.test',
  moodleUsername: 'teacher',
  reauthEnabled: true,
};

function repository(state: MoodleReauthSettingsState): MoodleReauthSettingsRepository {
  return {
    disableCredential: vi.fn(async () => undefined),
    enableCredential: vi.fn(async () => undefined),
    getSettings: vi.fn(async () => state),
    setPreference: vi.fn(async () => undefined),
  };
}

describe('moodle-reauth-settings contract', () => {
  it('accepts explicit actions and the legacy update payload', () => {
    expect(parseMoodleReauthSettingsPayload({ action: 'get_settings' }))
      .toEqual({ action: 'get_settings' });
    expect(parseMoodleReauthSettingsPayload({ action: 'update_settings', enabled: true }))
      .toEqual({ action: 'update_settings', enabled: true });
    expect(parseMoodleReauthSettingsPayload({ enabled: false }))
      .toEqual({ action: 'update_settings', enabled: false });
  });

  it('maps persistence state to an explicit read DTO', async () => {
    const result = await getMoodleReauthSettings(repository({
      credential,
      preferenceEnabled: true,
    }), 'authenticated-user');

    expect(result).toEqual({
      credentialActive: true,
      lastError: null,
      lastReauthAt: '2026-07-21T13:00:00.000Z',
      preferenceEnabled: true,
    });
  });

  it('disables an existing credential for the authenticated actor', async () => {
    const repo = repository({ credential, preferenceEnabled: false });
    const result = await updateMoodleReauthSettings(repo, 'authenticated-user', false);

    expect(repo.setPreference).toHaveBeenCalledWith('authenticated-user', false);
    expect(repo.disableCredential).toHaveBeenCalledWith('authenticated-user');
    expect(result).toMatchObject({ credentialActive: false, preferenceEnabled: false, requiresLogin: false });
  });

  it('requires a new login when enabling without a stored credential', async () => {
    const repo = repository({ credential: null, preferenceEnabled: true });
    const result = await updateMoodleReauthSettings(repo, 'authenticated-user', true);

    expect(repo.enableCredential).not.toHaveBeenCalled();
    expect(result).toMatchObject({ credentialActive: false, preferenceEnabled: true, requiresLogin: true });
  });

  it('enables a stored credential for the authenticated actor', async () => {
    const repo = repository({ credential, preferenceEnabled: true });
    const result = await updateMoodleReauthSettings(repo, 'authenticated-user', true);

    expect(repo.enableCredential).toHaveBeenCalledWith('authenticated-user', credential);
    expect(result).toMatchObject({ credentialActive: true, preferenceEnabled: true, requiresLogin: false });
  });
});
