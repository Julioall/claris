
-- Message templates table
CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  category text DEFAULT 'geral',
  is_favorite boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_templates_select" ON public.message_templates FOR SELECT TO public USING (user_id = auth.uid());
CREATE POLICY "message_templates_insert" ON public.message_templates FOR INSERT TO public WITH CHECK (user_id = auth.uid());
CREATE POLICY "message_templates_update" ON public.message_templates FOR UPDATE TO public USING (user_id = auth.uid());
CREATE POLICY "message_templates_delete" ON public.message_templates FOR DELETE TO public USING (user_id = auth.uid());

-- Bulk message jobs table
CREATE TYPE public.bulk_message_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

CREATE TABLE public.bulk_message_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_id uuid REFERENCES public.message_templates(id) ON DELETE SET NULL,
  message_content text NOT NULL,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  status public.bulk_message_status NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bulk_message_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bulk_message_jobs_select" ON public.bulk_message_jobs FOR SELECT TO public USING (user_id = auth.uid());
CREATE POLICY "bulk_message_jobs_insert" ON public.bulk_message_jobs FOR INSERT TO public WITH CHECK (user_id = auth.uid());
CREATE POLICY "bulk_message_jobs_update" ON public.bulk_message_jobs FOR UPDATE TO public USING (user_id = auth.uid());

-- Bulk message recipients table
CREATE TYPE public.bulk_recipient_status AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE public.bulk_message_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.bulk_message_jobs(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  moodle_user_id text NOT NULL,
  student_name text NOT NULL,
  personalized_message text,
  status public.bulk_recipient_status NOT NULL DEFAULT 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bulk_message_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bulk_message_recipients_select" ON public.bulk_message_recipients FOR SELECT TO public 
  USING (EXISTS (SELECT 1 FROM public.bulk_message_jobs j WHERE j.id = job_id AND j.user_id = auth.uid()));
CREATE POLICY "bulk_message_recipients_insert" ON public.bulk_message_recipients FOR INSERT TO public 
  WITH CHECK (EXISTS (SELECT 1 FROM public.bulk_message_jobs j WHERE j.id = job_id AND j.user_id = auth.uid()));

-- Enable realtime for job status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.bulk_message_jobs;
