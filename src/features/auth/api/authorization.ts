import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';
import type { AuthorizationContextDto } from './contracts/authorization.contract';

export function getAuthorizationContext() {
  return invokeEdgeFunction<AuthorizationContextDto>('access-control', {
    body: { action: 'get_context' },
  });
}
