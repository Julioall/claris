import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

interface SupportButtonProps {
  className?: string;
}

export function SupportButton({ className }: SupportButtonProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>('problema');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      toast({
        title: 'Preencha todos os campos',
        description: 'Titulo e descricao sao obrigatorios.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('support_tickets').insert({
        user_id: user?.id ?? null,
        type,
        title: title.trim(),
        description: description.trim(),
        route: location.pathname,
        context: {
          userAgent: navigator.userAgent,
          url: window.location.href,
        },
      });

      if (error) throw error;

      toast({ title: 'Ticket enviado com sucesso', description: 'Entraremos em contato em breve.' });
      setOpen(false);
      setTitle('');
      setDescription('');
      setType('problema');
    } catch {
      toast({ title: 'Erro ao enviar ticket', description: 'Tente novamente mais tarde.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        title="Suporte"
        className={className}
      >
        <LifeBuoy className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Abrir ticket de suporte</DialogTitle>
            <DialogDescription>
              Relate um problema ou envie uma sugestao. Nossa equipe ira analisar em breve.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="support-type">Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="support-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="problema">Problema</SelectItem>
                  <SelectItem value="sugestao">Sugestao</SelectItem>
                  <SelectItem value="duvida">Duvida</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="support-title">Titulo</Label>
              <Input
                id="support-title"
                placeholder="Resumo breve do problema ou sugestao"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="support-description">Descricao</Label>
              <Textarea
                id="support-description"
                placeholder="Descreva com detalhes o que aconteceu ou o que voce gostaria de ver..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                disabled={isSubmitting}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Rota atual: <span className="font-mono">{location.pathname}</span>
            </p>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Enviando...' : 'Enviar ticket'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
