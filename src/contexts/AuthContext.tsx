import React, { createContext, useContext, useMemo, useState } from 'react';

import type { AuthContextType } from '@/features/auth/types';
import type { Course } from '@/features/courses/types';
import { MoodleSessionProvider } from '@/modules/auth/context/MoodleSessionContext';
import type { MoodleSession } from '@/modules/auth/domain/session';
import type { CourseScopedSyncEntity, SyncProgress } from '@/modules/auth/domain/sync';
import { useAuthSession } from '@/modules/auth/hooks/useAuthSession';
import { useCourseSync } from '@/modules/auth/hooks/useCourseSync';

interface ExtendedAuthContextType extends AuthContextType {
  moodleSession: MoodleSession | null;
  courses: Course[];
  setCourses: (courses: Course[]) => void;
  syncProgress: SyncProgress;
  closeSyncProgress: () => void;
  syncSelectedCourses: (courseIds: string[]) => Promise<void>;
  syncStudentsIncremental: (courseIds: string[]) => Promise<void>;
  syncCourseIncremental: (courseId: string, entities?: CourseScopedSyncEntity[]) => Promise<void>;
  showCourseSelector: boolean;
  setShowCourseSelector: (show: boolean) => void;
  isEditMode: boolean;
  setIsEditMode: (mode: boolean) => void;
  isOfflineMode: boolean;
}

const AuthContext = createContext<ExtendedAuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authSession = useAuthSession();
  const courseSync = useCourseSync({
    userId: authSession.user?.id,
    resolveSessionContext: authSession.resolveSessionContext,
    clearInvalidSession: authSession.clearInvalidSession,
    setLastSync: authSession.setLastSync,
  });
  const [isEditMode, setIsEditMode] = useState(false);

  const value = useMemo<ExtendedAuthContextType>(() => ({
    user: authSession.user,
    isLoading: authSession.isLoading,
    isSyncing: courseSync.isSyncing,
    isAuthenticated: !!authSession.user,
    login: authSession.login,
    logout: authSession.logout,
    syncData: courseSync.syncData,
    lastSync: authSession.lastSync,
    moodleSession: authSession.moodleSession,
    courses: courseSync.courses,
    setCourses: courseSync.setCourses,
    syncProgress: courseSync.syncProgress,
    closeSyncProgress: courseSync.closeSyncProgress,
    syncSelectedCourses: courseSync.syncSelectedCourses,
    syncStudentsIncremental: courseSync.syncStudentsIncremental,
    syncCourseIncremental: courseSync.syncCourseIncremental,
    showCourseSelector: courseSync.showCourseSelector,
    setShowCourseSelector: courseSync.setShowCourseSelector,
    isEditMode,
    setIsEditMode,
    isOfflineMode: !!authSession.user && !authSession.moodleSession,
  }), [authSession, courseSync, isEditMode]);

  return (
    <MoodleSessionProvider value={authSession.moodleSession}>
      <AuthContext.Provider value={value}>
        {children}
      </AuthContext.Provider>
    </MoodleSessionProvider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
