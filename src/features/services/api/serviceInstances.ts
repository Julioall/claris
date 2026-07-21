import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';

const FUNCTION_NAME = 'whatsapp-instance-manager';
export const SERVICE_INTEGRATIONS_CONTRACT_VERSION = 1 as const;

export type ServiceInstanceScope = 'personal' | 'shared';

export interface ServiceInstanceDto {
  connectionStatus: string;
  createdAt: string;
  description: string | null;
  evolutionInstanceName: string | null;
  healthStatus: string;
  id: string;
  isActive: boolean;
  isBlocked: boolean;
  lastActivityAt: string | null;
  lastSyncAt: string | null;
  name: string;
  operationalStatus: string;
  phoneNumber: string | null;
  scope: ServiceInstanceScope;
  serviceType: string;
}

export interface AdminServiceInstanceDto extends ServiceInstanceDto {
  adminNotes: string | null;
}

export interface ServiceInstanceEventDto {
  createdAt: string;
  errorSummary: string | null;
  eventType: string;
  id: string;
  origin: string;
  status: string;
}

export interface PersonalServiceOverviewDto {
  contractVersion: typeof SERVICE_INTEGRATIONS_CONTRACT_VERSION;
  events: ServiceInstanceEventDto[];
  instance: ServiceInstanceDto | null;
}

export interface SharedServiceInstancesDto {
  contractVersion: typeof SERVICE_INTEGRATIONS_CONTRACT_VERSION;
  items: AdminServiceInstanceDto[];
}

export interface ServiceInstanceMutationDto {
  contractVersion: typeof SERVICE_INTEGRATIONS_CONTRACT_VERSION;
  instance: ServiceInstanceDto;
}

export interface ServiceInstanceCommandDto {
  contractVersion: typeof SERVICE_INTEGRATIONS_CONTRACT_VERSION;
  instanceId: string;
  success: true;
}

export interface ServiceInstanceStatusDto {
  connectionStatus: string;
  contractVersion: typeof SERVICE_INTEGRATIONS_CONTRACT_VERSION;
  healthStatus: string;
  instanceId: string;
}

export interface ServiceInstanceQrDto {
  contractVersion: typeof SERVICE_INTEGRATIONS_CONTRACT_VERSION;
  instanceId: string;
  message: string;
  pairingCode: string | null;
  pending: boolean;
  qrCode: string | null;
}

function assertContract<T extends { contractVersion: number }>(response: T): T {
  if (
    !response
    || typeof response !== 'object'
    || response.contractVersion !== SERVICE_INTEGRATIONS_CONTRACT_VERSION
  ) {
    throw new Error('Versão incompatível do contrato de integrações.');
  }
  return response;
}

async function invoke<T extends { contractVersion: number }>(
  body: Record<string, unknown>,
): Promise<T> {
  return assertContract(await invokeEdgeFunction<T>(FUNCTION_NAME, { body }));
}

export function getMyServiceOverview(): Promise<PersonalServiceOverviewDto> {
  return invoke({ action: 'get_my_overview' });
}

export function listSharedServiceInstances(): Promise<SharedServiceInstancesDto> {
  return invoke({ action: 'list_shared_instances' });
}

export function createPersonalWhatsAppInstance(input: {
  description?: string | null;
  name: string;
  phoneNumber?: string;
}): Promise<ServiceInstanceMutationDto> {
  return invoke({ action: 'create_instance', scope: 'personal', ...input });
}

export function createSharedWhatsAppInstance(input: {
  adminNotes?: string | null;
  description?: string | null;
  evolutionInstanceName?: string;
  name: string;
}): Promise<ServiceInstanceMutationDto> {
  return invoke({ action: 'create_instance', scope: 'shared', ...input });
}

export function updateServiceInstance(input: {
  adminNotes?: string | null;
  description?: string | null;
  instanceId: string;
  name: string;
}): Promise<ServiceInstanceMutationDto> {
  return invoke({ action: 'update_instance', ...input });
}

export function connectServiceInstance(instanceId: string): Promise<ServiceInstanceCommandDto> {
  return invoke({ action: 'connect_instance', instanceId });
}

export function syncServiceInstanceStatus(
  instanceId: string,
  options: { silent?: boolean } = {},
): Promise<ServiceInstanceStatusDto> {
  return invoke({ action: 'sync_instance_status', instanceId, silent: options.silent ?? false });
}

export function getServiceInstanceQrCode(instanceId: string): Promise<ServiceInstanceQrDto> {
  return invoke({ action: 'get_instance_qr', instanceId });
}

export function configureServiceInstanceWebhook(
  instanceId: string,
): Promise<ServiceInstanceCommandDto> {
  return invoke({ action: 'configure_instance_webhook', instanceId });
}

export function deactivateServiceInstance(instanceId: string): Promise<ServiceInstanceCommandDto> {
  return invoke({ action: 'deactivate_instance', instanceId });
}

export function deleteServiceInstance(instanceId: string): Promise<ServiceInstanceCommandDto> {
  return invoke({ action: 'delete_instance', instanceId });
}

export function setServiceInstanceBlocked(
  instanceId: string,
  blocked: boolean,
): Promise<ServiceInstanceCommandDto> {
  return invoke({ action: 'set_instance_blocked', instanceId, blocked });
}

export function setServiceInstanceActive(
  instanceId: string,
  active: boolean,
): Promise<ServiceInstanceCommandDto> {
  return invoke({ action: 'set_instance_active', instanceId, active });
}
