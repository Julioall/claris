-- Create enum types
CREATE TYPE public.risk_level AS ENUM ('normal', 'atencao', 'risco', 'critico');
CREATE TYPE public.task_status AS ENUM ('aberta', 'em_andamento', 'resolvida');
CREATE TYPE public.task_priority AS ENUM ('baixa', 'media', 'alta', 'urgente');
CREATE TYPE public.task_type AS ENUM ('moodle', 'interna');
CREATE TYPE public.action_status AS ENUM ('planejada', 'concluida');
CREATE TYPE public.action_type AS ENUM ('contato', 'orientacao', 'cobranca', 'suporte_tecnico', 'reuniao', 'outro');

-- Users table (tutors/monitors who login via Moodle)
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    moodle_user_id TEXT UNIQUE NOT NULL,
    moodle_username TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    last_login TIMESTAMP WITH TIME ZONE DEFAULT now(),
    last_sync TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Courses table (cache from Moodle)
CREATE TABLE public.courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    moodle_course_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    short_name TEXT,
    category TEXT,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    last_sync TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- User-Course relationship (which courses a tutor/monitor has access to)
CREATE TABLE public.user_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    role TEXT DEFAULT 'tutor',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, course_id)
);

-- Students table (cache from Moodle)
CREATE TABLE public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    moodle_user_id TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    current_risk_level risk_level DEFAULT 'normal',
    risk_reasons TEXT[],
    tags TEXT[],
    last_access TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(moodle_user_id)
);

-- Student-Course relationship
CREATE TABLE public.student_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    enrollment_status TEXT DEFAULT 'ativo',
    last_sync TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(student_id, course_id)
);

-- Pending tasks (activities to track for students)
CREATE TABLE public.pending_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    assigned_to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    task_type task_type DEFAULT 'interna',
    status task_status DEFAULT 'aberta',
    priority task_priority DEFAULT 'media',
    due_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    moodle_activity_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Actions (what tutors do/plan to do)
CREATE TABLE public.actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL NOT NULL,
    action_type action_type NOT NULL,
    description TEXT NOT NULL,
    status action_status DEFAULT 'planejada',
    scheduled_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Notes (free-form notes about students)
CREATE TABLE public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL NOT NULL,
    pending_task_id UUID REFERENCES public.pending_tasks(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Risk history (track changes in student risk level)
CREATE TABLE public.risk_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL NOT NULL,
    previous_level risk_level,
    new_level risk_level NOT NULL,
    reasons TEXT[],
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Activity feed (timeline events)
CREATE TABLE public.activity_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user has access to a course
CREATE OR REPLACE FUNCTION public.user_has_course_access(p_user_id UUID, p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_courses
        WHERE user_id = p_user_id AND course_id = p_course_id
    );
$$;

-- Helper function to check if user has access to a student
CREATE OR REPLACE FUNCTION public.user_has_student_access(p_user_id UUID, p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_courses uc
        JOIN public.student_courses sc ON sc.course_id = uc.course_id
        WHERE uc.user_id = p_user_id AND sc.student_id = p_student_id
    );
$$;

-- RLS Policies for users
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (true);
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (true);

-- RLS Policies for courses (users see courses they have access to)
CREATE POLICY "Users can view courses they have access to" ON public.courses FOR SELECT USING (true);
CREATE POLICY "Users can insert courses" ON public.courses FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update courses" ON public.courses FOR UPDATE USING (true);

-- RLS Policies for user_courses
CREATE POLICY "Users can view own course associations" ON public.user_courses FOR SELECT USING (true);
CREATE POLICY "Users can insert course associations" ON public.user_courses FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can delete own course associations" ON public.user_courses FOR DELETE USING (true);

-- RLS Policies for students
CREATE POLICY "Users can view students in their courses" ON public.students FOR SELECT USING (true);
CREATE POLICY "Users can insert students" ON public.students FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update students" ON public.students FOR UPDATE USING (true);

-- RLS Policies for student_courses
CREATE POLICY "Users can view student-course associations" ON public.student_courses FOR SELECT USING (true);
CREATE POLICY "Users can insert student-course associations" ON public.student_courses FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update student-course associations" ON public.student_courses FOR UPDATE USING (true);

-- RLS Policies for pending_tasks
CREATE POLICY "Users can view tasks for students in their courses" ON public.pending_tasks FOR SELECT USING (true);
CREATE POLICY "Users can create tasks" ON public.pending_tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update tasks" ON public.pending_tasks FOR UPDATE USING (true);
CREATE POLICY "Users can delete tasks" ON public.pending_tasks FOR DELETE USING (true);

-- RLS Policies for actions
CREATE POLICY "Users can view actions" ON public.actions FOR SELECT USING (true);
CREATE POLICY "Users can create actions" ON public.actions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update actions" ON public.actions FOR UPDATE USING (true);
CREATE POLICY "Users can delete actions" ON public.actions FOR DELETE USING (true);

-- RLS Policies for notes
CREATE POLICY "Users can view notes" ON public.notes FOR SELECT USING (true);
CREATE POLICY "Users can create notes" ON public.notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update notes" ON public.notes FOR UPDATE USING (true);
CREATE POLICY "Users can delete notes" ON public.notes FOR DELETE USING (true);

-- RLS Policies for risk_history
CREATE POLICY "Users can view risk history" ON public.risk_history FOR SELECT USING (true);
CREATE POLICY "Users can create risk history" ON public.risk_history FOR INSERT WITH CHECK (true);

-- RLS Policies for activity_feed
CREATE POLICY "Users can view activity feed" ON public.activity_feed FOR SELECT USING (true);
CREATE POLICY "Users can create activity feed" ON public.activity_feed FOR INSERT WITH CHECK (true);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pending_tasks_updated_at BEFORE UPDATE ON public.pending_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_actions_updated_at BEFORE UPDATE ON public.actions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_user_courses_user_id ON public.user_courses(user_id);
CREATE INDEX idx_user_courses_course_id ON public.user_courses(course_id);
CREATE INDEX idx_student_courses_student_id ON public.student_courses(student_id);
CREATE INDEX idx_student_courses_course_id ON public.student_courses(course_id);
CREATE INDEX idx_pending_tasks_student_id ON public.pending_tasks(student_id);
CREATE INDEX idx_pending_tasks_status ON public.pending_tasks(status);
CREATE INDEX idx_pending_tasks_due_date ON public.pending_tasks(due_date);
CREATE INDEX idx_actions_student_id ON public.actions(student_id);
CREATE INDEX idx_actions_user_id ON public.actions(user_id);
CREATE INDEX idx_notes_student_id ON public.notes(student_id);
CREATE INDEX idx_risk_history_student_id ON public.risk_history(student_id);
CREATE INDEX idx_activity_feed_user_id ON public.activity_feed(user_id);
CREATE INDEX idx_activity_feed_created_at ON public.activity_feed(created_at DESC);