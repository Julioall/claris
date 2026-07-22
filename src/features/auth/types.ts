import type { Course } from '@/features/courses/types';

export interface User {
  id: string;
  full_name: string;
  email?: string;
  avatar_url?: string;
  last_login?: string;
  last_sync?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isSyncing: boolean;
  isAuthenticated: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<boolean>;
  logout: () => Promise<void>;
  syncData: () => Promise<void>;
  lastSync: string | null;
}

export interface AuthCourseState {
  courses: Course[];
}
