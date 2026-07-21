import { beforeEach, describe, expect, it, vi } from 'vitest';

const realtimeMock = vi.hoisted(() => {
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };

  return {
    channel,
    channelFactory: vi.fn(),
    removeChannel: vi.fn(),
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: realtimeMock.channelFactory,
    removeChannel: realtimeMock.removeChannel,
  },
}));

import { realtimeGateway } from '../realtime-gateway';

describe('realtimeGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeMock.channelFactory.mockReturnValue(realtimeMock.channel);
    realtimeMock.channel.on.mockReturnValue(realtimeMock.channel);
    realtimeMock.channel.subscribe.mockReturnValue(realtimeMock.channel);
    realtimeMock.removeChannel.mockResolvedValue('ok');
  });

  it('maps a database notification to a domain event and owns cleanup', () => {
    const listener = vi.fn();
    const stop = realtimeGateway.onSupportTicketCreated(listener);

    expect(realtimeMock.channelFactory).toHaveBeenCalledWith('admin-support-tickets-realtime');
    expect(realtimeMock.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'support_tickets' },
      expect.any(Function),
    );
    expect(realtimeMock.channel.subscribe).toHaveBeenCalledTimes(1);

    const providerListener = realtimeMock.channel.on.mock.calls[0]?.[2] as (() => void) | undefined;
    providerListener?.();

    expect(listener).toHaveBeenCalledWith({ type: 'support-ticket-created' });

    stop();
    expect(realtimeMock.removeChannel).toHaveBeenCalledWith(realtimeMock.channel);
  });
});
