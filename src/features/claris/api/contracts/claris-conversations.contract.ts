export interface ClarisConversationMessageDto {
  content: string;
  richBlocks?: unknown[];
  role: 'assistant' | 'user';
}

export interface ClarisConversationDto {
  id: string;
  lastContextRoute: string | null;
  messages: ClarisConversationMessageDto[];
  title: string;
  updatedAt: string;
}

export interface ClarisConversationsListDto {
  contractVersion: 1;
  items: ClarisConversationDto[];
}

export interface ClarisConversationCommandDto {
  contractVersion: 1;
  conversation: ClarisConversationDto;
}
