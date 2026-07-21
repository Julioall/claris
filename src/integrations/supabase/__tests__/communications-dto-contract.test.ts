import { describe, expect, it } from 'vitest';

import type { BulkMessageAudienceDto as BackendAudienceDto } from '../../../../supabase/functions/bulk-message-audience/contract.ts';
import type { BulkMessageAudienceDto as FrontendAudienceDto } from '@/features/messages/api/contracts/bulk-messaging.contract';
import type { ScheduledMessageDto as BackendScheduledMessageDto } from '../../../../supabase/functions/campaigns/contract.ts';
import type { ScheduledMessageDto as FrontendScheduledMessageDto } from '@/features/campaigns/api/contracts/campaigns.contract';
import type { MessageTemplateDto as BackendTemplateDto } from '../../../../supabase/functions/message-templates/contract.ts';
import type { MessageTemplateDto as FrontendTemplateDto } from '@/features/messages/api/contracts/message-templates.contract';
import type { WhatsAppMessageDto as BackendWhatsAppMessageDto } from '../../../../supabase/functions/whatsapp-messaging/contract.ts';
import type { WhatsAppMessageDto as FrontendWhatsAppMessageDto } from '@/features/whatsapp/api/contracts/whatsapp-messaging.contract';

describe('communications DTO compatibility', () => {
  it('keeps frontend and backend contracts assignable in both directions', () => {
    const audienceFrontend: FrontendAudienceDto = {} as BackendAudienceDto;
    const audienceBackend: BackendAudienceDto = {} as FrontendAudienceDto;
    const campaignFrontend: FrontendScheduledMessageDto = {} as BackendScheduledMessageDto;
    const campaignBackend: BackendScheduledMessageDto = {} as FrontendScheduledMessageDto;
    const templateFrontend: FrontendTemplateDto = {} as BackendTemplateDto;
    const templateBackend: BackendTemplateDto = {} as FrontendTemplateDto;
    const whatsappFrontend: FrontendWhatsAppMessageDto = {} as BackendWhatsAppMessageDto;
    const whatsappBackend: BackendWhatsAppMessageDto = {} as FrontendWhatsAppMessageDto;

    expect([
      audienceFrontend,
      audienceBackend,
      campaignFrontend,
      campaignBackend,
      templateFrontend,
      templateBackend,
      whatsappFrontend,
      whatsappBackend,
    ]).toHaveLength(8);
  });
});
