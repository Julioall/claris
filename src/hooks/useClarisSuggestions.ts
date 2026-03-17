import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type SuggestionType =
  | 'task_followup'
  | 'weekly_message'
  | 'correction_followup'
  | 'alignment_event'
  | 'recovery_followup'
  | 'grade_risk'
  | 'attendance_risk'
  | 'engagement_risk'
  | 'uc_closing'
  | 'routine_reminder'
  | 'custom';

export type SuggestionPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SuggestionStatus = 'pending' | 'accepted' | 'dismissed' | 'expired';
export type SuggestionActionType = 'create_task' | 'create_event' | 'open_chat';

export interface ClarisSuggestion {
  id: string;
  type: SuggestionType;
  title: string;
  body: string;
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

const SUGGESTIONS_KEY = ['claris_suggestions'];

async function fetchPendingSuggestions(): Promise<ClarisSuggestion[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('claris_suggestions')
    .select('id, type, title, body, priority, status, entity_type, entity_id, entity_name, action_type, action_payload, suggested_at, expires_at')
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
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  const acceptMutation = useMutation({
    mutationFn: async (suggestion: ClarisSuggestion) => {
      if (!user?.id) throw new Error('Usuário não autenticado.')
      const { error } = await supabase
        .from('claris_suggestions')
        .update({ status: 'accepted', acted_at: new Date().toISOString() })
        .eq('id', suggestion.id);
      if (error) throw error;

      // If there's an action payload, auto-create the resource
      if (suggestion.action_type === 'create_task' && suggestion.action_payload) {
        const payload = suggestion.action_payload as Record<string, unknown>;
        await supabase.from('tasks').insert({
          title: payload.title ?? suggestion.title,
          description: (payload.description ?? suggestion.body) as string,
          priority: (payload.priority ?? 'medium') as string,
          due_date: (payload.due_date ?? null) as string | null,
          entity_type: (suggestion.entity_type ?? null) as string | null,
          entity_id: (suggestion.entity_id ?? null) as string | null,
          origin_reason: suggestion.body,
          suggested_by_ai: true,
          status: 'todo',
          created_by: user?.id,
          assigned_to: user?.id,
          tags: (payload.tags ?? []) as string[],
        });
      } else if (suggestion.action_type === 'create_event' && suggestion.action_payload) {
        const payload = suggestion.action_payload as Record<string, unknown>;
        await supabase.from('calendar_events').insert({
          title: (payload.title ?? suggestion.title) as string,
          description: (payload.description ?? suggestion.body) as string | null,
          start_at: payload.start_at as string,
          end_at: (payload.end_at ?? null) as string | null,
          type: (payload.type ?? 'other') as string,
          owner: user?.id,
          external_source: 'manual' as const,
          all_day: (payload.all_day ?? false) as boolean,
          ia_source: 'sugestao_confirmada' as const,
          related_entity_type: (suggestion.entity_type ?? null) as string | null,
          related_entity_id: (suggestion.entity_id ?? null) as string | null,
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
      const { error } = await supabase
        .from('claris_suggestions')
        .update({ status: 'dismissed', acted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
    },
    onError: () => toast.error('Erro ao dispensar sugestão'),
  });

  return {
    suggestions,
    isLoading,
    acceptSuggestion: acceptMutation.mutate,
    dismissSuggestion: dismissMutation.mutate,
  };
}
