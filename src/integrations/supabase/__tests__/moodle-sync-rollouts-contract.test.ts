import { describe, expect, it, vi } from 'vitest'

import { parseMoodleSyncRolloutsPayload } from '../../../../supabase/functions/moodle-sync-rollouts/payload.ts'
import type { MoodleSyncRolloutsRepository } from '../../../../supabase/functions/moodle-sync-rollouts/repository.ts'
import { executeMoodleSyncRollouts } from '../../../../supabase/functions/moodle-sync-rollouts/service.ts'

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const SITE_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'

function repository(): MoodleSyncRolloutsRepository {
  return {
    isApplicationAdmin: vi.fn().mockResolvedValue(true),
    list: vi.fn().mockResolvedValue([]),
    set: vi.fn().mockResolvedValue({
      capability: 'worker',
      enabled: false,
      moodle_site_id: SITE_ID,
      updated_at: '2026-07-26T12:00:00.000Z',
      updated_by: ACTOR_ID,
      user_id: USER_ID,
    }),
  }
}

describe('Moodle sync rollout control contract', () => {
  it('accepts only the server-side rollout capability and scope fields', () => {
    expect(parseMoodleSyncRolloutsPayload({
      action: 'set_rollout', capability: 'worker', enabled: false,
      moodleSiteId: SITE_ID, userId: USER_ID,
    })).toEqual({
      action: 'set_rollout', capability: 'worker', enabled: false,
      moodleSiteId: SITE_ID, userId: USER_ID,
    })
    expect(() => parseMoodleSyncRolloutsPayload({
      action: 'set_rollout', capability: 'all', enabled: true, moodleSiteId: SITE_ID,
    })).toThrow(/Invalid capability/)
    expect(() => parseMoodleSyncRolloutsPayload({
      action: 'set_rollout', capability: 'worker', enabled: true, moodleSiteId: SITE_ID,
      moodleUrl: 'https://moodle.example',
    })).toThrow(/Invalid request fields/)
  })

  it('allows an administrator to switch off a scoped capability immediately', async () => {
    const repo = repository()
    const result = await executeMoodleSyncRollouts(repo, ACTOR_ID, {
      action: 'set_rollout', capability: 'worker', enabled: false,
      moodleSiteId: SITE_ID, userId: USER_ID,
    })

    expect(repo.set).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'set_rollout',
      capability: 'worker',
      enabled: false,
      moodleSiteId: SITE_ID,
      userId: USER_ID,
    })
    expect(result).toMatchObject({
      contractVersion: 1,
      item: { capability: 'worker', enabled: false, moodleSiteId: SITE_ID, userId: USER_ID },
    })
  })

  it('rejects rollout management for non-admin actors', async () => {
    const repo = repository()
    vi.mocked(repo.isApplicationAdmin).mockResolvedValue(false)
    await expect(executeMoodleSyncRollouts(repo, ACTOR_ID, { action: 'list_rollouts' }))
      .rejects.toMatchObject({ code: 'forbidden', status: 403 })
    expect(repo.list).not.toHaveBeenCalled()
  })
})
