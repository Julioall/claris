import { BellRing, Clock3, Megaphone, MessageSquare, RotateCcw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const routines = [
  {
    title: 'Atividade atrasada',
    trigger: 'Atraso detectado na atividade',
    waitTime: '24h',
    action: 'Mensagem automatica com lembrete objetivo.',
    escalation: 'Escala para campanha da turma quando o atraso acumular.',
    icon: BellRing,
  },
  {
    title: 'Sem resposta',
    trigger: 'Aluno nao respondeu ao contato anterior',
    waitTime: '48h',
    action: 'Novo follow-up automatico com contexto do atendimento.',
    escalation: 'Encaminha para suporte manual no canal apropriado.',
    icon: MessageSquare,
  },
  {
    title: 'Nova atividade liberada',
    trigger: 'Nova entrega publicada no curso',
    waitTime: '1h',
    action: 'Mensagem automatica de ativacao para os alunos impactados.',
    escalation: 'Pode abrir campanha derivada de reforco.',
    icon: Megaphone,
  },
] as const;

export function RotinasTab() {
  return (
    <Card className="border-border/70">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <RotateCcw className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Rotinas automaticas recomendadas</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              As rotinas abaixo representam o formato alvo do modulo: gatilho claro, espera definida,
              mensagem automatica e possibilidade de escalonamento controlado.
            </p>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          {routines.map((routine) => (
            <div key={routine.title} className="rounded-2xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <routine.icon className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">{routine.title}</p>
                </div>
                <Badge variant="outline" className="gap-1">
                  <Clock3 className="h-3 w-3" />
                  {routine.waitTime}
                </Badge>
              </div>

              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Gatilho:</span> {routine.trigger}
                </p>
                <p>
                  <span className="font-medium text-foreground">Acao:</span> {routine.action}
                </p>
                <p>
                  <span className="font-medium text-foreground">Escalonamento:</span> {routine.escalation}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
