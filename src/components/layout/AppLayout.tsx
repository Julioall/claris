import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { TopBar } from './TopBar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { SyncProgressDialog } from '@/components/sync/SyncProgressDialog';

export function AppLayout() {
  const { isAuthenticated, syncProgress, closeSyncProgress } = useAuth();

  if (!isAuthenticated) {
    return <Outlet />;
  }

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
        </div>
      </div>
      
      {/* Sync Progress Dialog */}
      <SyncProgressDialog
        open={syncProgress.isOpen}
        onOpenChange={(open) => !open && closeSyncProgress()}
        steps={syncProgress.steps}
        currentStep={syncProgress.currentStep}
        isComplete={syncProgress.isComplete}
        onClose={closeSyncProgress}
        summary={syncProgress.summary}
      />
    </SidebarProvider>
  );
}
