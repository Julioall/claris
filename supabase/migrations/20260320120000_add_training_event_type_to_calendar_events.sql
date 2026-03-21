alter table public.calendar_events
  drop constraint if exists calendar_events_type_check;

alter table public.calendar_events
  add constraint calendar_events_type_check
  check (type in ('manual', 'webclass', 'meeting', 'alignment', 'delivery', 'training', 'other'));
