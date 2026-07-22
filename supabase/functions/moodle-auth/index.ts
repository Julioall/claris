// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import { corsHeaders, jsonResponse } from '../_shared/http/mod.ts'

// Retired before the first Claris release. This handler deliberately does not
// read the request body, so legacy Moodle credentials are never processed.
Deno.serve((request) => request.method === 'OPTIONS'
  ? new Response('ok', { headers: corsHeaders })
  : jsonResponse({
    error: 'Moodle login was retired. Authenticate with your Claris account.',
    errorcode: 'moodle_login_retired',
  }, 410))
