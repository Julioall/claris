import { CheckSquare, Construction } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Tarefas() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CheckSquare className="h-6 w-6 text-primary" />
          Tarefas
        </h1>
        <p className="text-muted-foreground mt-1">
          Gerencie tarefas de acompanhamento de alunos e cursos.
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
            O módulo de Tarefas está sendo reconstruído do zero com uma nova arquitetura mais clara e focada.
            Em breve você poderá criar, acompanhar e organizar tarefas de tutoria diretamente por aqui.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
