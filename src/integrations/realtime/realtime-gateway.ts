import { supabase } from '@/integrations/supabase/client';

export interface SupportTicketCreatedEvent {
  type: 'support-ticket-created';
}

export type RealtimeSubscriptionStop = () => void;

function onSupportTicketCreated(
  listener: (event: SupportTicketCreatedEvent) => void,
): RealtimeSubscriptionStop {
  const channel = supabase
    .channel('admin-support-tickets-realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'support_tickets' },
      () => listener({ type: 'support-ticket-created' }),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export const realtimeGateway = {
  onSupportTicketCreated,
};
