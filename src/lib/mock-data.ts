// Mock data for development and demonstration
import { 
  type ActivityFeedItem,
  type WeeklySummary,
} from '@/features/dashboard/types';
import type { Course } from '@/features/courses/types';
import type { RiskLevel, Student } from '@/features/students/types';

// Helper to generate dates
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

const daysFromNow = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

// Mock Courses
export const mockCourses: Course[] = [
  {
    id: 'course-1',
    moodle_course_id: '101',
    name: 'Técnico em Automação Industrial',
    short_name: 'TAI-2024',
    category: 'Cursos Técnicos',
    start_date: daysAgo(90),
    end_date: daysFromNow(180),
    last_sync: daysAgo(0),
    created_at: daysAgo(90),
    updated_at: daysAgo(0),
    students_count: 32,
    at_risk_count: 5,
  },
  {
    id: 'course-2',
    moodle_course_id: '102',
    name: 'Técnico em Eletrotécnica',
    short_name: 'TET-2024',
    category: 'Cursos Técnicos',
    start_date: daysAgo(60),
    end_date: daysFromNow(210),
    last_sync: daysAgo(0),
    created_at: daysAgo(60),
    updated_at: daysAgo(0),
    students_count: 28,
    at_risk_count: 3,
  },
  {
    id: 'course-3',
    moodle_course_id: '103',
    name: 'Qualificação em Soldagem',
    short_name: 'QS-2024',
    category: 'Qualificação',
    start_date: daysAgo(30),
    end_date: daysFromNow(60),
    last_sync: daysAgo(1),
    created_at: daysAgo(30),
    updated_at: daysAgo(1),
    students_count: 18,
    at_risk_count: 2,
  },
];

// Mock Students
export const mockStudents: Student[] = [
  {
    id: 'student-1',
    moodle_user_id: '2001',
    full_name: 'João Pedro Santos',
    email: 'joao.santos@email.com',
    current_risk_level: 'critico',
    risk_reasons: ['atividades_atrasadas', 'sem_acesso_recente', 'nao_responde'],
    tags: ['baixo desempenho', 'faltoso'],
    last_access: daysAgo(12),
    created_at: daysAgo(90),
    updated_at: daysAgo(1),
  },
  {
    id: 'student-2',
    moodle_user_id: '2002',
    full_name: 'Ana Carolina Oliveira',
    email: 'ana.oliveira@email.com',
    current_risk_level: 'risco',
    risk_reasons: ['atividades_atrasadas', 'baixa_nota'],
    tags: ['baixo desempenho'],
    last_access: daysAgo(5),
    created_at: daysAgo(90),
    updated_at: daysAgo(2),
  },
  {
    id: 'student-3',
    moodle_user_id: '2003',
    full_name: 'Carlos Eduardo Lima',
    email: 'carlos.lima@email.com',
    current_risk_level: 'atencao',
    risk_reasons: ['baixa_nota'],
    tags: [],
    last_access: daysAgo(2),
    created_at: daysAgo(90),
    updated_at: daysAgo(2),
  },
  {
    id: 'student-4',
    moodle_user_id: '2004',
    full_name: 'Mariana Costa Silva',
    email: 'mariana.silva@email.com',
    current_risk_level: 'normal',
    risk_reasons: [],
    tags: [],
    last_access: daysAgo(1),
    created_at: daysAgo(90),
    updated_at: daysAgo(1),
  },
  {
    id: 'student-5',
    moodle_user_id: '2005',
    full_name: 'Pedro Henrique Almeida',
    email: 'pedro.almeida@email.com',
    current_risk_level: 'risco',
    risk_reasons: ['sem_acesso_recente', 'nao_responde'],
    tags: ['sem acesso'],
    last_access: daysAgo(8),
    created_at: daysAgo(60),
    updated_at: daysAgo(1),
  },
  {
    id: 'student-6',
    moodle_user_id: '2006',
    full_name: 'Fernanda Rodrigues',
    email: 'fernanda.rodrigues@email.com',
    current_risk_level: 'critico',
    risk_reasons: ['atividades_atrasadas', 'baixa_nota', 'nao_responde'],
    tags: ['baixo desempenho', 'faltoso'],
    last_access: daysAgo(15),
    created_at: daysAgo(60),
    updated_at: daysAgo(0),
  },
];

// Mock Activity Feed
export const mockActivityFeed: ActivityFeedItem[] = [
  {
    id: 'feed-1',
    user_id: 'mock-user-id',
    student_id: 'student-6',
    event_type: 'risk_change',
    title: 'Nível de risco alterado',
    description: 'Fernanda Rodrigues passou de Risco para Crítico',
    created_at: daysAgo(0),
    student: mockStudents[5],
  },
  {
    id: 'feed-2',
    user_id: 'mock-user-id',
    student_id: 'student-1',
    course_id: 'course-1',
    event_type: 'task_created',
    title: 'Pendência criada',
    description: 'Nova pendência registrada para João Pedro Santos',
    created_at: daysAgo(3),
    student: mockStudents[0],
  },
  {
    id: 'feed-3',
    user_id: 'mock-user-id',
    student_id: 'student-2',
    event_type: 'note_created',
    title: 'Nota adicionada',
    description: 'Registro sobre desempenho de Ana Carolina Oliveira',
    created_at: daysAgo(5),
    student: mockStudents[1],
  },
  {
    id: 'feed-4',
    user_id: 'mock-user-id',
    student_id: 'student-3',
    event_type: 'task_resolved',
    title: 'Pendência resolvida',
    description: 'Carlos Eduardo Lima entregou atividade atrasada',
    created_at: daysAgo(7),
    student: mockStudents[2],
  },
];

// Weekly summary computed from mock data
export const mockWeeklySummary: WeeklySummary = {
  today_events: 0,
  today_tasks: 0,
  activities_to_review: 0,
  active_normal_students: mockStudents.filter(s => s.current_risk_level === 'normal').length,
  pending_submission_assignments: 0,
  pending_correction_assignments: 0,
  students_at_risk: mockStudents.filter(s => ['risco', 'critico'].includes(s.current_risk_level)).length,
  new_at_risk_this_week: 1,
};

// Helper function to get risk level label
export const getRiskLevelLabel = (level: RiskLevel): string => {
  const labels: Record<RiskLevel, string> = {
    normal: 'Normal',
    atencao: 'Atenção',
    risco: 'Risco',
    critico: 'Crítico',
    inativo: 'Inativo',
  };
  return labels[level];
};

// Helper to get students by course
export const getStudentsByCourse = (courseId: string): Student[] => {
  // In a real app, this would filter by course relationship
  return mockStudents;
};

