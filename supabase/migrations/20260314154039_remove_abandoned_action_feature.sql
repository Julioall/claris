begin;

drop trigger if exists trigger_update_task_status_from_action on public.task_actions;
drop trigger if exists update_task_actions_updated_at on public.task_actions;

drop function if exists public.update_task_status_from_action();
drop function if exists public.delete_old_trashed_actions();

drop table if exists public.task_action_history cascade;
drop table if exists public.task_actions cascade;
drop table if exists public.task_action_logs cascade;
drop table if exists public.action_types cascade;
drop table if exists public.actions cascade;

alter table public.task_templates
  drop column if exists auto_close_on_action;

drop type if exists public.action_effectiveness;
drop type if exists public.action_status;
drop type if exists public.action_type;

commit;
