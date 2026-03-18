import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { TagInput } from '@/components/ui/TagInput';
import { Send, MessageCircle, Tag as TagIcon, Sparkles } from 'lucide-react';
import { useTaskDetail } from '@/hooks/useTasks';
import type { Task } from '@/types';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TaskDetailDrawerProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
}

export function TaskDetailDrawer({ task, open, onClose }: TaskDetailDrawerProps) {
  const [newComment, setNewComment] = useState('');
  const { comments, tags, addComment, addTag, removeTag, isAddingComment } = useTaskDetail(task?.id ?? null);

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    addComment(newComment.trim());
    setNewComment('');
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start gap-2">
            <SheetTitle className="text-left leading-snug flex-1">{task?.title}</SheetTitle>
            {task?.suggested_by_ai && (
              <Badge variant="outline" className="shrink-0 gap-1 text-xs text-purple-600 border-purple-200 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800">
                <Sparkles className="h-3 w-3" />
                Claris IA
              </Badge>
            )}
          </div>
          {task?.description && (
            <SheetDescription className="text-left text-sm">{task.description}</SheetDescription>
          )}
          {task?.origin_reason && (
            <p className="text-xs text-muted-foreground/70 italic mt-1">{task.origin_reason}</p>
          )}
        </SheetHeader>

        <div className="px-6 py-3 border-b">
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <TagIcon className="h-3.5 w-3.5" />
            Tags
          </p>
          {/* Show AI-generated text tags (read-only) */}
          {task?.ai_tags && task.ai_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {task.ai_tags.map(tag => (
                <Badge key={tag} variant="outline" className="text-[10px] gap-0.5 text-purple-600 border-purple-200 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800">
                  <Sparkles className="h-2.5 w-2.5" />
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          <TagInput
            tags={tags}
            onAdd={addTag}
            onRemove={removeTag}
          />
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-3 pb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MessageCircle className="h-3.5 w-3.5" />
            Comentários
            {comments.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">{comments.length}</Badge>
            )}
          </div>

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
        </div>
      </SheetContent>
    </Sheet>
  );
}
