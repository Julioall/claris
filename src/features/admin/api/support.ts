// API para support_tickets

import { supabase } from '@/integrations/supabase/client';

export async function fetchSupportTickets() {
  return supabase.from('support_tickets').select('*');
}
