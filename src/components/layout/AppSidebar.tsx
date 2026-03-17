import { 
  LayoutDashboard, 
  Users, 
  ClipboardList, 
  FileSpreadsheet,
  Settings,
  LogOut,
  BookOpen,
  Building2,
  MessageSquare,
  Sparkles,
  Shield,
  ChevronDown
} from 'lucide-react';
import { ClarisIcon } from '@/components/ui/claris-logo';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { SupportButton } from '@/components/support/SupportButton';
import { useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const mainNavItems = [
  { title: 'Resumo da Semana', url: '/', icon: LayoutDashboard },
  { title: 'Meus Cursos', url: '/meus-cursos', icon: BookOpen },
  { title: 'Escolas', url: '/escolas', icon: Building2 },
  { title: 'Alunos', url: '/alunos', icon: Users },
  { title: 'Pendências', url: '/pendencias', icon: ClipboardList },
  { title: 'Mensagens', url: '/mensagens', icon: MessageSquare },
  { title: 'Claris IA', url: '/claris', icon: Sparkles },
  { title: 'Relatórios', url: '/relatorios', icon: FileSpreadsheet },
];

const secondaryNavItems = [
  { title: 'Configurações', url: '/configuracoes', icon: Settings },
];

const adminNavItems = [
  { title: 'Painel', url: '/admin' },
  { title: 'Usuários', url: '/admin/usuarios' },
  { title: 'Métricas de Uso', url: '/admin/metricas' },
  { title: 'Logs de Erro', url: '/admin/logs-erros' },
  { title: 'Suporte', url: '/admin/suporte' },
  { title: 'Conversas Claris', url: '/admin/conversas-claris' },
  { title: 'Configurações', url: '/admin/configuracoes' },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const { isAdmin } = usePermissions();
  const location = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const isAdminRoute = location.pathname.startsWith('/admin');
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(isAdminRoute);

  useEffect(() => {
    if (isAdminRoute) {
      setIsAdminMenuOpen(true);
    }
  }, [isAdminRoute]);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden">
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
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
            {!isCollapsed && 'Menu Principal'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
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
              {secondaryNavItems.map((item) => (
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
                        tooltip="Administração"
                        className="justify-between"
                        isActive={isAdminRoute}
                      >
                        <span className="flex items-center gap-3">
                          <Shield className="h-4 w-4 shrink-0" />
                          {!isCollapsed && <span>Administração</span>}
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
                          <SidebarMenuSubButton asChild isActive={location.pathname === item.url}>
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
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground text-sm font-medium">
              {user.full_name.charAt(0)}
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {user.full_name}
                </p>
                <p className="text-xs text-sidebar-foreground/60 truncate">
                  {user.moodle_username}
                </p>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
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
