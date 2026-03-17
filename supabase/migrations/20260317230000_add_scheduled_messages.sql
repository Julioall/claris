-- Scheduled Messages migration
-- Allows users (and Claris IA) to schedule bulk message sends for a future datetime.

create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message_content text not null,
  template_id uuid references public.message_templates(id) on delete set null,
  scheduled_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  origin text not null default 'manual'
    check (origin in ('manual', 'ia')),
  -- Snapshot of recipient selection filters, stored as JSON for observability
  filter_context jsonb,
  recipient_count int,
  sent_count int not null default 0,
  failed_count int not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: users can see and manage their own scheduled messages
alter table public.scheduled_messages enable row level security;

create policy "users_own_scheduled_messages" on public.scheduled_messages
  for all using (user_id = auth.uid());

-- Updated_at trigger
create or replace function public.set_scheduled_messages_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_scheduled_messages_updated_at
  before update on public.scheduled_messages
  for each row execute procedure public.set_scheduled_messages_updated_at();

comment on table public.scheduled_messages is 'Scheduled bulk message sends; can be created manually or by Claris IA.';
comment on column public.scheduled_messages.origin is 'manual = created by user; ia = created by Claris IA';
comment on column public.scheduled_messages.filter_context is 'Snapshot of the recipient filter options at scheduling time';
