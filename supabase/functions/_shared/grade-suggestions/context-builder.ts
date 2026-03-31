import { callMoodleApi } from '../moodle/mod.ts'
import { DEFAULT_ASSOCIATION_CONFIG, selectRelatedResources, type AssociationHeuristicsConfig } from './heuristics.ts'
import { extractTextFromFileBuffer } from './file-text-extraction.ts'
import { isFileTypeEnabled, withTemporaryMoodleFile } from './file-support.ts'
import { classifyExtractionQuality, collapseWhitespace, stripHtmlToText } from './text.ts'
import type { GradeSuggestionRuntimeConfig } from './config.ts'
import type { ContextBuildResult } from './orchestrator.ts'
import type { MoodleAssign, MoodleCourseModule, MoodleCourseSection, MoodleFileReference, SupplementaryMaterial } from './types.ts'

interface BuildContextParams {
  moodleUrl: string
  token: string
  courseId: string
  moodleCourseId: number
  moodleActivityId: string
  fallbackMaxGrade: number | null
  config: GradeSuggestionRuntimeConfig
}

function buildAssociationConfig(config: GradeSuggestionRuntimeConfig): AssociationHeuristicsConfig {
  return {
    ...DEFAULT_ASSOCIATION_CONFIG,
    minScore: config.associationMinScore,
    keywords: config.associationKeywords,
    weights: config.associationWeights,
  }
}

function getModuleTimestamp(module: MoodleCourseModule): number | null {
  if (typeof module.timemodified === 'number' && module.timemodified > 0) {
    return module.timemodified * 1000
  }

  const contentTimestamp = (module.contents ?? [])
    .map((content) => content.timemodified)
    .find((value): value is number => typeof value === 'number' && value > 0)

  return contentTimestamp ? contentTimestamp * 1000 : null
}

function findSectionAndModule(
  sections: MoodleCourseSection[],
  courseModuleId: number,
): { section: MoodleCourseSection | null; module: MoodleCourseModule | null } {
  for (const section of sections) {
    for (const module of section.modules ?? []) {
      if (Number(module.id) === courseModuleId) {
        return { section, module }
      }
    }
  }

  return { section: null, module: null }
}

function findAssignment(
  assignments: MoodleAssign[],
  courseModuleId: number,
  moduleInstance?: number,
): MoodleAssign | null {
  return assignments.find((assignment) => (
    Number(assignment.cmid ?? assignment.coursemodule ?? assignment.id) === courseModuleId ||
    (typeof moduleInstance === 'number' && Number(assignment.id) === moduleInstance)
  )) ?? null
}

function collectInlineModuleText(module: MoodleCourseModule): string {
  const texts: string[] = []

  if (module.description) {
    const normalized = stripHtmlToText(module.description)
    if (normalized) {
      texts.push(normalized)
    }
  }

  for (const item of module.contents ?? []) {
    if (typeof item.content === 'string' && item.content.trim()) {
      const normalized = stripHtmlToText(item.content)
      if (normalized) {
        texts.push(normalized)
      }
    }
  }

  return collapseWhitespace(texts.join('\n\n'))
}

async function materialFromFileReference(params: {
  token: string
  file: MoodleFileReference
  materialId: string
  type: string
  name: string
  config: GradeSuggestionRuntimeConfig
  score?: number
  reason?: string[]
}): Promise<SupplementaryMaterial> {
  const fileName = params.file.filename?.trim() || params.name
  const mimeType = params.file.mimetype?.trim() || 'application/octet-stream'

  if (!isFileTypeEnabled(fileName, mimeType, params.config.supportedTypes)) {
    return {
      id: params.materialId,
      type: params.type,
      name: fileName,
      extractedText: '',
      extractionQuality: 'none',
      requiresVisualAnalysis: false,
      sourceUrl: params.file.fileurl ?? null,
      score: params.score,
      reason: params.reason,
    }
  }

  return await withTemporaryMoodleFile({
    file: params.file,
    token: params.token,
    maxFileBytes: params.config.maxFileBytes,
    onDownloaded: async ({ bytes, mimeType: downloadedMimeType }) => {
      const extracted = await extractTextFromFileBuffer({
        fileName,
        mimeType: downloadedMimeType,
        bytes,
        maxTextLength: params.config.maxStoredTextLength,
        sourceUrl: params.file.fileurl ?? null,
      })

      return {
        id: params.materialId,
        type: params.type,
        name: fileName,
        extractedText: extracted.extractedText,
        extractionQuality: extracted.extractionQuality,
        requiresVisualAnalysis: extracted.requiresVisualAnalysis,
        sourceUrl: extracted.sourceUrl ?? null,
        score: params.score,
        reason: params.reason,
      }
    },
  })
}

export async function buildActivityEvaluationContext(
  params: BuildContextParams,
): Promise<ContextBuildResult> {
  const courseContents = await callMoodleApi(params.moodleUrl, params.token, 'core_course_get_contents', {
    courseid: params.moodleCourseId,
  })
  const assignData = await callMoodleApi(params.moodleUrl, params.token, 'mod_assign_get_assignments', {
    'courseids[0]': params.moodleCourseId,
  })

  const sections = Array.isArray(courseContents) ? courseContents as MoodleCourseSection[] : []
  const assignments = Array.isArray(assignData?.courses?.[0]?.assignments)
    ? assignData.courses[0].assignments as MoodleAssign[]
    : []

  const courseModuleId = Number(params.moodleActivityId)
  if (!Number.isFinite(courseModuleId)) {
    throw new Error('Atividade Moodle inválida para montagem de contexto.')
  }

  const { section, module } = findSectionAndModule(sections, courseModuleId)
  if (!module) {
    throw new Error('Não foi possível localizar a atividade na estrutura do curso.')
  }

  const assign = findAssignment(assignments, courseModuleId, module.instance)
  if (!assign) {
    throw new Error('Não foi possível localizar os detalhes do assign no Moodle.')
  }

  const primaryDescription = stripHtmlToText(assign.intro || module.description || '')
  const supplementaryMaterials: SupplementaryMaterial[] = []
  const sourcesUsed: ContextBuildResult['sourcesUsed'] = []

  if (primaryDescription) {
    sourcesUsed.push({
      label: `${assign.name || module.name} - descrição principal`,
      type: 'assign_description',
      extractionQuality: classifyExtractionQuality(primaryDescription),
      requiresVisualAnalysis: false,
    })
  }

  for (const attachment of assign.introattachments ?? []) {
    const material = await materialFromFileReference({
      token: params.token,
      file: attachment,
      materialId: `assign-attachment:${assign.id}:${attachment.filename ?? 'arquivo'}`,
      type: 'assign_attachment',
      name: attachment.filename?.trim() || 'Anexo da atividade',
      config: params.config,
    })

    supplementaryMaterials.push(material)
    sourcesUsed.push({
      label: material.name,
      type: 'assign_attachment',
      extractionQuality: material.extractionQuality,
      requiresVisualAnalysis: material.requiresVisualAnalysis,
    })
  }

  const relatedModules = (section?.modules ?? [])
    .filter((candidate) => candidate.id !== courseModuleId)
    .filter((candidate) => ['file', 'page', 'label', 'folder'].includes(candidate.modname))

  const relatedCandidates = selectRelatedResources(
    relatedModules.map((candidate) => ({
      assignName: assign.name || module.name,
      assignTimestamp: typeof assign.timemodified === 'number' && assign.timemodified > 0
        ? assign.timemodified * 1000
        : null,
      candidateId: String(candidate.id),
      candidateType: candidate.modname,
      candidateName: candidate.name,
      candidateTimestamp: getModuleTimestamp(candidate),
      sameSection: true,
      explicitLink: false,
    })),
    buildAssociationConfig(params.config),
  )

  for (const related of relatedCandidates) {
    const relatedModule = relatedModules.find((candidate) => String(candidate.id) === related.resourceId)
    if (!relatedModule) continue

    const inlineText = collectInlineModuleText(relatedModule)
    if (inlineText) {
      supplementaryMaterials.push({
        id: `section-inline:${relatedModule.id}`,
        type: relatedModule.modname,
        name: `${relatedModule.name} - texto`,
        extractedText: inlineText,
        extractionQuality: classifyExtractionQuality(inlineText),
        requiresVisualAnalysis: false,
        sourceUrl: relatedModule.url ?? null,
        score: related.score,
        reason: related.reason,
      })

      sourcesUsed.push({
        label: `${relatedModule.name} - texto`,
        type: 'section_resource',
        extractionQuality: classifyExtractionQuality(inlineText),
        requiresVisualAnalysis: false,
      })
    }

    for (const file of relatedModule.contents ?? []) {
      if (!file.fileurl || !file.filename) continue

      const material = await materialFromFileReference({
        token: params.token,
        file,
        materialId: `section-file:${relatedModule.id}:${file.filename}`,
        type: relatedModule.modname,
        name: file.filename,
        config: params.config,
        score: related.score,
        reason: related.reason,
      })

      supplementaryMaterials.push(material)
      sourcesUsed.push({
        label: material.name,
        type: 'section_resource',
        extractionQuality: material.extractionQuality,
        requiresVisualAnalysis: material.requiresVisualAnalysis,
      })
    }
  }

  const rawMaxGrade = Number(assign.grade ?? params.fallbackMaxGrade ?? Number.NaN)
  const maxGrade = Number.isFinite(rawMaxGrade) && rawMaxGrade > 0
    ? rawMaxGrade
    : null

  return {
    context: {
      activityId: params.moodleActivityId,
      courseId: params.courseId,
      assign: {
        id: assign.id,
        courseModuleId,
        name: assign.name || module.name,
        sectionId: section?.id ?? section?.section ?? null,
      },
      primaryDescription,
      supplementaryMaterials,
      relatedResources: relatedCandidates,
      maxGrade,
    },
    sourcesUsed,
    contextSummary: {
      assign_name: assign.name || module.name,
      section_id: section?.id ?? section?.section ?? null,
      related_resources: relatedCandidates,
      supplementary_material_count: supplementaryMaterials.length,
      max_grade: maxGrade,
    },
    moodleAssignId: assign.id,
  }
}
