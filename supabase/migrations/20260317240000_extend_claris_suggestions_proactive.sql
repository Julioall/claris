-- Extend claris_suggestions for intelligent proactive feature
-- Adds reason, analysis, expected_impact, trigger_engine fields
-- and creates claris_suggestion_cooldowns table for memory/dedup

-- Extend suggestion type enum to include all 6 trigger engine types
alter table public.claris_suggestions
  drop constraint if exists claris_suggestions_type_check;

alter table public.claris_suggestions
  add constraint claris_suggestions_type_check check (type in (
    -- existing types
    'task_followup',
    'weekly_message',
    'correction_followup',
    'alignment_event',
    'recovery_followup',
    'grade_risk',
    'attendance_risk',
    'engagement_risk',
    'uc_closing',
    'routine_reminder',
    'custom',
    -- communication engine
    'unanswered_message',
    'interrupted_contact',
    'channel_ineffective',
    -- agenda engine
    'event_no_prep',
    'schedule_conflict',
    'recurring_event_manual',
    -- tasks engine
    'overdue_task',
    'stalled_task',
    'task_no_context',
    -- academic engine
    'student_no_activity',
    'class_no_followup',
    'uc_no_update',
    -- operational engine
    'manual_flow_recurring',
    'old_pending',
    'interrupted_process',
    -- platform usage engine
    'unused_module',
    'repetitive_pattern',
    'unorganized_messages'
  ));

-- Add new enriched fields to claris_suggestions
alter table public.claris_suggestions
  add column if not exists reason text,
  add column if not exists analysis text,
  add column if not exists expected_impact text,
  add column if not exists trigger_engine text check (trigger_engine in (
    'communication', 'agenda', 'tasks', 'academic', 'operational', 'platform_usage', 'manual'
  ));

-- Cooldowns table — prevents suggestion engine from re-generating the same
-- suggestion within a cooldown window when no new context change has occurred.
create table if not exists public.claris_suggestion_cooldowns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Engine that generated the suggestion
  trigger_engine text not null,
  -- Sub-category within the engine (e.g. 'unanswered_message', 'overdue_task')
  trigger_key text not null,
  -- Optional entity this cooldown is tied to
  entity_type text,
  entity_id text,
  -- When the cooldown was set and when it expires
  set_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- The outcome that set this cooldown
  outcome text not null default 'generated' check (outcome in (
    'generated', 'accepted', 'dismissed', 'expired', 'ignored'
  )),
  -- Link to the suggestion that originated this cooldown (if any)
  suggestion_id uuid references public.claris_suggestions(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.claris_suggestion_cooldowns enable row level security;

create policy "Users manage their own suggestion cooldowns"
  on public.claris_suggestion_cooldowns
  for all
  using (user_id = auth.uid());

-- Index for fast cooldown lookups
create index if not exists idx_suggestion_cooldowns_lookup
  on public.claris_suggestion_cooldowns(user_id, trigger_engine, trigger_key, entity_id, expires_at desc);

-- Index for cleaning up expired cooldowns
create index if not exists idx_suggestion_cooldowns_expires
  on public.claris_suggestion_cooldowns(expires_at);
