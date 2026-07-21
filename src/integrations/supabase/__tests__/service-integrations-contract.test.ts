import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { mapAdminServiceInstance, mapServiceInstanceEvent } from '../../../../supabase/functions/whatsapp-instance-manager/mapper.ts';
import { parseServiceIntegrationPayload } from '../../../../supabase/functions/whatsapp-instance-manager/payload.ts';
import type { EvolutionInstanceGateway } from '../../../../supabase/functions/whatsapp-instance-manager/evolution-gateway.ts';
import type {
  ServiceInstanceRepository,
  ServiceInstanceRow,
} from '../../../../supabase/functions/whatsapp-instance-manager/repository.ts';
import {
  authorizeServiceIntegration,
  executeServiceIntegration,
} from '../../../../supabase/functions/whatsapp-instance-manager/service.ts';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const INSTANCE_ID = '33333333-3333-4333-8333-333333333333';

const instanceRow: ServiceInstanceRow = {
  id: INSTANCE_ID,
  name: 'WhatsApp Pessoal',
  description: null,
  service_type: 'whatsapp',
  provider: 'evolution_api',
  scope: 'personal',
  owner_user_id: ACTOR_ID,
  evolution_instance_name: 'claris-personal-test',
  external_id: 'provider-secret-id',
  connection_status: 'connected',
  operational_status: 'connected',
  health_status: 'healthy',
  is_active: true,
  is_blocked: false,
  warmup_mode: false,
  send_window: null,
  limits: null,
  last_sync_at: null,
  last_activity_at: null,
  admin_notes: 'internal note',
  metadata: { phone_number: '5511999999999', secret: 'hidden' },
  created_by_user_id: ACTOR_ID,
  updated_by_user_id: ACTOR_ID,
  created_at: '2026-07-21T12:00:00.000Z',
  updated_at: '2026-07-21T12:00:00.000Z',
};

function repository(overrides: Partial<ServiceInstanceRepository> = {}): ServiceInstanceRepository {
  return {
    createInstance: vi.fn(async () => ({ kind: 'created', instance: instanceRow })),
    deleteInstance: vi.fn(async () => undefined),
    findInstance: vi.fn(async () => instanceRow),
    findPersonalWhatsAppInstance: vi.fn(async () => instanceRow),
    hasActiveSharedWhatsAppInstance: vi.fn(async () => false),
    hasPermission: vi.fn(async () => true),
    isApplicationAdmin: vi.fn(async () => true),
    listEvents: vi.fn(async () => [{
      id: '44444444-4444-4444-8444-444444444444',
      instance_id: INSTANCE_ID,
      instance_scope: 'personal',
      event_type: 'status_synced',
      origin: 'user',
      context: { providerPayload: 'hidden' },
      status: 'success',
      error_summary: null,
      actor_user_id: ACTOR_ID,
      correlation_id: 'correlation-test',
      created_at: '2026-07-21T12:00:00.000Z',
    }]),
    listSharedWhatsAppInstances: vi.fn(async () => [{ ...instanceRow, scope: 'shared' }]),
    recordEvent: vi.fn(async () => undefined),
    recordHealth: vi.fn(async () => undefined),
    setActive: vi.fn(async () => undefined),
    setBlocked: vi.fn(async () => undefined),
    setExternalId: vi.fn(async () => undefined),
    setPendingConnection: vi.fn(async () => undefined),
    setStatus: vi.fn(async () => undefined),
    updateInstance: vi.fn(async () => instanceRow),
    ...overrides,
  };
}

function evolution(overrides: Partial<EvolutionInstanceGateway> = {}): EvolutionInstanceGateway {
  return {
    configureWebhook: vi.fn(async () => undefined),
    connect: vi.fn(async () => undefined),
    createInstance: vi.fn(async () => null),
    deleteInstance: vi.fn(async () => undefined),
    ensureInstance: vi.fn(async () => null),
    getQrCode: vi.fn(async () => ({
      qrCode: null,
      pairingCode: null,
      pending: true,
      message: 'pending',
    })),
    getStatus: vi.fn(async () => ({ details: {}, state: 'open' })),
    logout: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('service integrations backend contract', () => {
  it('accepts bounded intents and rejects spoofed identity or persistence fields', () => {
    expect(parseServiceIntegrationPayload({ action: 'get_my_overview' }))
      .toEqual({ action: 'get_my_overview' });
    expect(parseServiceIntegrationPayload({
      action: 'sync_instance_status',
      instanceId: INSTANCE_ID,
      silent: true,
    })).toEqual({ action: 'sync_instance_status', instanceId: INSTANCE_ID, silent: true });

    for (const payload of [
      { action: 'get_my_overview', userId: ACTOR_ID },
      { action: 'create_instance', scope: 'personal', name: 'WhatsApp', ownerUserId: ACTOR_ID },
      { action: 'create_instance', scope: 'personal', name: 'WhatsApp', metadata: {} },
      { action: 'update_instance', instanceId: INSTANCE_ID, name: 'WhatsApp', externalId: 'x' },
      { action: 'get_instance_qr', instanceId: '../provider-secret' },
    ]) {
      expect(() => parseServiceIntegrationPayload(payload)).toThrowError(
        expect.objectContaining({ status: 422 }),
      );
    }
  });

  it('maps explicit DTOs without provider IDs, raw metadata or event context', () => {
    const adminDto = mapAdminServiceInstance(instanceRow);
    const eventDto = mapServiceInstanceEvent({
      id: '44444444-4444-4444-8444-444444444444',
      instance_id: INSTANCE_ID,
      instance_scope: 'personal',
      event_type: 'status_synced',
      origin: 'user',
      context: { raw: 'secret' },
      status: 'success',
      error_summary: null,
      actor_user_id: ACTOR_ID,
      correlation_id: null,
      created_at: '2026-07-21T12:00:00.000Z',
    });

    expect(adminDto).toMatchObject({
      id: INSTANCE_ID,
      phoneNumber: '5511999999999',
      adminNotes: 'internal note',
    });
    expect(adminDto).not.toHaveProperty('externalId');
    expect(adminDto).not.toHaveProperty('metadata');
    expect(eventDto).not.toHaveProperty('context');
    expect(eventDto).not.toHaveProperty('actorUserId');
  });

  it('derives the personal instance from the authenticated actor', async () => {
    const serviceRepository = repository();
    const result = await executeServiceIntegration(
      serviceRepository,
      evolution(),
      ACTOR_ID,
      'correlation-test',
      { action: 'get_my_overview' },
    );

    expect(serviceRepository.findPersonalWhatsAppInstance).toHaveBeenCalledWith(ACTOR_ID);
    expect(result).toMatchObject({ contractVersion: 1, instance: { id: INSTANCE_ID } });
    expect(JSON.stringify(result)).not.toContain('providerPayload');
  });

  it('requires the general permission and admin rights for shared operations', async () => {
    await expect(authorizeServiceIntegration(
      repository({ hasPermission: vi.fn(async () => false) }),
      ACTOR_ID,
    )).resolves.toBe(false);

    const shared = { ...instanceRow, scope: 'shared', owner_user_id: null };
    const nonAdminRepository = repository({
      findInstance: vi.fn(async () => shared),
      isApplicationAdmin: vi.fn(async () => false),
    });
    await expect(executeServiceIntegration(
      nonAdminRepository,
      evolution(),
      ACTOR_ID,
      'correlation-test',
      { action: 'sync_instance_status', instanceId: INSTANCE_ID, silent: true },
    )).rejects.toMatchObject({ status: 403 });
  });

  it('prevents access to another user personal instance before calling the provider', async () => {
    const provider = evolution();
    await expect(executeServiceIntegration(
      repository({
        findInstance: vi.fn(async () => ({ ...instanceRow, owner_user_id: OTHER_USER_ID })),
      }),
      provider,
      ACTOR_ID,
      'correlation-test',
      { action: 'get_instance_qr', instanceId: INSTANCE_ID },
    )).rejects.toMatchObject({ status: 403 });
    expect(provider.ensureInstance).not.toHaveBeenCalled();
    expect(provider.getQrCode).not.toHaveBeenCalled();
  });

  it('audits instance activation changes with backend-derived actor and correlation', async () => {
    const serviceRepository = repository();

    await executeServiceIntegration(
      serviceRepository,
      evolution(),
      ACTOR_ID,
      'correlation-test',
      { action: 'set_instance_active', instanceId: INSTANCE_ID, active: true },
    );

    expect(serviceRepository.setActive).toHaveBeenCalledWith(INSTANCE_ID, ACTOR_ID, true);
    expect(serviceRepository.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorId: ACTOR_ID,
      correlationId: 'correlation-test',
      eventType: 'instance_updated',
      context: { active: true },
    }));
  });
});

describe('service integrations database boundary', () => {
  const migration = readFileSync(resolve(
    process.cwd(),
    'supabase/migrations/20260721250000_secure_service_integrations.sql',
  ), 'utf8');

  it('makes every integration persistence table service-only', () => {
    for (const table of [
      'app_service_instances',
      'app_service_instance_events',
      'app_service_instance_jobs',
      'app_service_instance_limits',
      'app_service_instance_health_logs',
      'app_service_webhook_events',
      'app_service_instance_group_permissions',
    ]) {
      expect(migration).toMatch(new RegExp(
        `REVOKE ALL PRIVILEGES ON TABLE public\\.${table}[\\s\\S]*?FROM PUBLIC, anon, authenticated`,
        'i',
      ));
    }
  });
});
