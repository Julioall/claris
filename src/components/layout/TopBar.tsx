import { RefreshCw, Search, Bell, Pencil, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
export function TopBar() {
  const {
    syncData,
    lastSync,
    isSyncing,
    isEditMode,
    setIsEditMode,
    isOfflineMode
  } = useAuth();
  const handleSync = () => {
    syncData();
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
        {isOfflineMode ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-2.5 py-1.5">
                <WifiOff className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Modo Offline</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>Moodle indisponível. Sincronização e mensagens desabilitadas.</TooltipContent>
          </Tooltip>
        ) : (
          <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing} className="gap-2">
            <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
            <span className="hidden sm:inline">Sincronizar</span>
          </Button>
        )}

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
