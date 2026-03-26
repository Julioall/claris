import { RotateCcw } from 'lucide-react';

export function RotinasTab() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground border rounded-lg bg-muted/20">
      <RotateCcw className="h-10 w-10 mb-3 opacity-40" />
      <p className="text-sm font-medium">Rotinas automáticas</p>
      <p className="text-xs mt-1 max-w-sm">
        Em breve: configure rotinas recorrentes para que a Claris IA execute ações
        automáticas de acompanhamento, alertas e envios periódicos.
      </p>
    </div>
  );
}
