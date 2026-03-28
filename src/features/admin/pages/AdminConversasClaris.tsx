import { Fragment, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAdminConversations } from '../api/conversations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';

interface Conversation {
  id: string;
  user_id: string;
  title: string;
  messages: unknown[];
  last_context_route: string | null;
  created_at: string;
  updated_at: string;
}

const PAGE_SIZE = 30;

export default function AdminConversasClaris() {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-claris-conversations', search, page],
    queryFn: async () => {
      return listAdminConversations({
        search,
        page,
        pageSize: PAGE_SIZE,
      });
    },
  });

  const conversations = (data?.items ?? []) as Conversation[];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conversas Claris</h1>
        <p className="text-muted-foreground">Historico de conversas com a Claris IA para analise e melhoria</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por titulo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">{totalCount} conversa(s)</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhuma conversa encontrada.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titulo</TableHead>
                  <TableHead className="w-[160px]">Ultima rota</TableHead>
                  <TableHead className="w-[80px]">Msgs</TableHead>
                  <TableHead className="w-[160px]">Atualizado</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversations.map((conv) => {
                  const messages = Array.isArray(conv.messages) ? conv.messages : [];
                  return (
                    <Fragment key={conv.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
                      >
                        <TableCell className="text-sm font-medium">{conv.title}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{conv.last_context_route ?? '—'}</TableCell>
                        <TableCell className="text-sm">{messages.length}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(conv.updated_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          {expandedId === conv.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </TableCell>
                      </TableRow>
                      {expandedId === conv.id && (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-muted/30 p-4">
                            <div className="space-y-2 max-h-64 overflow-auto">
                              {messages.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Nenhuma mensagem.</p>
                              ) : (
                                messages.map((msg: unknown, idx) => {
                                  const m = msg as Record<string, unknown>;
                                  return (
                                    <div
                                      key={idx}
                                      className={`text-xs p-2 rounded ${m.role === 'user' ? 'bg-primary/10' : 'bg-muted'}`}
                                    >
                                      <span className="font-medium capitalize">{String(m.role ?? 'unknown')}: </span>
                                      <span>{String(m.content ?? '')}</span>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalCount > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Exibindo {(page - 1) * PAGE_SIZE + (conversations.length > 0 ? 1 : 0)}-{(page - 1) * PAGE_SIZE + conversations.length} de {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
            >
              Próxima
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
