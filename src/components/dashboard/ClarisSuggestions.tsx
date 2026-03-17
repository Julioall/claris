import { useState } from 'react';
import { Brain, CheckCircle2, X, ChevronRight, Lightbulb, AlertTriangle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useClarisSuggestions, type ClarisSuggestion } from '@/hooks/useClarisSuggestions';

const PRIORITY_STYLES: Record<string, { badge: string; border: string }> = {
  urgent: { badge: 'bg-risk-critico/15 text-risk-critico border-risk-critico/30', border: 'border-l-risk-critico' },
  high:   { badge: 'bg-risk-risco/15 text-risk-risco border-risk-risco/30', border: 'border-l-risk-risco' },
  medium: { badge: 'bg-status-pending/15 text-status-pending border-status-pending/30', border: 'border-l-status-pending' },
  low:    { badge: 'bg-muted text-muted-foreground border-border', border: 'border-l-muted-foreground/30' },
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

const TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  task_followup: CheckCircle2,
  grade_risk: AlertTriangle,
  attendance_risk: AlertTriangle,
  engagement_risk: AlertTriangle,
  weekly_message: Lightbulb,
  correction_followup: Clock,
  alignment_event: Clock,
  recovery_followup: AlertTriangle,
  uc_closing: Clock,
  routine_reminder: Lightbulb,
  custom: Lightbulb,
};

interface SuggestionCardProps {
  suggestion: ClarisSuggestion;
  onAccept: (s: ClarisSuggestion) => void;
  onDismiss: (id: string) => void;
}

function SuggestionCard({ suggestion, onAccept, onDismiss }: SuggestionCardProps) {
  const styles = PRIORITY_STYLES[suggestion.priority] ?? PRIORITY_STYLES.medium;
  const Icon = TYPE_ICONS[suggestion.type] ?? Lightbulb;

  return (
    <div
      className={cn(
        'flex gap-3 p-3 rounded-lg bg-muted/40 border border-l-4 transition-opacity',
        styles.border,
      )}
    >
      <div className="mt-0.5 shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-tight">{suggestion.title}</p>
          <button
            onClick={() => onDismiss(suggestion.id)}
            className="shrink-0 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            aria-label="Dispensar sugestão"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{suggestion.body}</p>
        <div className="flex items-center gap-2 pt-0.5">
          <Badge variant="outline" className={cn('text-xs py-0', styles.badge)}>
            {PRIORITY_LABELS[suggestion.priority] ?? suggestion.priority}
          </Badge>
          {suggestion.entity_name && (
            <span className="text-xs text-muted-foreground truncate">· {suggestion.entity_name}</span>
          )}
        </div>
        {suggestion.action_type && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs mt-1 gap-1"
            onClick={() => onAccept(suggestion)}
          >
            {suggestion.action_type === 'create_task' && 'Criar tarefa'}
            {suggestion.action_type === 'create_event' && 'Criar evento'}
            {suggestion.action_type === 'open_chat' && 'Abrir chat'}
            <ChevronRight className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function ClarisSuggestions() {
  const { suggestions, isLoading, acceptSuggestion, dismissSuggestion } = useClarisSuggestions();
  const [expanded, setExpanded] = useState(true);

  if (isLoading || suggestions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Sugestões da Claris IA
            <Badge variant="secondary" className="text-xs">
              {suggestions.length}
            </Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? 'Ocultar' : 'Ver todas'}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-2">
          {suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              onAccept={acceptSuggestion}
              onDismiss={dismissSuggestion}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}
