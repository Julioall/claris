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
export type SuggestionActionType = 'create_task' | 'create_event' | 'open_chat';
export type TriggerEngine =
  | 'communication' | 'agenda' | 'tasks' | 'academic'
  | 'operational' | 'platform_usage' | 'manual';

export interface ClarisSuggestion {
  actionType: SuggestionActionType | null;
  analysis: string | null;
  body: string;
  entityId: string | null;
  entityName: string | null;
  entityType: string | null;
  expectedImpact: string | null;
  expiresAt: string | null;
  id: string;
  priority: SuggestionPriority;
  reason: string | null;
  status: 'pending';
  suggestedAt: string;
  title: string;
  triggerEngine: TriggerEngine | null;
  type: SuggestionType;
}

export interface ClarisSuggestionsListDto {
  contractVersion: 1;
  items: ClarisSuggestion[];
}

export interface ClarisSuggestionActionDto {
  actionType: SuggestionActionType | null;
  contractVersion: 1;
  createdEntityId: string | null;
  effect: 'none' | 'task_created' | 'event_created';
  status: 'accepted' | 'dismissed';
  suggestionId: string;
}

export interface ProactiveSuggestionGenerationDto {
  contractVersion: 1;
  details: {
    academic: number;
    agenda: number;
    communication: number;
    operational: number;
    platformUsage: number;
    tasks: number;
  };
  enginesRun: number;
  suggestionsCreated: number;
}
