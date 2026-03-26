import { Outlet, useLocation } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { TopBar } from './TopBar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { SyncProgressDialog } from '@/components/sync/SyncProgressDialog';
import { CourseSelectorDialog } from '@/components/sync/CourseSelectorDialog';
import { AppFooter } from '@/components/layout/AppFooter';
import { FloatingClarisChat } from '@/features/claris/components/FloatingClarisChat';

export function AppLayout() {
  const location = useLocation();
  const { 
    isAuthenticated, 
    syncProgress, 
    closeSyncProgress,
    courses,
    syncSelectedCourses,
    showCourseSelector,
    setShowCourseSelector,
    isSyncing,
  } = useAuth();

  if (!isAuthenticated) {
    return <Outlet />;
  }

  const shouldHideFloatingClaris = location.pathname === '/claris';

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <main className="flex-1 overflow-auto">
            <div className="container py-6 px-4 md:px-6 lg:px-8 max-w-7xl">
              <Outlet />
            </div>
          </main>
          <AppFooter />
        </div>
      </div>
      
      {/* Course Selector Dialog */}
      <CourseSelectorDialog
        open={showCourseSelector}
        onOpenChange={setShowCourseSelector}
        courses={courses}
        onSync={syncSelectedCourses}
        isLoading={isSyncing}
      />
      
      {/* Sync Progress Dialog */}
      <SyncProgressDialog
        open={syncProgress.isOpen}
        onOpenChange={(open) => !open && closeSyncProgress()}
        steps={syncProgress.steps}
        currentStep={syncProgress.currentStep}
        isComplete={syncProgress.isComplete}
        onClose={closeSyncProgress}
      />
      {!shouldHideFloatingClaris && <FloatingClarisChat />}
    </SidebarProvider>
  );
}
