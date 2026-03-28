import type { ReactNode } from 'react';
import { Component } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AdminErrorBoundaryProps {
  children: ReactNode;
}

interface AdminErrorBoundaryBaseProps {
  children: ReactNode;
  resetKey: string;
  onGoToAdminHome: () => void;
}

interface AdminErrorBoundaryBaseState {
  hasError: boolean;
}

class AdminErrorBoundaryBase extends Component<
  AdminErrorBoundaryBaseProps,
  AdminErrorBoundaryBaseState
> {
  constructor(props: AdminErrorBoundaryBaseProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): AdminErrorBoundaryBaseState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Admin route error boundary caught an error:', error);
  }

  componentDidUpdate(prevProps: AdminErrorBoundaryBaseProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  handleTryAgain = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Erro ao carregar tela administrativa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ocorreu uma falha ao carregar esta página do painel admin. Você pode tentar novamente
              sem sair da aplicação.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={this.handleTryAgain}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Tentar novamente
              </Button>
              <Button variant="outline" onClick={this.props.onGoToAdminHome}>
                Ir para painel admin
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}

export function AdminErrorBoundary({ children }: AdminErrorBoundaryProps) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <AdminErrorBoundaryBase
      resetKey={location.key ?? location.pathname}
      onGoToAdminHome={() => navigate('/admin')}
    >
      {children}
    </AdminErrorBoundaryBase>
  );
}
