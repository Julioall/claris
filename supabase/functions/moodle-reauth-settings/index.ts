// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { corsHeaders, jsonResponse } from '../_shared/http/mod.ts'

Deno.serve((request) => request.method === 'OPTIONS'
  ? new Response('ok', { headers: corsHeaders })
  : jsonResponse({
    error: 'Global Moodle reauthorization was replaced by per-connection management.',
    errorcode: 'moodle_reauth_settings_retired',
  }, 410))
