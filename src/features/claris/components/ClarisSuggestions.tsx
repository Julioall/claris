import { useState, useEffect } from 'react';
import { Brain, CheckCircle2, X, ChevronRight, Lightbulb, AlertTriangle, Clock, ChevronDown, ChevronUp, RefreshCw, MessageSquare, Calendar, ListTodo, GraduationCap, Settings2, LayoutDashboard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useClarisSuggestions, type ClarisSuggestion, type TriggerEngine } from '../hooks/useClarisSuggestions';

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
  student_no_activity: AlertTriangle,
  weekly_message: Lightbulb,
  correction_followup: Clock,
  alignment_event: Clock,
  recovery_followup: AlertTriangle,
  uc_closing: Clock,
  routine_reminder: Lightbulb,
  custom: Lightbulb,
  // communication engine
  unanswered_message: MessageSquare,
  interrupted_contact: MessageSquare,
  channel_ineffective: MessageSquare,
  // agenda engine
  event_no_prep: Calendar,
  schedule_conflict: Calendar,
  recurring_event_manual: Calendar,
  // tasks engine
  overdue_task: ListTodo,
  stalled_task: ListTodo,
  task_no_context: ListTodo,
  // academic engine
  class_no_followup: GraduationCap,
  uc_no_update: GraduationCap,
  // operational engine
  manual_flow_recurring: Settings2,
  old_pending: Settings2,
  interrupted_process: Settings2,
  // platform usage engine
  unused_module: LayoutDashboard,
  repetitive_pattern: LayoutDashboard,
  unorganized_messages: LayoutDashboard,
};

const ENGINE_LABELS: Record<TriggerEngine, string> = {
  communication: 'Comunicação',
  agenda: 'Agenda',
  tasks: 'Tarefas',
  academic: 'Acadêmico',
  operational: 'Operacional',
  platform_usage: 'Plataforma',
  manual: 'Manual',
};

const ENGINE_ICONS: Record<TriggerEngine, typeof Brain> = {
  communication: MessageSquare,
  agenda: Calendar,
  tasks: ListTodo,
  academic: GraduationCap,
  operational: Settings2,
  platform_usage: LayoutDashboard,
  manual: Brain,
};

interface SuggestionCardProps {
  suggestion: ClarisSuggestion;
  onAccept: (s: ClarisSuggestion) => void;
  onDismiss: (id: string) => void;
}

function SuggestionCard({ suggestion, onAccept, onDismiss }: SuggestionCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const styles = PRIORITY_STYLES[suggestion.priority] ?? PRIORITY_STYLES.medium;
  const Icon = TYPE_ICONS[suggestion.type] ?? Lightbulb;
  const hasDetails = suggestion.reason || suggestion.analysis || suggestion.expected_impact;

  const engine = suggestion.trigger_engine;
  const EngineIcon = engine ? ENGINE_ICONS[engine] : Brain;
  const engineLabel = engine ? ENGINE_LABELS[engine] : null;

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
            aria-label="Recusar sugestão"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{suggestion.body}</p>
        <div className="flex items-center gap-2 pt-0.5 flex-wrap">
          <Badge variant="outline" className={cn('text-xs py-0', styles.badge)}>
            {PRIORITY_LABELS[suggestion.priority] ?? suggestion.priority}
          </Badge>
          {engineLabel && (
            <Badge variant="outline" className="text-xs py-0 gap-1 text-muted-foreground">
              <EngineIcon className="h-2.5 w-2.5" />
              {engineLabel}
            </Badge>
          )}
          {suggestion.entity_name && (
            <span className="text-xs text-muted-foreground truncate">· {suggestion.entity_name}</span>
          )}
        </div>

        {/* Expandable details */}
        {hasDetails && (
          <div>
            <button
              onClick={() => setDetailsOpen((o) => !o)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
            >
              {detailsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {detailsOpen ? 'Ocultar análise' : 'Ver análise'}
            </button>
            {detailsOpen && (
              <div className="mt-2 space-y-1.5 text-xs text-muted-foreground border-t pt-2">
                {suggestion.reason && (
                  <div>
                    <span className="font-medium text-foreground/70">Motivo: </span>
                    {suggestion.reason}
                  </div>
                )}
                {suggestion.analysis && (
                  <div>
                    <span className="font-medium text-foreground/70">Análise: </span>
                    {suggestion.analysis}
                  </div>
                )}
                {suggestion.expected_impact && (
                  <div>
                    <span className="font-medium text-foreground/70">Impacto esperado: </span>
                    {suggestion.expected_impact}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
  const { suggestions, isLoading, isGenerating, acceptSuggestion, dismissSuggestion, triggerProactiveGeneration, forceGenerate } = useClarisSuggestions();
  const [expanded, setExpanded] = useState(true);

  // Trigger proactive generation on mount (rate-limited inside the hook)
  useEffect(() => {
    triggerProactiveGeneration();
  }, [triggerProactiveGeneration]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Sugestões da Claris IA
            {suggestions.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {suggestions.length}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground"
              onClick={() => forceGenerate()}
              title="Gerar novas sugestões"
              disabled={isGenerating}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isGenerating && 'animate-spin')} />
            </Button>
            {suggestions.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? 'Ocultar' : 'Ver todas'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {isLoading ? (
        <CardContent className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </CardContent>
      ) : suggestions.length === 0 ? (
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma sugestão no momento. Clique em{' '}
            <RefreshCw className="inline h-3 w-3" /> para gerar novas sugestões.
          </p>
        </CardContent>
      ) : expanded ? (
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
      ) : null}
    </Card>
  );
}
