import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  callWhatsAppMessaging,
  callWhatsAppMessagingWithProgress,
  fetchActiveWhatsAppInstances,
} from '@/features/whatsapp/api/messaging';
import { buildContactList, filterDirectoryEntries, findSelectedThread, getMessageTypeLabel, mergeChatsWithContacts } from '@/features/whatsapp/lib/chat';
import { createDraftAttachment, revokeDraftAttachment } from '@/features/whatsapp/lib/uploads';
import type {
  DraftAttachment,
  WhatsAppContact,
  WhatsAppConversation,
  WhatsAppInstance,
  WhatsAppMessage,
  WhatsAppMessageType,
} from '@/features/whatsapp/types';
import { useBackgroundActivityFlag } from '@/contexts/BackgroundActivityContext';
import { useIsMobile } from '@/hooks/use-mobile';

function sortInstances(instances: WhatsAppInstance[]) {
  return [...instances].sort((a, b) => {
    const aConnected = a.connection_status === 'connected' ? 0 : 1;
    const bConnected = b.connection_status === 'connected' ? 0 : 1;
    if (aConnected !== bConnected) return aConnected - bConnected;

    const aScope = a.scope === 'personal' ? 0 : 1;
    const bScope = b.scope === 'personal' ? 0 : 1;
    if (aScope !== bScope) return aScope - bScope;

    return a.name.localeCompare(b.name);
  });
}

function buildAttachmentMessage(
  attachment: DraftAttachment,
  remoteJid: string,
  fallbackMessage: WhatsAppMessage,
): WhatsAppMessage {
  const resolvedType: WhatsAppMessageType = attachment.send_as_sticker ? 'sticker' : attachment.kind;

  return {
    ...fallbackMessage,
    type: fallbackMessage.type === 'unknown' ? resolvedType : fallbackMessage.type,
    text: fallbackMessage.text === getMessageTypeLabel(fallbackMessage.type)
      ? getMessageTypeLabel(resolvedType)
      : fallbackMessage.text,
    media: {
      media_type: resolvedType === 'sticker' ? 'sticker' : attachment.kind,
      mime_type: fallbackMessage.media?.mime_type ?? attachment.mime_type,
      file_name: fallbackMessage.media?.file_name ?? attachment.file_name,
      caption: fallbackMessage.media?.caption ?? null,
      url: fallbackMessage.media?.url ?? null,
      direct_path: fallbackMessage.media?.direct_path ?? null,
      preview_data_url: fallbackMessage.media?.preview_data_url
        ?? (attachment.kind === 'image' ? attachment.data_url : null),
      file_size_bytes: fallbackMessage.media?.file_size_bytes ?? attachment.size,
      duration_seconds: fallbackMessage.media?.duration_seconds ?? null,
      width: fallbackMessage.media?.width ?? null,
      height: fallbackMessage.media?.height ?? null,
      is_voice_note: attachment.kind === 'audio',
      is_animated: attachment.send_as_sticker,
      requires_resolve: fallbackMessage.media?.requires_resolve ?? !fallbackMessage.media?.url,
    },
    remote_jid: remoteJid,
  };
}

function upsertConversationCache(
  current: WhatsAppConversation[] | undefined,
  remoteJid: string,
  nextMessage: WhatsAppMessage,
  fallbackName: string,
  fallbackPhone: string | null,
) {
  const entries = current ? [...current] : [];
  const index = entries.findIndex((conversation) => conversation.id === remoteJid);

  const nextConversation: WhatsAppConversation = {
    id: remoteJid,
    remote_jid: remoteJid,
    name: index >= 0 ? entries[index].name : fallbackName,
    phone: index >= 0 ? entries[index].phone : fallbackPhone,
    unread_count: 0,
    last_message_text: nextMessage.media?.caption?.trim() || nextMessage.text,
    last_message_at: nextMessage.sent_at,
    is_group: index >= 0 ? entries[index].is_group : false,
    profile_picture_url: index >= 0 ? entries[index].profile_picture_url : null,
  };

  if (index >= 0) {
    entries.splice(index, 1);
  }

  return [nextConversation, ...entries];
}

export function useWhatsAppWorkspace() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [directoryTab, setDirectoryTab] = useState<'chats' | 'contacts'>('chats');
  const [draftMessage, setDraftMessage] = useState('');
  const [draftAttachment, setDraftAttachment] = useState<DraftAttachment | null>(null);
  const draftAttachmentRef = useRef<DraftAttachment | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<'idle' | 'preparing' | 'uploading'>('idle');

  const {
    data: instances = [],
    isLoading: isLoadingInstances,
    error: instancesError,
  } = useQuery({
    queryKey: ['page-whatsapp-instances'],
    queryFn: async () => {
      const { data, error } = await fetchActiveWhatsAppInstances();
      if (error) throw error;

      return sortInstances((data ?? []) as WhatsAppInstance[]);
    },
  });

  const selectedInstance = instances.find((instance) => instance.id === selectedInstanceId) ?? null;
  const canLoadChats = selectedInstance?.connection_status === 'connected';

  const {
    data: rawContacts = [],
    isLoading: isLoadingContacts,
    isFetching: isFetchingContacts,
    error: contactsError,
    refetch: refetchContacts,
  } = useQuery({
    queryKey: ['whatsapp-contacts', selectedInstanceId],
    queryFn: async () => {
      const data = await callWhatsAppMessaging('get_contacts', {
        instance_id: selectedInstanceId,
      });

      return (data.contacts ?? []) as WhatsAppContact[];
    },
    enabled: !!selectedInstanceId && canLoadChats,
    refetchInterval: 60_000,
  });

  const {
    data: rawConversations = [],
    isLoading: isLoadingConversations,
    isFetching: isFetchingConversations,
    error: conversationsError,
    refetch: refetchConversations,
  } = useQuery({
    queryKey: ['whatsapp-conversations', selectedInstanceId],
    queryFn: async () => {
      const data = await callWhatsAppMessaging('get_chats', {
        instance_id: selectedInstanceId,
      });

      return (data.conversations ?? []) as WhatsAppConversation[];
    },
    enabled: !!selectedInstanceId && canLoadChats,
    refetchInterval: 15_000,
  });

  const chatEntries = mergeChatsWithContacts(rawConversations, rawContacts);
  const contactEntries = buildContactList(rawContacts, chatEntries);
  const selectedThread = findSelectedThread(selectedThreadId, chatEntries, contactEntries);

  const {
    data: messages = [],
    isLoading: isLoadingMessages,
    isFetching: isFetchingMessages,
    error: messagesError,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ['whatsapp-messages', selectedInstanceId, selectedThread?.remote_jid],
    queryFn: async () => {
      const data = await callWhatsAppMessaging('get_messages', {
        instance_id: selectedInstanceId,
        remote_jid: selectedThread?.remote_jid,
        limit: 120,
      });

      return (data.messages ?? []) as WhatsAppMessage[];
    },
    enabled: !!selectedInstanceId && !!selectedThread?.remote_jid && canLoadChats,
    refetchInterval: selectedThread ? 6_000 : false,
  });

  const filteredChats = filterDirectoryEntries(chatEntries, deferredSearchQuery);
  const filteredContacts = filterDirectoryEntries(contactEntries, deferredSearchQuery);

  useEffect(() => {
    if (!selectedInstanceId && instances.length > 0) {
      setSelectedInstanceId(instances[0].id);
      return;
    }

    if (selectedInstanceId && !instances.some((instance) => instance.id === selectedInstanceId)) {
      setSelectedInstanceId(instances[0]?.id ?? null);
    }
  }, [instances, selectedInstanceId]);

  useEffect(() => {
    if (!canLoadChats) {
      setSelectedThreadId(null);
      return;
    }

    const availableIds = new Set([
      ...chatEntries.map((entry) => entry.id),
      ...contactEntries.map((entry) => entry.id),
    ]);

    if (selectedThreadId && availableIds.has(selectedThreadId)) {
      return;
    }

    if (!isMobile) {
      setSelectedThreadId(chatEntries[0]?.id ?? null);
    }
  }, [canLoadChats, chatEntries, contactEntries, isMobile, selectedThreadId]);

  useEffect(() => {
    draftAttachmentRef.current = draftAttachment;
  }, [draftAttachment]);

  useEffect(() => () => {
    revokeDraftAttachment(draftAttachmentRef.current);
  }, []);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInstanceId || !selectedThread) {
        throw new Error('Selecione uma conversa antes de enviar.');
      }

      if (draftAttachment) {
        setUploadStage('uploading');
        setUploadProgress(40);

        const action = draftAttachment.send_as_sticker ? 'send_sticker' : 'send_media';
        return callWhatsAppMessagingWithProgress(
          action,
          {
            instance_id: selectedInstanceId,
            remote_jid: selectedThread.remote_jid,
            media: draftAttachment.base64,
            media_type: draftAttachment.kind,
            mime_type: draftAttachment.mime_type,
            file_name: draftAttachment.file_name,
            caption: draftAttachment.send_as_sticker || draftAttachment.kind === 'audio'
              ? undefined
              : draftMessage.trim() || undefined,
          },
          setUploadProgress,
        );
      }

      return callWhatsAppMessaging('send_message', {
        instance_id: selectedInstanceId,
        remote_jid: selectedThread.remote_jid,
        message: draftMessage.trim(),
      });
    },
    onSuccess: (data) => {
      if (!selectedInstanceId || !selectedThread) return;

      const rawMessage = (data.message ?? null) as WhatsAppMessage | null;
      const nextMessage = rawMessage
        ? (draftAttachment ? buildAttachmentMessage(draftAttachment, selectedThread.remote_jid, rawMessage) : rawMessage)
        : null;

      if (nextMessage) {
        queryClient.setQueryData<WhatsAppMessage[]>(
          ['whatsapp-messages', selectedInstanceId, selectedThread.remote_jid],
          (current = []) => (
            current.some((message) => message.id === nextMessage.id)
              ? current
              : [...current, nextMessage]
          ),
        );

        queryClient.setQueryData<WhatsAppConversation[]>(
          ['whatsapp-conversations', selectedInstanceId],
          (current) => upsertConversationCache(
            current,
            selectedThread.remote_jid,
            nextMessage,
            selectedThread.name,
            selectedThread.phone,
          ),
        );
      }

      revokeDraftAttachment(draftAttachment);
      setDraftAttachment(null);
      setDraftMessage('');
      setSendError(null);
      setUploadProgress(0);
      setUploadStage('idle');
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', selectedInstanceId, selectedThread.remote_jid] });
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations', selectedInstanceId] });
    },
    onError: (error) => {
      setSendError(error instanceof Error ? error.message : 'Erro ao enviar mensagem');
      setUploadStage('idle');
    },
    onSettled: () => {
      setUploadProgress(0);
    },
  });

  useBackgroundActivityFlag({
    id: selectedInstanceId ? `whatsapp:send:${selectedInstanceId}` : 'whatsapp:send',
    active: sendMutation.isPending,
    label: 'Enviando mensagem no WhatsApp',
    description: selectedThread
      ? `Conversa com ${selectedThread.name}`
      : 'Processando envio da mensagem.',
    source: 'whatsapp',
  });

  const isCaptionDisabled = !!draftAttachment && (draftAttachment.kind === 'audio' || draftAttachment.send_as_sticker);

  async function handleAttachmentSelection(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    setSendError(null);
    setUploadStage('preparing');
    setUploadProgress(5);

    try {
      const nextAttachment = await createDraftAttachment(file, setUploadProgress);
      revokeDraftAttachment(draftAttachment);
      setDraftAttachment(nextAttachment);
      setUploadProgress(0);
      setUploadStage('idle');
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Falha ao preparar o arquivo');
      setUploadProgress(0);
      setUploadStage('idle');
    }
  }

  function handleRemoveAttachment() {
    revokeDraftAttachment(draftAttachment);
    setDraftAttachment(null);
    setUploadProgress(0);
    setUploadStage('idle');
  }

  function handleToggleSticker(nextValue: boolean) {
    if (!draftAttachment?.can_send_as_sticker) return;

    setDraftAttachment({
      ...draftAttachment,
      send_as_sticker: nextValue,
    });

    if (nextValue) {
      setDraftMessage('');
    }
  }

  function handleSelectThread(threadId: string) {
    setSelectedThreadId(threadId);
    setSendError(null);

    if (!selectedInstanceId) return;

    queryClient.setQueryData<WhatsAppConversation[]>(
      ['whatsapp-conversations', selectedInstanceId],
      (current = []) => current.map((conversation) => (
        conversation.id === threadId
          ? { ...conversation, unread_count: 0 }
          : conversation
      )),
    );
  }

  function handleSend() {
    if (!selectedThread) return;
    if (selectedThread.is_group) return;

    if (!draftAttachment && !draftMessage.trim()) return;

    if (isCaptionDisabled && draftMessage.trim()) {
      setSendError('Este tipo de envio nao aceita legenda.');
      return;
    }

    setSendError(null);
    void sendMutation.mutateAsync();
  }

  async function refreshAll() {
    await Promise.allSettled([
      refetchContacts(),
      refetchConversations(),
      selectedThread ? refetchMessages() : Promise.resolve(null),
    ]);
  }

  return {
    instances,
    isLoadingInstances,
    instancesError,
    selectedInstance,
    selectedInstanceId,
    setSelectedInstanceId,
    canLoadChats,
    directoryTab,
    setDirectoryTab,
    searchQuery,
    setSearchQuery,
    chatEntries,
    filteredChats,
    isLoadingContacts,
    isFetchingContacts,
    contactsError,
    filteredContacts,
    isLoadingConversations,
    isFetchingConversations,
    conversationsError,
    selectedThread,
    selectedThreadId,
    handleSelectThread,
    messages,
    isLoadingMessages,
    isFetchingMessages,
    messagesError,
    draftMessage,
    setDraftMessage,
    draftAttachment,
    sendError,
    sendMutation,
    uploadProgress,
    uploadStage,
    isCaptionDisabled,
    handleAttachmentSelection,
    handleRemoveAttachment,
    handleToggleSticker,
    handleSend,
    refreshAll,
    setSelectedThreadId,
    refetchConversations,
  };
}
