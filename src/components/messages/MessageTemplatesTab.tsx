import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Star, StarOff, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DynamicVariableInput, DYNAMIC_VARIABLES } from './DynamicVariableInput';
import { HighlightedVariableText } from './HighlightedVariableText';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { MESSAGE_TEMPLATE_CATEGORIES } from '@/lib/message-template-defaults';
import { ensureDefaultMessageTemplates } from '@/lib/message-template-seeding';

interface MessageTemplate {
  id: string;
  title: string;
  content: string;
  category: string | null;
  is_favorite: boolean | null;
  created_at: string;
  updated_at: string;
}

export function MessageTemplatesTab() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('geral');
  const [isSaving, setIsSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('todos');

  const fetchTemplates = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      await ensureDefaultMessageTemplates(user.id);

      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('is_favorite', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setTemplates((data || []) as MessageTemplate[]);
    } catch {
      toast.error('Erro ao carregar modelos');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const openNew = () => {
    setEditingTemplate(null);
    setFormTitle('');
    setFormContent('');
    setFormCategory('geral');
    setEditDialogOpen(true);
  };

  const openEdit = (t: MessageTemplate) => {
    setEditingTemplate(t);
    setFormTitle(t.title);
    setFormContent(t.content);
    setFormCategory(t.category || 'geral');
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user || !formTitle.trim() || !formContent.trim()) return;
    setIsSaving(true);
    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from('message_templates')
          .update({ title: formTitle.trim(), content: formContent.trim(), category: formCategory, updated_at: new Date().toISOString() })
          .eq('id', editingTemplate.id)
          .eq('user_id', user.id);
        if (error) throw error;
        toast.success('Modelo atualizado');
      } else {
        const { error } = await supabase
          .from('message_templates')
          .insert({ user_id: user.id, title: formTitle.trim(), content: formContent.trim(), category: formCategory });
        if (error) throw error;
        toast.success('Modelo criado');
      }
      setEditDialogOpen(false);
      fetchTemplates();
    } catch {
      toast.error('Erro ao salvar modelo');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingTemplate || !user) return;
    try {
      const { error } = await supabase
        .from('message_templates')
        .delete()
        .eq('id', editingTemplate.id)
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success('Modelo excluído');
      setDeleteDialogOpen(false);
      setEditDialogOpen(false);
      fetchTemplates();
    } catch {
      toast.error('Erro ao excluir modelo');
    }
  };

  const toggleFavorite = async (t: MessageTemplate) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('message_templates')
        .update({ is_favorite: !t.is_favorite })
        .eq('id', t.id)
        .eq('user_id', user.id);
      if (error) throw error;
      fetchTemplates();
    } catch {
      toast.error('Erro ao atualizar favorito');
    }
  };

  const copyContent = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success('Conteúdo copiado');
  };

  const filteredTemplates = filterCategory === 'todos'
    ? templates
    : templates.filter(t => t.category === filterCategory);

  const getCategoryLabel = (value: string | null) =>
    MESSAGE_TEMPLATE_CATEGORIES.find(c => c.value === value)?.label || value || 'Geral';

  // Count variables in template
  const countVariables = (content: string) => {
    const matches = content.match(/\{[a-z_]+\}/g);
    return matches ? new Set(matches).size : 0;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas categorias</SelectItem>
            {MESSAGE_TEMPLATE_CATEGORIES.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Novo Modelo
        </Button>
      </div>

      {/* Template list */}
      <ScrollArea className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm">
              {filterCategory === 'todos' ? 'Nenhum modelo criado ainda' : 'Nenhum modelo nesta categoria'}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" />
              Criar primeiro modelo
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredTemplates.map(t => (
              <Card key={t.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openEdit(t)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{t.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px]">{getCategoryLabel(t.category)}</Badge>
                        {t.is_favorite && (
                          <Badge variant="secondary" className="text-[10px]">★</Badge>
                        )}
                        {countVariables(t.content) > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {countVariables(t.content)} variáveis
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(t); }}
                      >
                        {t.is_favorite ? (
                          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                        ) : (
                          <StarOff className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); copyContent(t.content); }}
                      >
                        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                    <HighlightedVariableText text={t.content} />
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Edit/Create Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Editar Modelo' : 'Novo Modelo de Mensagem'}
            </DialogTitle>
            <DialogDescription>
              Os modelos sao salvos por usuario. Edicoes e exclusoes afetam apenas a sua conta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="Ex: Lembrete de atividade"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESSAGE_TEMPLATE_CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Conteúdo da mensagem</Label>
              <DynamicVariableInput
                value={formContent}
                onChange={setFormContent}
                placeholder="Digite o texto do modelo... Use / para inserir variáveis dinâmicas"
                rows={8}
              />
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between">
            <div>
              {editingTemplate && (
                <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Excluir
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isSaving || !formTitle.trim() || !formContent.trim()}>
                {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingTemplate ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O modelo "{editingTemplate?.title}" será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
