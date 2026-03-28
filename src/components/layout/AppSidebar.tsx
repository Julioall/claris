import {
  BookOpen,
  Building2,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Plug,
  Settings,
  Shield,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { NavLink } from '@/components/NavLink';
import { SupportButton } from '@/components/support/SupportButton';
import { Button } from '@/components/ui/button';
import { ClarisIcon } from '@/components/ui/claris-logo';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { APP_PERMISSIONS, type AppPermissionKey } from '@/lib/access-control';

type SidebarNavItem = {
  title: string;
  url: string;
  icon: React.ElementType;
  permission: AppPermissionKey;
};

const mainNavItems: SidebarNavItem[] = [
  { title: 'Resumo da Semana', url: '/', icon: LayoutDashboard, permission: APP_PERMISSIONS.DASHBOARD_VIEW },
  { title: 'Meus Cursos', url: '/meus-cursos', icon: BookOpen, permission: APP_PERMISSIONS.COURSES_CATALOG_VIEW },
  { title: 'Escolas', url: '/escolas', icon: Building2, permission: APP_PERMISSIONS.SCHOOLS_VIEW },
  { title: 'Alunos', url: '/alunos', icon: Users, permission: APP_PERMISSIONS.STUDENTS_VIEW },
  { title: 'Tarefas', url: '/tarefas', icon: CheckSquare, permission: APP_PERMISSIONS.TASKS_VIEW },
  { title: 'Agenda', url: '/agenda', icon: CalendarDays, permission: APP_PERMISSIONS.AGENDA_VIEW },
  { title: 'Mensagens', url: '/mensagens', icon: MessageSquare, permission: APP_PERMISSIONS.MESSAGES_VIEW },
  { title: 'WhatsApp', url: '/whatsapp', icon: MessageCircle, permission: APP_PERMISSIONS.WHATSAPP_VIEW },
  { title: 'Campanhas', url: '/campanhas', icon: Megaphone, permission: APP_PERMISSIONS.MESSAGES_BULK_SEND },
  { title: 'Automacoes', url: '/automacoes', icon: Zap, permission: APP_PERMISSIONS.AUTOMATIONS_VIEW },
  { title: 'Meus Servicos', url: '/meus-servicos', icon: Plug, permission: APP_PERMISSIONS.SERVICES_VIEW },
  { title: 'Claris IA', url: '/claris', icon: Sparkles, permission: APP_PERMISSIONS.CLARIS_VIEW },
  { title: 'Relatorios', url: '/relatorios', icon: FileSpreadsheet, permission: APP_PERMISSIONS.REPORTS_VIEW },
];

const secondaryNavItems: SidebarNavItem[] = [
  { title: 'Configuracoes', url: '/configuracoes', icon: Settings, permission: APP_PERMISSIONS.SETTINGS_VIEW },
];

const adminNavItems = [
  { title: 'Painel', url: '/admin' },
  { title: 'Jobs', url: '/admin/jobs' },
  { title: 'Usuarios', url: '/admin/usuarios' },
  { title: 'Grupos', url: '/admin/grupos' },
  { title: 'Metricas de Uso', url: '/admin/metricas' },
  { title: 'Logs de Erro', url: '/admin/logs-erros' },
  { title: 'Suporte', url: '/admin/suporte' },
  { title: 'Conversas Claris', url: '/admin/conversas-claris' },
  { title: 'Servicos da Aplicacao', url: '/admin/servicos-aplicacao' },
  { title: 'Configuracoes', url: '/admin/configuracoes' },
];

function isAdminNavItemActive(pathname: string, itemUrl: string) {
  if (itemUrl === '/admin') {
    return pathname === itemUrl;
  }

  return pathname === itemUrl || pathname.startsWith(`${itemUrl}/`);
}

export function AppSidebar() {
  const { user, logout } = useAuth();
  const { isAdmin, can } = usePermissions();
  const location = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const isAdminRoute = location.pathname.startsWith('/admin');
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(isAdminRoute);

  const visibleMainNavItems = useMemo(
    () => mainNavItems.filter((item) => can(item.permission)),
    [can],
  );
  const visibleSecondaryNavItems = useMemo(
    () => secondaryNavItems.filter((item) => can(item.permission)),
    [can],
  );

  useEffect(() => {
    if (isAdminRoute) {
      setIsAdminMenuOpen(true);
    }
  }, [isAdminRoute]);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg">
            <ClarisIcon className="h-full w-full text-primary" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-primary">Claris</span>
              <span className="text-xs text-sidebar-foreground/60">Central de Tutoria</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-sidebar-foreground/50">
            {!isCollapsed && 'Menu Principal'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-2 bg-sidebar-border" />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleSecondaryNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              <SidebarMenuItem>
                <SupportButton
                  size="default"
                  showLabel={!isCollapsed}
                  className="w-full justify-start gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                />
              </SidebarMenuItem>

              {isAdmin && (
                <Collapsible open={isAdminMenuOpen && !isCollapsed} onOpenChange={setIsAdminMenuOpen}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip="Administracao"
                        className="justify-between"
                        isActive={isAdminRoute}
                      >
                        <span className="flex items-center gap-3">
                          <Shield className="h-4 w-4 shrink-0" />
                          {!isCollapsed && <span>Administracao</span>}
                        </span>
                        {!isCollapsed && (
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 transition-transform ${isAdminMenuOpen ? 'rotate-180' : ''}`}
                          />
                        )}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                  </SidebarMenuItem>

                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {adminNavItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton asChild isActive={isAdminNavItemActive(location.pathname, item.url)}>
                            <NavLink to={item.url} end={item.url === '/admin'}>
                              <span>{item.title}</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {user && (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-sm font-medium text-sidebar-foreground">
              {user.full_name.charAt(0)}
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-sidebar-foreground">{user.full_name}</p>
                <p className="truncate text-xs text-sidebar-foreground/60">{user.moodle_username}</p>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              className="h-8 w-8 shrink-0 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
