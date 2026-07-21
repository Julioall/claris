import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import {
  acceptClarisSuggestion,
  dismissClarisSuggestion,
  fetchPendingClarisSuggestions,
  generateClarisSuggestions,
} from '@/features/claris/api/suggestions';
import type { ClarisSuggestion } from '@/features/claris/api/contracts/claris-suggestions.contract';

export type {
  ClarisSuggestion,
  SuggestionActionType,
  SuggestionPriority,
  SuggestionType,
  TriggerEngine,
} from '@/features/claris/api/contracts/claris-suggestions.contract';

const PROACTIVE_MIN_INTERVAL_MS = 30 * 60 * 1000;
const PROACTIVE_LAST_RUN_KEY = 'claris_proactive_last_run';
const SUGGESTIONS_KEY = ['claris_suggestions'];

export function useClarisSuggestions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: SUGGESTIONS_KEY,
    queryFn: () => fetchPendingClarisSuggestions(10),
    enabled: Boolean(user),
    refetchInterval: 5 * 60 * 1000,
  });

  const acceptMutation = useMutation({
    mutationFn: (suggestion: ClarisSuggestion) => acceptClarisSuggestion(suggestion.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
      if (result.effect === 'task_created') {
        toast.success('Tarefa criada a partir da sugestão');
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      } else if (result.effect === 'event_created') {
        toast.success('Evento criado a partir da sugestão');
        queryClient.invalidateQueries({ queryKey: ['calendar_events'] });
      } else {
        toast.success('Sugestão aceita');
      }
    },
    onError: () => toast.error('Erro ao aceitar sugestão'),
  });

  const dismissMutation = useMutation({
    mutationFn: dismissClarisSuggestion,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY }),
    onError: () => toast.error('Erro ao dispensar sugestão'),
  });

  const isRunningRef = useRef(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const invokeGeneration = useCallback(async () => {
    if (!user || isRunningRef.current) return;

    isRunningRef.current = true;
    setIsGenerating(true);
    try {
      await generateClarisSuggestions();
      sessionStorage.setItem(PROACTIVE_LAST_RUN_KEY, String(Date.now()));
      queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
    } catch {
      // Proactive generation is best-effort and must not block the dashboard.
    } finally {
      isRunningRef.current = false;
      setIsGenerating(false);
    }
  }, [queryClient, user]);

  const triggerProactiveGeneration = useCallback(async () => {
    const lastRun = Number.parseInt(sessionStorage.getItem(PROACTIVE_LAST_RUN_KEY) ?? '0', 10);
    if (Date.now() - lastRun < PROACTIVE_MIN_INTERVAL_MS) return;
    await invokeGeneration();
  }, [invokeGeneration]);

  const forceGenerate = useCallback(async () => {
    sessionStorage.removeItem(PROACTIVE_LAST_RUN_KEY);
    await invokeGeneration();
  }, [invokeGeneration]);

  return {
    suggestions,
    isLoading,
    isGenerating,
    acceptSuggestion: acceptMutation.mutate,
    dismissSuggestion: dismissMutation.mutate,
    triggerProactiveGeneration,
    forceGenerate,
  };
}
