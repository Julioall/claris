export const SERVICE_INTEGRATIONS_CONTRACT_VERSION = 1 as const

export type ServiceInstanceScope = 'personal' | 'shared'

export interface ServiceInstanceDto {
  connectionStatus: string
  createdAt: string
  description: string | null
  evolutionInstanceName: string | null
  healthStatus: string
  id: string
  isActive: boolean
  isBlocked: boolean
  lastActivityAt: string | null
  lastSyncAt: string | null
  name: string
  operationalStatus: string
  phoneNumber: string | null
  scope: ServiceInstanceScope
  serviceType: string
}

export interface AdminServiceInstanceDto extends ServiceInstanceDto {
  adminNotes: string | null
}

export interface ServiceInstanceEventDto {
  createdAt: string
  errorSummary: string | null
  eventType: string
  id: string
  origin: string
  status: string
}

export interface PersonalServiceOverviewDto {
  contractVersion: typeof SERVICE_INTEGRATIONS_CONTRACT_VERSION
  events: ServiceInstanceEventDto[]
  instance: ServiceInstanceDto | null
}

export interface SharedServiceInstancesDto {
  contractVersion: typeof SERVICE_INTEGRATIONS_CONTRACT_VERSION
  items: AdminServiceInstanceDto[]
}

export interface ServiceInstanceMutationDto {
  contractVersion: typeof SERVICE_INTEGRATIONS_CONTRACT_VERSION
  instance: ServiceInstanceDto
}

export interface ServiceInstanceCommandDto {
  contractVersion: typeof SERVICE_INTEGRATIONS_CONTRACT_VERSION
  instanceId: string
  success: true
}

export interface ServiceInstanceStatusDto {
  connectionStatus: string
  contractVersion: typeof SERVICE_INTEGRATIONS_CONTRACT_VERSION
  healthStatus: string
  instanceId: string
}

export interface ServiceInstanceQrDto {
  contractVersion: typeof SERVICE_INTEGRATIONS_CONTRACT_VERSION
  instanceId: string
  message: string
  pairingCode: string | null
  pending: boolean
  qrCode: string | null
}
