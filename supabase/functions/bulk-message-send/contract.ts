export const BULK_MESSAGE_SEND_CONTRACT_VERSION = 1 as const

export interface BulkMessageSendMetadataDto {
  contractVersion: typeof BULK_MESSAGE_SEND_CONTRACT_VERSION
  generatedAt: string
}

export type BulkMessageSendResultDto =
  | {
      jobId: string
      kind: 'duplicate'
      metadata: BulkMessageSendMetadataDto
    }
  | {
      failed: number
      jobId: string
      kind: 'started' | 'resumed'
      metadata: BulkMessageSendMetadataDto
      sent: number
      status: 'completed' | 'failed'
    }
