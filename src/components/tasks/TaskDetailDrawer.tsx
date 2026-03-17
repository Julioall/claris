import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TagInput } from '@/components/ui/TagInput';
import { Send, Clock, MessageCircle, Tag as TagIcon } from 'lucide-react';
import { useTaskDetail } from '@/hooks/useTasks';
import type { Task } from '@/types';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const FIELD_LABELS: Record<string, string> = {
  title: 'Título',
  description: 'Descrição',
  status: 'Status',
  priority: 'Prioridade',
  assigned_to: 'Responsável',
  due_date: 'Prazo',
};

const STATUS_LABELS: Record<string, string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  done: 'Concluído',
};

interface TaskDetailDrawerProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
}

export function TaskDetailDrawer({ task, open, onClose }: TaskDetailDrawerProps) {
  const [newComment, setNewComment] = useState('');
  const { comments, history, tags, addComment, addTag, removeTag, isAddingComment } = useTaskDetail(task?.id ?? null);

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    addComment(newComment.trim());
    setNewComment('');
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="text-left leading-snug">{task?.title}</SheetTitle>
          {task?.description && (
            <SheetDescription className="text-left text-sm">{task.description}</SheetDescription>
          )}
        </SheetHeader>

        <div className="px-6 py-3 border-b">
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <TagIcon className="h-3.5 w-3.5" />
            Tags
          </p>
          <TagInput
            tags={tags}
            onAdd={addTag}
            onRemove={removeTag}
          />
        </div>

        <Tabs defaultValue="comments" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-6 mt-3 w-auto justify-start">
            <TabsTrigger value="comments" className="gap-1.5 text-xs">
              <MessageCircle className="h-3.5 w-3.5" />
              Comentários
              {comments.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">{comments.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="comments" className="flex-1 flex flex-col min-h-0 mt-0">
            <ScrollArea className="flex-1 px-6 py-3">
              {comments.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-8">Nenhum comentário ainda</p>
              ) : (
                <div className="space-y-3">
                  {comments.map(c => (
                    <div key={c.id} className="rounded-lg bg-muted/50 p-3">
                      <p className="text-sm">{c.comment}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {format(parseISO(c.created_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <Separator />

            <div className="flex gap-2 px-6 py-3">
              <Textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder="Adicionar comentário..."
                rows={2}
                className="resize-none text-sm"
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleAddComment();
                  }
                }}
              />
              <Button
                size="icon"
                onClick={handleAddComment}
                disabled={!newComment.trim() || isAddingComment}
                className="shrink-0 self-end"
              >
                <Send className="h-4 w-4" />
                <span className="sr-only">Enviar comentário</span>
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="history" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-full px-6 py-3">
              {history.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-8">Nenhum histórico disponível</p>
              ) : (
                <div className="space-y-2">
                  {history.map(h => (
                    <div key={h.id} className="flex gap-2 text-xs">
                      <span className="mt-0.5 h-2 w-2 rounded-full bg-primary/50 shrink-0" />
                      <div>
                        <span className="font-medium">{FIELD_LABELS[h.field_changed] ?? h.field_changed}</span>
                        {' alterado de '}
                        <span className="text-muted-foreground">{STATUS_LABELS[h.old_value ?? ''] ?? h.old_value ?? '(vazio)'}</span>
                        {' para '}
                        <span className="font-medium">{STATUS_LABELS[h.new_value ?? ''] ?? h.new_value ?? '(vazio)'}</span>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {format(parseISO(h.created_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
