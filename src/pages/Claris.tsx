import { Sparkles } from 'lucide-react';
import { FloatingClarisChat } from '@/components/layout/FloatingClarisChat';

export default function Claris() {
  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[620px] flex-col gap-4 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Assistente institucional
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Claris IA</h1>
          <p className="text-muted-foreground">
            Converse com a Claris em tela expandida para consultar dados, preparar envios e acompanhar intervenções sem perder contexto.
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/60 bg-card/70">
        <FloatingClarisChat variant="page" />
      </div>
    </div>
  );
}
