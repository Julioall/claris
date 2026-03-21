alter table public.bulk_message_jobs
  add column if not exists origin text;

update public.bulk_message_jobs
set origin = 'manual'
where origin is null;

alter table public.bulk_message_jobs
  alter column origin set default 'manual',
  alter column origin set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bulk_message_jobs_origin_check'
      and conrelid = 'public.bulk_message_jobs'::regclass
  ) then
    alter table public.bulk_message_jobs
      add constraint bulk_message_jobs_origin_check
      check (origin in ('manual', 'ia'));
  end if;
end
$$;

comment on column public.bulk_message_jobs.origin is 'manual = created by user; ia = created by Claris IA';
