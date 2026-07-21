import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeEdgeFunctionMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: invokeEdgeFunctionMock,
}));

import {
  createPersonalWhatsAppInstance,
  getMyServiceOverview,
  setServiceInstanceBlocked,
  syncServiceInstanceStatus,
} from '../serviceInstances';

describe('service instances API', () => {
  beforeEach(() => {
    invokeEdgeFunctionMock.mockReset();
    invokeEdgeFunctionMock.mockResolvedValue({ contractVersion: 1 });
  });

  it('derives the personal overview actor from the authenticated session', async () => {
    invokeEdgeFunctionMock.mockResolvedValue({ contractVersion: 1, instance: null, events: [] });

    await getMyServiceOverview();

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('whatsapp-instance-manager', {
      body: { action: 'get_my_overview' },
    });
  });

  it('sends only the accepted personal creation fields', async () => {
    await createPersonalWhatsAppInstance({
      name: 'WhatsApp Pessoal',
      phoneNumber: '5511999999999',
    });

    const body = invokeEdgeFunctionMock.mock.calls[0][1].body;
    expect(body).toEqual({
      action: 'create_instance',
      scope: 'personal',
      name: 'WhatsApp Pessoal',
      phoneNumber: '5511999999999',
    });
    expect(body).not.toHaveProperty('userId');
    expect(body).not.toHaveProperty('ownerUserId');
  });

  it('uses explicit typed status and administration commands', async () => {
    await syncServiceInstanceStatus('00000000-0000-4000-8000-000000000001', { silent: true });
    await setServiceInstanceBlocked('00000000-0000-4000-8000-000000000001', true);

    expect(invokeEdgeFunctionMock.mock.calls.map(([, options]) => options.body)).toEqual([
      {
        action: 'sync_instance_status',
        instanceId: '00000000-0000-4000-8000-000000000001',
        silent: true,
      },
      {
        action: 'set_instance_blocked',
        instanceId: '00000000-0000-4000-8000-000000000001',
        blocked: true,
      },
    ]);
  });

  it('rejects an incompatible response contract', async () => {
    invokeEdgeFunctionMock.mockResolvedValue({ contractVersion: 2, instance: null, events: [] });

    await expect(getMyServiceOverview()).rejects.toThrow('Versão incompatível');
  });

  it('rejects a malformed response without leaking an implementation error', async () => {
    invokeEdgeFunctionMock.mockResolvedValue(null);

    await expect(getMyServiceOverview()).rejects.toThrow('Versão incompatível');
  });
});
