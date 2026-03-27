ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS ai_grading_settings jsonb NOT NULL DEFAULT '{
  "enabled": true,
  "timeoutMs": 45000,
  "maxFileBytes": 8388608,
  "supportedTypes": ["docx", "pdf", "txt", "html", "csv", "xlsx", "pptx", "png", "jpg", "jpeg"],
  "associationMinScore": 0.45,
  "associationWeights": {
    "sameSection": 0.45,
    "similarName": 0.3,
    "keywordMatch": 0.15,
    "temporalProximity": 0.1,
    "explicitLink": 0.2
  },
  "associationKeywords": ["atividade", "enunciado", "instrucao", "instrucoes", "orientacao", "orientacoes", "roteiro", "material", "parte", "sap"],
  "minVisualTextChars": 80,
  "minSubmissionTextChars": 40,
  "maxStoredTextLength": 12000
}'::jsonb;

UPDATE public.app_settings
SET ai_grading_settings = COALESCE(ai_grading_settings, '{
  "enabled": true,
  "timeoutMs": 45000,
  "maxFileBytes": 8388608,
  "supportedTypes": ["docx", "pdf", "txt", "html", "csv", "xlsx", "pptx", "png", "jpg", "jpeg"],
  "associationMinScore": 0.45,
  "associationWeights": {
    "sameSection": 0.45,
    "similarName": 0.3,
    "keywordMatch": 0.15,
    "temporalProximity": 0.1,
    "explicitLink": 0.2
  },
  "associationKeywords": ["atividade", "enunciado", "instrucao", "instrucoes", "orientacao", "orientacoes", "roteiro", "material", "parte", "sap"],
  "minVisualTextChars": 80,
  "minSubmissionTextChars": 40,
  "maxStoredTextLength": 12000
}'::jsonb)
WHERE singleton_id = 'global';

COMMENT ON COLUMN public.app_settings.ai_grading_settings IS
  'Configuracoes operacionais da sugestao de notas e feedback com IA.';
