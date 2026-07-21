export {
  connectServiceInstance,
  createSharedWhatsAppInstance,
  deactivateServiceInstance,
  deleteServiceInstance,
  getServiceInstanceQrCode,
  listSharedServiceInstances,
  setServiceInstanceActive,
  setServiceInstanceBlocked,
  syncServiceInstanceStatus,
  updateServiceInstance,
} from '@/features/services/api/serviceInstances';

export type {
  AdminServiceInstanceDto,
  ServiceInstanceQrDto,
  ServiceInstanceStatusDto,
} from '@/features/services/api/serviceInstances';
