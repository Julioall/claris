import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

interface BulkJobDetail {
  id: string;
  message_content: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  template_id: string | null;
}

interface Recipient {
  id: string;
  student_name: string;
  moodle_user_id: string;
  status: string;
  personalized_message: string | null;
  sent_at: string | null;
  error_message: string | null;
}

function RecipientStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
    pending: { label: 'Pendente', variant: 'outline', icon: <Clock className="h-3 w-3" /> },
    sent: { label: 'Enviado', variant: 'secondary', icon: <CheckCircle2 className="h-3 w-3" /> },
    failed: { label: 'Falhou', variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
    processing: { label: 'Enviando', variant: 'default', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  };
  const cfg = map[status] ?? { label: status, variant: 'outline' as const, icon: null };
  return (
    <Badge variant={cfg.variant} className="gap-1 text-xs">
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

interface JobDetailDialogProps {
  jobId: string | null;
  onClose: () => void;
}

export function JobDetailDialog({ jobId, onClose }: JobDetailDialogProps) {
  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ['bulk-job-detail', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bulk_message_jobs')
        .select('*')
        .eq('id', jobId!)
        .single();
      if (error) throw error;
      return data as BulkJobDetail;
    },
    enabled: !!jobId,
  });

  const { data: recipients = [], isLoading: recipientsLoading } = useQuery({
    queryKey: ['bulk-job-recipients', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bulk_message_recipients')
        .select('*')
        .eq('job_id', jobId!)
        .order('student_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Recipient[];
    },
    enabled: !!jobId,
    refetchInterval: job?.status === 'processing' ? 3000 : false,
  });

  const isLoading = jobLoading || recipientsLoading;

  const progress = job && job.total_recipients > 0
    ? Math.round(((job.sent_count + job.failed_count) / job.total_recipients) * 100)
    : 0;

  return (
    <Dialog open={!!jobId} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>Detalhes do Job de Envio</DialogTitle>
          <DialogDescription>
            {job
              ? `Criado em ${format(parseISO(job.created_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}`
              : 'Carregando...'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6" />
          </div>
        ) : job ? (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Job info */}
            <div className="px-6 py-4 border-b space-y-3 shrink-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="mt-1">
                    <Badge variant="outline">{job.status}</Badge>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-semibold mt-1">{job.total_recipients}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Enviados</p>
                  <p className="font-semibold mt-1 text-green-600">{job.sent_count}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Falhas</p>
                  <p className="font-semibold mt-1 text-destructive">{job.failed_count}</p>
                </div>
              </div>

              {(job.status === 'processing') && (
                <Progress value={progress} className="h-2" />
              )}

              {job.started_at && (
                <div className="flex gap-6 text-xs text-muted-foreground">
                  <span>Início: {format(parseISO(job.started_at), "HH:mm:ss", { locale: ptBR })}</span>
                  {job.completed_at && (
                    <span>Fim: {format(parseISO(job.completed_at), "HH:mm:ss", { locale: ptBR })}</span>
                  )}
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Mensagem base:</p>
                <p className="text-sm bg-muted/50 rounded-md p-3 whitespace-pre-wrap line-clamp-4">
                  {job.message_content}
                </p>
              </div>

              {job.error_message && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                  <p className="text-xs font-medium text-destructive">Erro:</p>
                  <p className="text-xs text-destructive/80 mt-0.5">{job.error_message}</p>
                </div>
              )}
            </div>

            {/* Recipients list */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-6 py-3 border-b shrink-0">
                <p className="text-sm font-medium">
                  Destinatários ({recipients.length})
                </p>
              </div>
              <ScrollArea className="flex-1 px-6">
                <div className="py-3 space-y-0">
                  {recipients.map((r, idx) => (
                    <div key={r.id}>
                      {idx > 0 && <Separator className="my-2" />}
                      <div className="flex items-start justify-between gap-3 py-1">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{r.student_name}</p>
                          {r.sent_at && (
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(r.sent_at), "HH:mm:ss", { locale: ptBR })}
                            </p>
                          )}
                          {r.error_message && (
                            <p className="text-xs text-destructive/80 line-clamp-1">{r.error_message}</p>
                          )}
                        </div>
                        <RecipientStatusBadge status={r.status} />
                      </div>
                    </div>
                  ))}
                  {recipients.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-6">
                      Nenhum destinatário encontrado
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-12">Job não encontrado</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
