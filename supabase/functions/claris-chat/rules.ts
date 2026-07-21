import type { ClarisRichBlock, ClarisUiAction } from '../_shared/claris/loop.ts'
import {
  CLARIS_CHAT_CONTRACT_VERSION,
  type ClarisAvailabilityDto,
  type ClarisAvailabilityStatusDto,
  type ClarisChatResponseDto,
  type ClarisRichBlockDto,
} from './contract.ts'
import type { ClarisChatMessagePayload } from './payload.ts'
import type { ClarisLlmSettings } from './repository.ts'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

export function getClarisAvailabilityStatus(
  settings: ClarisLlmSettings,
): ClarisAvailabilityStatusDto {
  const hasUsableConfiguration = Boolean(
    settings.model
    && (settings.baseUrl || DEFAULT_BASE_URL)
    && settings.apiKey,
  )
  if (settings.configured && hasUsableConfiguration) return 'ready'
  return settings.configured ? 'invalid' : 'not_configured'
}

export function toClarisAvailabilityDto(
  settings: ClarisLlmSettings,
): ClarisAvailabilityDto {
  return {
    contractVersion: CLARIS_CHAT_CONTRACT_VERSION,
    status: getClarisAvailabilityStatus(settings),
  }
}

function mapRichBlock(block: ClarisRichBlock): ClarisRichBlockDto {
  if (block.type === 'data_table') {
    return {
      columns: block.columns,
      emptyMessage: block.empty_message,
      rows: block.rows,
      title: block.title,
      tool: block.tool,
      type: block.type,
    }
  }

  return {
    stats: block.stats,
    title: block.title,
    type: block.type,
  }
}

export function toClarisChatResponseDto(result: {
  reply: string
  richBlocks: ClarisRichBlock[]
  uiActions: ClarisUiAction[]
}): ClarisChatResponseDto {
  return {
    contractVersion: CLARIS_CHAT_CONTRACT_VERSION,
    reply: result.reply,
    richBlocks: result.richBlocks.map(mapRichBlock),
    uiActions: result.uiActions.map((action) => ({
      id: action.id,
      jobId: action.job_id ?? null,
      kind: action.kind,
      label: action.label,
      value: action.value,
    })),
  }
}

export function shouldResolveMoodleAccess(payload: ClarisChatMessagePayload): boolean {
  const confirmationText = payload.action?.value || payload.message
  const normalized = confirmationText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  return normalized.includes('confirmo o envio do job')
}
