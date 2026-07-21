import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchActiveWhatsAppInstances,
  fetchWhatsAppMessages,
  sendWhatsAppMedia,
  sendWhatsAppMessage,
} from '@/features/whatsapp/api/messaging';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), upload: vi.fn() }));

vi.mock('@/integrations/http/edge-function-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/integrations/http/edge-function-client')>();
  return {
    ...original,
    invokeEdgeFunction: (...args: unknown[]) => mocks.invoke(...args),
    invokeEdgeFunctionWithUploadProgress: (...args: unknown[]) => mocks.upload(...args),
  };
});

const metadata = { contractVersion: 1, generatedAt: '2026-07-21T10:00:00.000Z' };
const message = {
  id: 'message-1',
  remoteJid: '5511999999999@s.whatsapp.net',
  text: 'Ola',
  sentAt: '2026-07-21T10:00:00.000Z',
  direction: 'outgoing',
  status: 'sent',
  type: 'text',
  media: null,
  contact: null,
  location: null,
  senderName: null,
};

describe('WhatsApp messaging API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads actor-scoped instances through the backend and restores metadata for the legacy view', async () => {
    mocks.invoke.mockResolvedValueOnce({
      instances: [{
        id: 'instance-1',
        name: 'WhatsApp',
        scope: 'personal',
        connectionStatus: 'connected',
        isActive: true,
        isBlocked: false,
        lastActivityAt: null,
        createdAt: '2026-07-21T10:00:00.000Z',
        metadata: { phoneNumber: '5562999999999' },
      }],
      metadata,
    });

    await expect(fetchActiveWhatsAppInstances()).resolves.toEqual([
      expect.objectContaining({
        connection_status: 'connected',
        metadata: { phone_number: '5562999999999' },
      }),
    ]);
    expect(mocks.invoke.mock.calls[0][1].body).toEqual({ action: 'list_instances' });
  });

  it('uses exact camelCase request fields and maps message DTOs', async () => {
    mocks.invoke
      .mockResolvedValueOnce({ messages: [message], metadata, remoteJid: message.remoteJid })
      .mockResolvedValueOnce({ message, metadata });

    await expect(fetchWhatsAppMessages('instance-1', message.remoteJid, 20)).resolves.toEqual([
      expect.objectContaining({ remote_jid: message.remoteJid, sent_at: message.sentAt }),
    ]);
    await expect(sendWhatsAppMessage({
      instanceId: 'instance-1',
      message: 'Ola',
      remoteJid: message.remoteJid,
    })).resolves.toMatchObject({ id: 'message-1' });

    expect(mocks.invoke.mock.calls.map((call) => call[1].body)).toEqual([
      { action: 'get_messages', instanceId: 'instance-1', limit: 20, remoteJid: message.remoteJid },
      { action: 'send_message', instanceId: 'instance-1', message: 'Ola', remoteJid: message.remoteJid },
    ]);
    expect(JSON.stringify(mocks.invoke.mock.calls)).not.toMatch(/instance_id|remote_jid|userId/);
  });

  it('routes media upload through the common HTTP client without provider fields', async () => {
    mocks.upload.mockResolvedValueOnce({ message, metadata });
    const onProgress = vi.fn();
    await sendWhatsAppMedia({
      fileName: 'foto.png',
      instanceId: 'instance-1',
      media: 'base64',
      mediaType: 'image',
      mimeType: 'image/png',
      remoteJid: message.remoteJid,
      sendAsSticker: false,
    }, onProgress);

    expect(mocks.upload).toHaveBeenCalledWith('whatsapp-messaging', expect.objectContaining({
      auth: 'required',
      body: {
        action: 'send_media',
        caption: undefined,
        fileName: 'foto.png',
        instanceId: 'instance-1',
        media: 'base64',
        mediaType: 'image',
        mimeType: 'image/png',
        remoteJid: message.remoteJid,
      },
      timeoutMs: 120_000,
    }));
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });
});
