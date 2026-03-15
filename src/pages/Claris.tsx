import { FloatingClarisChat } from '@/components/layout/FloatingClarisChat';

export default function Claris() {
  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[620px] flex-col gap-2 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Claris IA</h1>
        <p className="text-sm text-muted-foreground">
          Consulte dados, prepare envios e acompanhe intervenções.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/60 bg-card/70">
        <FloatingClarisChat variant="page" />
      </div>
    </div>
  );
}
