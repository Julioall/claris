import { RefreshCw, Search, Bell, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
export function TopBar() {
  const {
    syncData,
    lastSync,
    isLoading,
    setShowCourseSelector,
    courses,
    isEditMode,
    setIsEditMode
  } = useAuth();
  const handleSync = () => {
    // If we have courses, show selector; otherwise trigger full sync
    if (courses.length > 0) {
      setShowCourseSelector(true);
    } else {
      syncData();
    }
  };
  const formatLastSync = (date: string | null) => {
    if (!date) return 'Nunca';
    return format(new Date(date), "dd/MM 'às' HH:mm", {
      locale: ptBR
    });
  };
  return <header className="sticky top-0 z-30 h-14 gap-4 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-4 md:px-6 flex items-center justify-end">
      <SidebarTrigger className="md:hidden" />
      
      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" placeholder="Buscar aluno..." className="pl-9 bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30" />
        </div>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Last sync info */}
        <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground mr-2">
          <span>Última sincronização:</span>
          <span className="font-medium">{formatLastSync(lastSync)}</span>
        </div>

        {/* Sync button */}
        <Button variant="outline" size="sm" onClick={handleSync} disabled={isLoading} className="gap-2">
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          <span className="hidden sm:inline">Sincronizar</span>
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-medium">
            3
          </span>
        </Button>

        {/* Edit mode toggle */}
        <div className={cn("flex items-center gap-2 pl-2 border-l border-border", isEditMode && "text-primary")}>
          <Switch id="edit-mode" checked={isEditMode} onCheckedChange={setIsEditMode} />
          <Label htmlFor="edit-mode" className={cn("text-xs cursor-pointer hidden sm:inline", isEditMode ? "text-primary font-medium" : "text-muted-foreground")}>
            <Pencil className="h-3 w-3 inline mr-1" />
            Editar
          </Label>
        </div>
      </div>
    </header>;
}