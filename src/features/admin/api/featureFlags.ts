import { supabase } from '@/integrations/supabase/client';

export interface FeatureFlagPayload {
  key: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  payload: Record<string, unknown>;
}

export async function listFeatureFlags() {
  return supabase
    .from('app_feature_flags')
    .select('*')
    .order('key', { ascending: true });
}

export async function createFeatureFlag(flag: FeatureFlagPayload) {
  return supabase.from('app_feature_flags').insert({
    key: flag.key,
    name: flag.name,
    description: flag.description ?? null,
    enabled: flag.enabled,
    payload: flag.payload,
  });
}

export async function updateFeatureFlag(id: string, flag: Omit<FeatureFlagPayload, 'key'>) {
  return supabase
    .from('app_feature_flags')
    .update({
      name: flag.name,
      description: flag.description ?? null,
      enabled: flag.enabled,
      payload: flag.payload,
    })
    .eq('id', id);
}

export async function setFeatureFlagEnabled(id: string, enabled: boolean) {
  return supabase.from('app_feature_flags').update({ enabled }).eq('id', id);
}

export async function deleteFeatureFlag(id: string) {
  return supabase.from('app_feature_flags').delete().eq('id', id);
}
