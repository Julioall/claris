-- Extend tasks table with AI-tracking and entity-linking fields
alter table public.tasks
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists origin_reason text,
  add column if not exists suggested_by_ai boolean not null default false,
  add column if not exists tags text[] not null default '{}';

-- Extend calendar_events table with richer fields for AI-driven agenda
alter table public.calendar_events
  add column if not exists all_day boolean not null default false,
  add column if not exists location text,
  add column if not exists participants jsonb,
  add column if not exists related_entity_type text,
  add column if not exists related_entity_id text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists ia_source text not null default 'manual'
    check (ia_source in ('manual', 'ia', 'sugestao_confirmada'));
