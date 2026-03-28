import type { Student } from '@/features/students/types';

export interface Course {
  id: string;
  moodle_course_id: string;
  name: string;
  short_name?: string;
  category?: string;
  start_date?: string;
  end_date?: string;
  effective_end_date?: string;
  last_sync?: string;
  created_at: string;
  updated_at: string;
  students_count?: number;
  at_risk_count?: number;
}

export interface CourseWithStats extends Course {
  students_count: number;
  at_risk_count: number;
  is_following: boolean;
  is_ignored: boolean;
  is_attendance_enabled: boolean;
  student_ids: string[];
}

export interface StudentActivity {
  id: string;
  student_id: string;
  course_id: string;
  moodle_activity_id: string;
  activity_name: string;
  activity_type: string | null;
  grade: number | null;
  grade_max: number | null;
  percentage: number | null;
  status: string | null;
  completed_at: string | null;
  submitted_at?: string | null;
  graded_at?: string | null;
  due_date: string | null;
  hidden: boolean;
}

export interface CoursePanelStats {
  totalStudents: number;
  atRiskStudents: number;
  totalActivities: number;
  completionRate: number;
  riskDistribution: {
    normal: number;
    atencao: number;
    risco: number;
    critico: number;
  };
}

export interface CoursePanelData {
  course: Course | null;
  students: Student[];
  activities: StudentActivity[];
  activitySubmissions: StudentActivity[];
  stats: CoursePanelStats;
}

export const EMPTY_COURSE_PANEL_STATS: CoursePanelStats = {
  totalStudents: 0,
  atRiskStudents: 0,
  totalActivities: 0,
  completionRate: 0,
  riskDistribution: {
    normal: 0,
    atencao: 0,
    risco: 0,
    critico: 0,
  },
};
