-- Claris AI action audit table.
-- Records every mutating action initiated by the Claris IA (create/update/delete
-- of tasks, events, and bulk message dispatch) so that operations can be traced,
-- replayed, or investigated without relying on application logs.
--
-- Design decisions:
--   • Rows are insert-only for authenticated callers; update/delete are denied.
--   • The Edge Functions run under service_role and bypass RLS, so they can always
--     insert.  The explicit INSERT policy below covers the authenticated path for
--     future tooling that may call this table directly with a user JWT.
--   • Users can read only their own audit rows.

CREATE TABLE IF NOT EXISTS public.claris_ai_actions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name      TEXT        NOT NULL,
  tool_args      JSONB       NOT NULL DEFAULT '{}',
  result_summary TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.claris_ai_actions ENABLE ROW LEVEL SECURITY;

-- Users may read their own audit rows.
CREATE POLICY "claris_ai_actions_select_own"
  ON public.claris_ai_actions FOR SELECT
  USING (user_id = auth.uid());

-- Authenticated users may insert only rows scoped to themselves.
-- Edge Functions using service_role bypass this policy automatically.
CREATE POLICY "claris_ai_actions_insert_own"
  ON public.claris_ai_actions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- No UPDATE or DELETE policies — audit rows are immutable.

-- Index to support per-user history queries efficiently.
CREATE INDEX IF NOT EXISTS idx_claris_ai_actions_user_created
  ON public.claris_ai_actions(user_id, created_at DESC);

COMMENT ON TABLE public.claris_ai_actions IS
  'Immutable audit trail for all mutating actions executed by Claris IA tools (create/update/delete tasks, events, messages).';
COMMENT ON COLUMN public.claris_ai_actions.tool_name IS
  'Name of the tool called by the AI (e.g. create_task, delete_event).';
COMMENT ON COLUMN public.claris_ai_actions.tool_args IS
  'Sanitised subset of the arguments passed to the tool (no raw user input exceeding reasonable length).';
COMMENT ON COLUMN public.claris_ai_actions.result_summary IS
  'Short human-readable description of the outcome (e.g. "task created: id=<uuid>").';
