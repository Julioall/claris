// API para app_feature_flags

import { supabase } from '@/integrations/supabase/client';

export async function fetchFeatureFlags() {
  return supabase.from('app_feature_flags').select('*');
}
