import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Settings,
  Users,
  Activity,
  AlertTriangle,
  LifeBuoy,
  MessageSquare,
  ChevronLeft,
} from 'lucide-react';
import { ClarisIcon } from '@/components/ui/claris-logo';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useNavigate } from 'react-router-dom';

const adminNavItems = [
  { title: 'Painel', url: '/admin', icon: LayoutDashboard, end: true },
  { title: 'Configurações', url: '/admin/configuracoes', icon: Settings },
  { title: 'Usuários', url: '/admin/usuarios', icon: Users },
  { title: 'Métricas de Uso', url: '/admin/metricas', icon: Activity },
  { title: 'Logs de Erro', url: '/admin/logs-erros', icon: AlertTriangle },
  { title: 'Suporte', url: '/admin/suporte', icon: LifeBuoy },
  { title: 'Conversas Claris', url: '/admin/conversas-claris', icon: MessageSquare },
];

export function AdminSidebar() {
  const navigate = useNavigate();

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col min-h-screen">
      <div className="p-4 flex items-center gap-3 border-b border-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
          <ClarisIcon className="h-full w-full text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-primary text-sm">Claris Admin</span>
          <span className="text-xs text-muted-foreground">Painel Administrativo</span>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {adminNavItems.map((item) => (
          <NavLink
            key={item.title}
            to={item.url}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.title}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-border">
        <Separator className="mb-3" />
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate('/')}
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar ao app
        </Button>
      </div>
    </aside>
  );
}
