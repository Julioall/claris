-- Claris IA proactive suggestions panel
-- Stores AI-generated suggestions for the tutor's home/dashboard
create table if not exists public.claris_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in (
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
    'custom'
  )),
  title text not null,
  body text not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed', 'expired')),
  -- Related entity (optional)
  entity_type text,
  entity_id text,
  entity_name text,
  -- Action payload — if accepted, create task or event with these params
  action_type text check (action_type in ('create_task', 'create_event', 'open_chat', null)),
  action_payload jsonb,
  -- Lifecycle
  trigger_context jsonb,
  suggested_at timestamptz not null default now(),
  expires_at timestamptz,
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.claris_suggestions enable row level security;

create policy "Users manage their own suggestions"
  on public.claris_suggestions
  for all
  using (user_id = auth.uid());

drop trigger if exists claris_suggestions_updated_at on public.claris_suggestions;
create trigger claris_suggestions_updated_at
  before update on public.claris_suggestions
  for each row execute function public.set_updated_at();

-- Index for fast dashboard queries
create index if not exists idx_claris_suggestions_user_status
  on public.claris_suggestions(user_id, status, suggested_at desc);
