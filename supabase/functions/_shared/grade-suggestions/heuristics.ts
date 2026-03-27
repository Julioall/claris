import { computeTokenSimilarity, normalizeForComparison } from './text.ts'
import type { RelatedResourceCandidate } from './types.ts'

export interface AssociationHeuristicsConfig {
  minScore: number
  temporalWindowMs: number
  keywords: string[]
  weights: {
    sameSection: number
    similarName: number
    keywordMatch: number
    temporalProximity: number
    explicitLink: number
  }
}

export interface AssociationScoringInput {
  assignName: string
  assignTimestamp: number | null
  candidateId: string
  candidateType: string
  candidateName: string
  candidateTimestamp: number | null
  sameSection: boolean
  explicitLink?: boolean
}

export const DEFAULT_ASSOCIATION_KEYWORDS = [
  'atividade',
  'enunciado',
  'instrucao',
  'instrucoes',
  'orientacao',
  'orientacoes',
  'roteiro',
  'material',
  'parte',
  'sap',
] as const

export const DEFAULT_ASSOCIATION_CONFIG: AssociationHeuristicsConfig = {
  minScore: 0.45,
  temporalWindowMs: 14 * 24 * 60 * 60 * 1000,
  keywords: [...DEFAULT_ASSOCIATION_KEYWORDS],
  weights: {
    sameSection: 0.45,
    similarName: 0.3,
    keywordMatch: 0.15,
    temporalProximity: 0.1,
    explicitLink: 0.2,
  },
}

function hasKeywordMatch(assignName: string, candidateName: string, keywords: string[]): boolean {
  const normalizedAssign = normalizeForComparison(assignName)
  const normalizedCandidate = normalizeForComparison(candidateName)

  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeForComparison(keyword)
    return normalizedAssign.includes(normalizedKeyword) || normalizedCandidate.includes(normalizedKeyword)
  })
}

export function scoreRelatedResource(
  input: AssociationScoringInput,
  config: AssociationHeuristicsConfig = DEFAULT_ASSOCIATION_CONFIG,
): RelatedResourceCandidate {
  const reasons: string[] = []
  let score = 0

  if (input.sameSection) {
    score += config.weights.sameSection
    reasons.push('same_section')
  }

  const similarity = computeTokenSimilarity(input.assignName, input.candidateName)
  if (similarity >= 0.2) {
    score += Math.min(config.weights.similarName, similarity * config.weights.similarName * 1.5)
    reasons.push('similar_name')
  }

  if (hasKeywordMatch(input.assignName, input.candidateName, config.keywords)) {
    score += config.weights.keywordMatch
    reasons.push('keyword_match')
  }

  if (
    input.assignTimestamp !== null &&
    input.candidateTimestamp !== null &&
    config.temporalWindowMs > 0
  ) {
    const diff = Math.abs(input.assignTimestamp - input.candidateTimestamp)
    if (diff <= config.temporalWindowMs) {
      score += config.weights.temporalProximity * (1 - diff / config.temporalWindowMs)
      reasons.push('temporal_proximity')
    }
  }

  if (input.explicitLink) {
    score += config.weights.explicitLink
    reasons.push('explicit_link')
  }

  return {
    resourceId: input.candidateId,
    type: input.candidateType,
    name: input.candidateName,
    score: Number(Math.min(1, score).toFixed(2)),
    reason: reasons,
  }
}

export function selectRelatedResources(
  inputs: AssociationScoringInput[],
  config: AssociationHeuristicsConfig = DEFAULT_ASSOCIATION_CONFIG,
): RelatedResourceCandidate[] {
  return inputs
    .map((candidate) => scoreRelatedResource(candidate, config))
    .filter((candidate) => candidate.score >= config.minScore)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, 'pt-BR'))
}
