import { useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromAny = (table: string) => (supabase.from as Function)(table) as any;

export type SuggestionType =
  | 'task_followup' | 'weekly_message' | 'correction_followup' | 'alignment_event'
  | 'recovery_followup' | 'grade_risk' | 'attendance_risk' | 'engagement_risk'
  | 'uc_closing' | 'routine_reminder' | 'custom'
  | 'unanswered_message' | 'interrupted_contact' | 'channel_ineffective'
  | 'event_no_prep' | 'schedule_conflict' | 'recurring_event_manual'
  | 'overdue_task' | 'stalled_task' | 'task_no_context'
  | 'student_no_activity' | 'class_no_followup' | 'uc_no_update'
  | 'manual_flow_recurring' | 'old_pending' | 'interrupted_process'
  | 'unused_module' | 'repetitive_pattern' | 'unorganized_messages';

export type SuggestionPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SuggestionStatus = 'pending' | 'accepted' | 'dismissed' | 'expired';
export type SuggestionActionType = 'create_task' | 'create_event' | 'open_chat';
export type TriggerEngine = 'communication' | 'agenda' | 'tasks' | 'academic' | 'operational' | 'platform_usage' | 'manual';

export interface ClarisSuggestion {
  id: string;
  type: SuggestionType;
  title: string;
  body: string;
  reason?: string | null;
  analysis?: string | null;
  expected_impact?: string | null;
  trigger_engine?: TriggerEngine | null;
  trigger_context?: { trigger_key?: string; [key: string]: unknown } | null;
  priority: SuggestionPriority;
  status: SuggestionStatus;
  entity_type?: string | null;
  entity_id?: string | null;
  entity_name?: string | null;
  action_type?: SuggestionActionType | null;
  action_payload?: Record<string, unknown> | null;
  suggested_at: string;
  expires_at?: string | null;
}

const PROACTIVE_MIN_INTERVAL_MS = 30 * 60 * 1000;
const PROACTIVE_LAST_RUN_KEY = 'claris_proactive_last_run';
const SUGGESTIONS_KEY = ['claris_suggestions'];

async function fetchPendingSuggestions(): Promise<ClarisSuggestion[]> {
  const now = new Date().toISOString();
  const { data, error } = await fromAny('claris_suggestions')
    .select('id, type, title, body, reason, analysis, expected_impact, trigger_engine, trigger_context, priority, status, entity_type, entity_id, entity_name, action_type, action_payload, suggested_at, expires_at')
    .eq('status', 'pending')
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('suggested_at', { ascending: false })
    .limit(10);

  if (error) throw error;
  return (data ?? []) as ClarisSuggestion[];
}

export function useClarisSuggestions() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: SUGGESTIONS_KEY,
    queryFn: fetchPendingSuggestions,
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
  });

  const acceptMutation = useMutation({
    mutationFn: async (suggestion: ClarisSuggestion) => {
      if (!user?.id) throw new Error('Usuário não autenticado.');
      const { error } = await fromAny('claris_suggestions')
        .update({ status: 'accepted', acted_at: new Date().toISOString() })
        .eq('id', suggestion.id);
      if (error) throw error;

      if (suggestion.action_type === 'create_task' && suggestion.action_payload) {
        const payload = suggestion.action_payload;
        await fromAny('pending_tasks').insert({
          title: payload.title ?? suggestion.title,
          description: (payload.description ?? suggestion.body) as string,
          priority: 'media',
          due_date: (payload.due_date ?? null) as string | null,
          status: 'aberta',
          task_type: 'interna',
          created_by_user_id: user.id,
          assigned_to_user_id: user.id,
        });
      } else if (suggestion.action_type === 'create_event' && suggestion.action_payload) {
        const payload = suggestion.action_payload;
        await fromAny('calendar_events').insert({
          title: (payload.title ?? suggestion.title) as string,
          description: (payload.description ?? suggestion.body) as string | null,
          start_at: payload.start_at as string,
          end_at: (payload.end_at ?? null) as string | null,
          type: (payload.type ?? 'other') as string,
          owner: user.id,
          external_source: 'manual',
          all_day: (payload.all_day ?? false) as boolean,
          ia_source: 'sugestao_confirmada',
        });
      }
    },
    onSuccess: (_data, suggestion) => {
      qc.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
      if (suggestion.action_type === 'create_task') {
        toast.success('Tarefa criada a partir da sugestão');
        qc.invalidateQueries({ queryKey: ['tasks'] });
      } else if (suggestion.action_type === 'create_event') {
        toast.success('Evento criado a partir da sugestão');
        qc.invalidateQueries({ queryKey: ['calendar_events'] });
      } else {
        toast.success('Sugestão aceita');
      }
    },
    onError: () => toast.error('Erro ao aceitar sugestão'),
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromAny('claris_suggestions')
        .update({ status: 'dismissed', acted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SUGGESTIONS_KEY }),
    onError: () => toast.error('Erro ao dispensar sugestão'),
  });

  const updateDismissedCooldown = useCallback(async (suggestion: ClarisSuggestion) => {
    if (!suggestion.trigger_engine) return;
    const triggerKey = suggestion.trigger_context?.trigger_key;
    if (!triggerKey) return;

    await fromAny('claris_suggestion_cooldowns').insert({
      user_id: user!.id,
      trigger_engine: suggestion.trigger_engine,
      trigger_key: triggerKey,
      entity_type: suggestion.entity_type ?? null,
      entity_id: suggestion.entity_id ?? null,
      expires_at: new Date(Date.now() + 48 * 3600_000).toISOString(),
      outcome: 'dismissed',
      suggestion_id: suggestion.id,
    });
  }, [user]);

  const isRunningRef = useRef(false);

  const triggerProactiveGeneration = useCallback(async () => {
    if (!user) return;
    if (isRunningRef.current) return;

    const lastRun = parseInt(sessionStorage.getItem(PROACTIVE_LAST_RUN_KEY) ?? '0', 10);
    if (Date.now() - lastRun < PROACTIVE_MIN_INTERVAL_MS) return;

    isRunningRef.current = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        isRunningRef.current = false;
        return;
      }
      const { error } = await supabase.functions.invoke('generate-proactive-suggestions');
      if (!error) {
        sessionStorage.setItem(PROACTIVE_LAST_RUN_KEY, String(Date.now()));
        qc.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
      }
    } catch {
      // silently ignore
    } finally {
      isRunningRef.current = false;
    }
  }, [user, qc]);

  return {
    suggestions,
    isLoading,
    acceptSuggestion: acceptMutation.mutate,
    dismissSuggestion: (id: string) => {
      const suggestion = suggestions.find((s) => s.id === id);
      dismissMutation.mutate(id);
      if (suggestion) updateDismissedCooldown(suggestion);
    },
    triggerProactiveGeneration,
  };
}
