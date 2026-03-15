import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Bell, Pencil, Sparkles, WifiOff, CheckCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type NotificationSeverity = 'info' | 'warning' | 'critical';

interface NotificationItem {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  created_at: string | null;
  metadata: unknown;
}

const NOTIFICATION_LAST_SEEN_PREFIX = 'notifications-last-seen:';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNotificationSeverity(metadata: unknown): NotificationSeverity {
  if (!isRecord(metadata)) return 'info';
  const severity = String(metadata.severity || 'info').toLowerCase();
  if (severity === 'critical' || severity === 'warning') return severity;
  return 'info';
}

function getSeverityBadgeVariant(severity: NotificationSeverity): 'outline' | 'secondary' | 'destructive' {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'secondary';
  return 'outline';
}

function formatNotificationDate(value: string | null): string {
  if (!value) return 'Sem data';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sem data';
  return format(parsed, "dd/MM 'às' HH:mm", { locale: ptBR });
}

export function TopBar() {
  const location = useLocation();
  const {
    user,
    syncData,
    lastSync,
    isSyncing,
    isEditMode,
    setIsEditMode,
    isOfflineMode
  } = useAuth();
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);

  const storageKey = useMemo(() => {
    if (!user?.id) return null;
    return `${NOTIFICATION_LAST_SEEN_PREFIX}${user.id}`;
  }, [user?.id]);

  useEffect(() => {
    if (!storageKey) {
      setLastSeenAt(null);
      return;
    }
    const storedValue = window.localStorage.getItem(storageKey);
    setLastSeenAt(storedValue);
  }, [storageKey]);

  const markNotificationsAsSeen = () => {
    if (!storageKey) return;
    const nowIso = new Date().toISOString();
    setLastSeenAt(nowIso);
    window.localStorage.setItem(storageKey, nowIso);
  };

  const fetchNotifications = async () => {
    if (!user?.id) {
      setNotifications([]);
      return;
    }

    setIsLoadingNotifications(true);
    try {
      const { data, error } = await supabase
        .from('activity_feed')
        .select('id, title, description, event_type, created_at, metadata')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;

      setNotifications((data || []) as NotificationItem[]);
    } catch (error) {
      console.error('Falha ao carregar notificações', error);
      setNotifications([]);
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [user?.id]);

  const unreadCount = useMemo(() => {
    if (notifications.length === 0) return 0;
    if (!lastSeenAt) return notifications.length;

    const lastSeenTime = new Date(lastSeenAt).getTime();
    if (Number.isNaN(lastSeenTime)) return notifications.length;

    return notifications.filter(item => {
      if (!item.created_at) return false;
      const createdAtTime = new Date(item.created_at).getTime();
      if (Number.isNaN(createdAtTime)) return false;
      return createdAtTime > lastSeenTime;
    }).length;
  }, [lastSeenAt, notifications]);

  const unreadCountLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  const handleNotificationOpenChange = (open: boolean) => {
    setNotificationOpen(open);
    if (open) {
      fetchNotifications();
      if (unreadCount > 0) {
        markNotificationsAsSeen();
      }
    }
  };

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

        <Button variant="outline" size="sm" className="gap-2" asChild>
          <Link to={`/claris?context=${encodeURIComponent(location.pathname)}`} aria-label="Abrir Claris IA expandida">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Claris IA</span>
          </Link>
        </Button>

        {/* Notifications */}
        <Popover open={notificationOpen} onOpenChange={handleNotificationOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-medium">
                  {unreadCountLabel}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[340px] p-0">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div>
                <p className="text-sm font-medium">Notificações</p>
                <p className="text-xs text-muted-foreground">{notifications.length} itens</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={markNotificationsAsSeen}
                disabled={notifications.length === 0}
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Marcar lidas
              </Button>
            </div>

            <ScrollArea className="max-h-[360px]">
              {isLoadingNotifications ? (
                <div className="px-3 py-4 text-xs text-muted-foreground">Carregando notificações...</div>
              ) : notifications.length === 0 ? (
                <div className="px-3 py-4 text-xs text-muted-foreground">Nenhuma notificação no momento.</div>
              ) : (
                <div className="divide-y">
                  {notifications.map(notification => {
                    const severity = getNotificationSeverity(notification.metadata);
                    const isUnread = (() => {
                      if (!notification.created_at) return false;
                      if (!lastSeenAt) return true;
                      const createdAt = new Date(notification.created_at).getTime();
                      const seenAt = new Date(lastSeenAt).getTime();
                      if (Number.isNaN(createdAt) || Number.isNaN(seenAt)) return true;
                      return createdAt > seenAt;
                    })();

                    return (
                      <div key={notification.id} className="px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-snug">{notification.title}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isUnread && <span className="h-2 w-2 rounded-full bg-primary" />}
                            <Badge variant={getSeverityBadgeVariant(severity)} className="text-[10px]">
                              {severity === 'critical' ? 'Crítico' : severity === 'warning' ? 'Atenção' : 'Info'}
                            </Badge>
                          </div>
                        </div>
                        {notification.description && (
                          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{notification.description}</p>
                        )}
                        <p className="mt-1 text-[11px] text-muted-foreground">{formatNotificationDate(notification.created_at)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

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
