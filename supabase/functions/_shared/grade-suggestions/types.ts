export type ExtractionQuality = 'high' | 'medium' | 'low' | 'none'
export type SuggestionConfidence = 'high' | 'medium' | 'low'
export type GradeSuggestionStatus = 'success' | 'invalid' | 'manual_review_required' | 'error'

export interface ContextSource {
  label: string
  type:
    | 'assign_description'
    | 'assign_attachment'
    | 'section_resource'
    | 'submission_text'
    | 'submission_file'
  extractionQuality?: ExtractionQuality
  requiresVisualAnalysis?: boolean
}

export interface ExtractedFile {
  name: string
  mimeType: string
  extractedText: string
  extractionQuality: ExtractionQuality
  requiresVisualAnalysis: boolean
  textLength: number
  sourceUrl?: string | null
  warning?: string | null
  fileBytes?: Uint8Array
}

export interface SupplementaryMaterial {
  id: string
  type: string
  name: string
  extractedText: string
  extractionQuality: ExtractionQuality
  requiresVisualAnalysis: boolean
  sourceUrl?: string | null
  score?: number
  reason?: string[]
}

export interface RelatedResourceCandidate {
  resourceId: string
  type: string
  name: string
  score: number
  reason: string[]
}

export interface ActivityEvaluationContext {
  activityId: string
  courseId: string
  assign: {
    id: number
    courseModuleId: number
    name: string
    sectionId: number | null
  }
  primaryDescription: string
  supplementaryMaterials: SupplementaryMaterial[]
  relatedResources: RelatedResourceCandidate[]
  maxGrade: number
}

export interface NormalizedSubmission {
  submissionId: string | null
  studentId: string
  typedText: string
  extractedFiles: ExtractedFile[]
  requiresManualReview: boolean
  confidence: SuggestionConfidence
  warnings: string[]
  warningCodes: string[]
  visualDependency: boolean
  totalExtractedTextLength: number
  status: 'submitted' | 'draft' | 'missing'
  attemptNumber: number | null
}

export interface AiEvaluationRequest {
  maxGrade: number
  activityContext: ActivityEvaluationContext
  studentSubmission: NormalizedSubmission
  studentName?: string
  tutorName?: string
}

export interface AiEvaluationResponse {
  valida: boolean
  feedback: string
  notaRecomendada: number | null
  reason?: string
  confidence?: SuggestionConfidence
}

export interface GradeSuggestionResult {
  status: GradeSuggestionStatus
  suggestedGrade: number | null
  suggestedFeedback: string | null
  confidence: SuggestionConfidence
  sourcesUsed: ContextSource[]
  warnings: string[]
  evaluationStatus: string
  reason?: string
}

export interface MoodleFileReference {
  filename?: string
  fileurl?: string
  filesize?: number
  mimetype?: string
  timemodified?: number
  filepath?: string
  type?: string
  content?: string
}

export interface MoodleCourseModule {
  id: number
  instance?: number
  modname: string
  name: string
  description?: string
  url?: string
  timemodified?: number
  contents?: MoodleFileReference[]
}

export interface MoodleCourseSection {
  id?: number
  section?: number
  name?: string
  summary?: string
  timemodified?: number
  modules?: MoodleCourseModule[]
}

export interface MoodleAssign {
  id: number
  cmid?: number
  coursemodule?: number
  name?: string
  intro?: string
  grade?: number | null
  duedate?: number
  timemodified?: number
  introattachments?: MoodleFileReference[]
}

export interface GradeSuggestionAuditDraft {
  userId: string
  studentId: string
  courseId: string
  studentActivityId: string | null
  moodleActivityId: string
}

export interface GradeSuggestionAuditFinalizeInput {
  status: string
  confidence?: SuggestionConfidence
  suggestedGrade?: number | null
  suggestedFeedback?: string | null
  approvedGrade?: number | null
  approvedFeedback?: string | null
  maxGrade?: number | null
  moodleAssignId?: number | null
  warnings?: string[]
  sourcesUsed?: ContextSource[]
  contextSummary?: Record<string, unknown>
  submissionSummary?: Record<string, unknown>
  promptPayload?: Record<string, unknown>
  aiResponse?: Record<string, unknown> | null
  provider?: string | null
  model?: string | null
  errorMessage?: string | null
  approvedAt?: string | null
  approvalResponse?: Record<string, unknown> | null
}
