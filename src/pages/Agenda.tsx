import { CalendarDays, Construction } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Agenda() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" />
          Agenda
        </h1>
        <p className="text-muted-foreground mt-1">
          Visualize e organize compromissos, reuniões e eventos de tutoria.
        </p>
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Construction className="h-5 w-5" />
            Em construção
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            O módulo de Agenda está planejado para uma implementação futura separada do módulo de Tarefas.
            Aqui você poderá visualizar compromissos, prazos e eventos relacionados ao acompanhamento dos alunos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
