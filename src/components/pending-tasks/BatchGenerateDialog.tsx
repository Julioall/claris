import React, { useState, useEffect } from 'react';
import { Loader2, Zap, Users, BookTemplate } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface Template {
  id: string;
  title: string;
  auto_message_template: string | null;
  priority: string;
  task_type: string;
  description: string | null;
}

interface Course {
  id: string;
  short_name: string;
}

interface BatchGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function BatchGenerateDialog({ open, onOpenChange, onSuccess }: BatchGenerateDialogProps) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [sendMessage, setSendMessage] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && user) {
      setIsLoading(true);
      Promise.all([
        supabase
          .from('task_templates')
          .select('id, title, auto_message_template, priority, task_type, description')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('title'),
        supabase
          .from('user_courses')
          .select('course_id, courses!inner (id, short_name)')
          .eq('user_id', user.id),
      ]).then(([templatesRes, coursesRes]) => {
        setTemplates(templatesRes.data || []);
        const c = coursesRes.data
          ?.map(uc => uc.courses)
          .filter((c): c is { id: string; short_name: string | null } => !!c)
          .map(c => ({ id: c.id, short_name: c.short_name || '' })) || [];
        setCourses(c);
        setIsLoading(false);
      });
    }
  }, [open, user]);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  const handleGenerate = async () => {
    if (!user || !selectedTemplateId || !selectedCourseId) return;
    setIsGenerating(true);

    try {
      // Fetch students for the course
      const { data: studentData, error: studError } = await supabase
        .from('student_courses')
        .select('student_id, students!inner (id, full_name)')
        .eq('course_id', selectedCourseId);

      if (studError) throw studError;

      const students = studentData
        ?.map(sc => sc.students)
        .filter((s): s is { id: string; full_name: string } => !!s) || [];

      if (students.length === 0) {
        toast.info('Nenhum aluno encontrado neste curso.');
        return;
      }

      const template = selectedTemplate!;
      let created = 0;

      // Create a task for each student
      for (const student of students) {
        // Check if task already exists (avoid duplicates)
        const { data: existing } = await supabase
          .from('pending_tasks')
          .select('id')
          .eq('student_id', student.id)
          .eq('course_id', selectedCourseId)
          .eq('template_id', template.id)
          .in('status', ['aberta', 'em_andamento'])
          .maybeSingle();

        if (existing) continue;

        const { error: insertError } = await supabase
          .from('pending_tasks')
          .insert({
            title: template.title,
            description: template.description,
            student_id: student.id,
            course_id: selectedCourseId,
            template_id: template.id,
            task_type: template.task_type as any,
            priority: template.priority as any,
            created_by_user_id: user.id,
            status: 'aberta',
          } as any);

        if (!insertError) created++;
      }

      // Send messages if enabled and template has auto_message_template
      if (sendMessage && template.auto_message_template) {
        try {
          // Send batch via moodle-messaging edge function
          for (const student of students) {
            await supabase.functions.invoke('moodle-messaging', {
              body: {
                action: 'send',
                user_id: user.id,
                student_id: student.id,
                message: template.auto_message_template,
              },
            });
          }
          toast.success(`${created} pendências criadas e mensagens enviadas para ${students.length} alunos!`);
        } catch (msgError) {
          console.error('Error sending messages:', msgError);
          toast.success(`${created} pendências criadas!`, {
            description: 'Algumas mensagens podem não ter sido enviadas.',
          });
        }
      } else {
        toast.success(`${created} pendências criadas para ${students.length} alunos!`);
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error generating batch tasks:', error);
      toast.error('Erro ao gerar pendências em lote');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Gerar Pendências em Lote
          </DialogTitle>
          <DialogDescription>
            Crie pendências para todos os alunos de um curso usando um modelo.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8">
            <BookTemplate className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              Crie um modelo de pendência primeiro para gerar em lote.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Modelo *</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um modelo..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Curso *</Label>
              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o curso..." />
                </SelectTrigger>
                <SelectContent>
                  {courses.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.short_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTemplate?.auto_message_template && (
              <div 
                className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer"
                onClick={() => setSendMessage(!sendMessage)}
              >
                <Checkbox checked={sendMessage} onCheckedChange={(v) => setSendMessage(!!v)} className="mt-0.5" />
                <div>
                  <Label className="cursor-pointer font-medium">Enviar mensagem automática</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Envia a mensagem configurada no modelo para cada aluno via chat do Moodle.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating || !selectedTemplateId || !selectedCourseId}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Users className="h-4 w-4 mr-2" />
            )}
            Gerar em Lote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
