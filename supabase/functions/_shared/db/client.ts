import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database } from './database.types.ts'

export type AppSupabaseClient = SupabaseClient<Database>

function createTypedClient(apiKey: string): AppSupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  return createClient<Database>(supabaseUrl, apiKey)
}

/**
 * Creates a Supabase client with the service role key.
 * Use for server-side operations that bypass RLS.
 */
export function createServiceClient(): AppSupabaseClient {
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return createTypedClient(supabaseServiceKey)
}

/**
 * Creates a Supabase client with the anon key.
 * Use for operations that should respect RLS (e.g., auth sign-in).
 */
export function createAnonClient(): AppSupabaseClient {
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  return createTypedClient(anonKey)
}
