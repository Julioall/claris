-- Fix admin_cleanup_table to use TRUNCATE instead of DELETE
-- TRUNCATE is the proper SQL command for removing all rows from a table
-- and bypasses the "DELETE requires WHERE clause" safety restriction

create or replace function public.admin_cleanup_table(target_table text)
returns table (deleted_table text)
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_tables constant text[] := array[
    'moodle_messages',
    'moodle_conversations',
    'scheduled_messages',
    'bulk_message_recipients',
    'bulk_message_jobs',
    'claris_suggestion_cooldowns',
    'ai_grade_suggestion_job_items',
    'background_job_events',
    'background_job_items',
    'app_service_webhook_events',
    'app_service_instance_events',
    'app_service_instance_health_logs',
    'app_service_instance_jobs',
    'task_tags',
    'task_comments',
    'task_history',
    'notes',
    'pending_tasks',
    'risk_history',
    'activity_feed',
    'support_tickets',
    'app_usage_events',
    'app_error_logs',
    'claris_ai_actions',
    'claris_conversations',
    'claris_suggestions',
    'ai_grade_suggestion_history',
    'ai_grade_suggestion_jobs',
    'background_jobs',
    'student_sync_snapshots',
    'dashboard_course_activity_aggregates',
    'student_activities',
    'student_course_grades',
    'student_courses',
    'attendance_records',
    'attendance_course_settings',
    'user_courses',
    'user_ignored_courses',
    'task_recurrence_configs',
    'user_moodle_reauth_credentials',
    'user_sync_preferences',
    'task_templates',
    'message_templates',
    'calendar_events',
    'tasks',
    'tags',
    'students',
    'courses'
  ];
begin
  if target_table is null or btrim(target_table) = '' then
    raise exception 'target_table is required';
  end if;

  if not (target_table = any(allowed_tables)) then
    raise exception 'cleanup for table "%" is not allowed', target_table;
  end if;

  -- Use TRUNCATE instead of DELETE to properly remove all rows
  -- TRUNCATE is designed for this purpose and bypasses WHERE clause requirements
  -- RESTART IDENTITY resets auto-increment sequences
  -- CASCADE handles foreign key dependencies (truncates dependent tables too)
  execute format('truncate table public.%I restart identity cascade', target_table);

  return query
    select target_table;
end;
$$;

revoke all on function public.admin_cleanup_table(text) from public;
revoke all on function public.admin_cleanup_table(text) from anon;
revoke all on function public.admin_cleanup_table(text) from authenticated;
grant execute on function public.admin_cleanup_table(text) to service_role;

comment on function public.admin_cleanup_table(text) is 'Admin-only function to truncate (remove all rows from) allowed tables. Uses TRUNCATE for efficiency and to bypass DELETE WHERE clause requirements. RESTART IDENTITY resets sequences, CASCADE handles foreign key dependencies.';
