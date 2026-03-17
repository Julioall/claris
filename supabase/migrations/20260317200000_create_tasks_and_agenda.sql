-- Tasks module
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  due_date date,
  project_id uuid,  -- nullable, for future projects feature
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  comment text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  field_changed text not null,
  old_value text,
  new_value text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Tag system
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  prefix text,           -- e.g. 'uc', 'aluno', 'turma', 'curso'
  entity_id text,        -- ID of the referenced entity (optional)
  entity_type text,      -- entity type: 'uc', 'aluno', 'turma', 'curso', 'custom'
  color text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.task_tags (
  task_id uuid not null references public.tasks(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

-- Agenda module
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  type text not null default 'manual' check (type in ('manual', 'webclass', 'meeting', 'alignment', 'delivery', 'other')),
  owner uuid references auth.users(id) on delete set null,
  external_source text not null default 'manual' check (external_source in ('manual', 'teams', 'future_sync')),
  external_id text,
  -- Future Teams integration fields
  external_provider text,
  external_event_id text,
  sync_status text default 'none' check (sync_status in ('none', 'synced', 'pending', 'error')),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS policies
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_history enable row level security;
alter table public.tags enable row level security;
alter table public.task_tags enable row level security;
alter table public.calendar_events enable row level security;

-- For now, allow authenticated users full access
create policy "Authenticated users can manage tasks" on public.tasks
  for all using (auth.uid() is not null);

create policy "Authenticated users can manage task_comments" on public.task_comments
  for all using (auth.uid() is not null);

create policy "Authenticated users can manage task_history" on public.task_history
  for all using (auth.uid() is not null);

create policy "Authenticated users can manage tags" on public.tags
  for all using (auth.uid() is not null);

create policy "Authenticated users can manage task_tags" on public.task_tags
  for all using (auth.uid() is not null);

create policy "Authenticated users can manage calendar_events" on public.calendar_events
  for all using (auth.uid() is not null);

-- updated_at triggers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

create trigger calendar_events_updated_at before update on public.calendar_events
  for each row execute function public.set_updated_at();
