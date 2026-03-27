export interface AiGradingAssociationWeights {
  sameSection: number;
  similarName: number;
  keywordMatch: number;
  temporalProximity: number;
  explicitLink: number;
}

export interface AiGradingSettings {
  enabled: boolean;
  timeoutMs: number;
  maxFileBytes: number;
  supportedTypes: string[];
  associationMinScore: number;
  associationWeights: AiGradingAssociationWeights;
  associationKeywords: string[];
  minVisualTextChars: number;
  minSubmissionTextChars: number;
  maxStoredTextLength: number;
}

const LEGACY_DEFAULT_SUPPORTED_TYPES = ["docx", "pdf", "txt", "html", "csv", "xlsx", "pptx", "png", "jpg", "jpeg"];
const CURRENT_DEFAULT_SUPPORTED_TYPES = [...LEGACY_DEFAULT_SUPPORTED_TYPES, "md", "htm", "gif", "bmp", "webp", "svg"];

export const DEFAULT_AI_GRADING_SETTINGS: AiGradingSettings = {
  enabled: true,
  timeoutMs: 45000,
  maxFileBytes: 8 * 1024 * 1024,
  supportedTypes: CURRENT_DEFAULT_SUPPORTED_TYPES,
  associationMinScore: 0.45,
  associationWeights: {
    sameSection: 0.45,
    similarName: 0.3,
    keywordMatch: 0.15,
    temporalProximity: 0.1,
    explicitLink: 0.2,
  },
  associationKeywords: [
    "atividade",
    "enunciado",
    "instrucao",
    "instrucoes",
    "orientacao",
    "orientacoes",
    "roteiro",
    "material",
    "parte",
    "sap",
  ],
  minVisualTextChars: 80,
  minSubmissionTextChars: 40,
  maxStoredTextLength: 12000,
};

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  return Math.max(1, Math.round(numeric));
}

function normalizeUnitInterval(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Number(Math.min(1, Math.max(0, numeric)).toFixed(2));
}

function normalizeStringList(value: unknown, fallback: string[]): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const normalized = items
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : [...fallback];
}

function matchesLegacyDefaultSupportedTypes(values: string[]): boolean {
  if (values.length !== LEGACY_DEFAULT_SUPPORTED_TYPES.length) {
    return false;
  }

  const current = new Set(values);
  return LEGACY_DEFAULT_SUPPORTED_TYPES.every((item) => current.has(item));
}

function normalizeSupportedTypes(value: unknown): string[] {
  const normalized = normalizeStringList(value, DEFAULT_AI_GRADING_SETTINGS.supportedTypes);

  return matchesLegacyDefaultSupportedTypes(normalized)
    ? [...DEFAULT_AI_GRADING_SETTINGS.supportedTypes]
    : normalized;
}

export function parseAiGradingSettings(value: unknown): AiGradingSettings {
  const raw = asObject(value);
  const rawWeights = asObject(raw.associationWeights);

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_AI_GRADING_SETTINGS.enabled,
    timeoutMs: normalizePositiveInteger(raw.timeoutMs, DEFAULT_AI_GRADING_SETTINGS.timeoutMs),
    maxFileBytes: normalizePositiveInteger(raw.maxFileBytes, DEFAULT_AI_GRADING_SETTINGS.maxFileBytes),
    supportedTypes: normalizeSupportedTypes(raw.supportedTypes),
    associationMinScore: normalizeUnitInterval(raw.associationMinScore, DEFAULT_AI_GRADING_SETTINGS.associationMinScore),
    associationWeights: {
      sameSection: normalizeUnitInterval(rawWeights.sameSection, DEFAULT_AI_GRADING_SETTINGS.associationWeights.sameSection),
      similarName: normalizeUnitInterval(rawWeights.similarName, DEFAULT_AI_GRADING_SETTINGS.associationWeights.similarName),
      keywordMatch: normalizeUnitInterval(rawWeights.keywordMatch, DEFAULT_AI_GRADING_SETTINGS.associationWeights.keywordMatch),
      temporalProximity: normalizeUnitInterval(rawWeights.temporalProximity, DEFAULT_AI_GRADING_SETTINGS.associationWeights.temporalProximity),
      explicitLink: normalizeUnitInterval(rawWeights.explicitLink, DEFAULT_AI_GRADING_SETTINGS.associationWeights.explicitLink),
    },
    associationKeywords: normalizeStringList(raw.associationKeywords, DEFAULT_AI_GRADING_SETTINGS.associationKeywords),
    minVisualTextChars: normalizePositiveInteger(raw.minVisualTextChars, DEFAULT_AI_GRADING_SETTINGS.minVisualTextChars),
    minSubmissionTextChars: normalizePositiveInteger(raw.minSubmissionTextChars, DEFAULT_AI_GRADING_SETTINGS.minSubmissionTextChars),
    maxStoredTextLength: normalizePositiveInteger(raw.maxStoredTextLength, DEFAULT_AI_GRADING_SETTINGS.maxStoredTextLength),
  };
}
