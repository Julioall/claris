import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMoodleSession } from '@/features/auth/context/MoodleSessionContext';
import { useErrorLog } from '@/hooks/useErrorLog';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ChatMessage {
  id: string;
  text: string;
  timecreated: number;
  useridfrom: number;
  senderType: 'tutor' | 'student';
}

export interface Conversation {
  id: number;
  member: {
    id: number;
    fullname: string;
    profileimageurl?: string;
  };
  lastMessage?: {
    text: string;
    timecreated: number;
  };
  unreadcount: number;
  studentId?: string;
}

export interface UseChatResult {
  conversations: Conversation[];
  messages: ChatMessage[];
  currentMoodleUserId: number | null;
  activeMessagesUserId: string | null;
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  conversationsError: string | null;
  messagesError: string | null;
  isLoadingConversations: boolean;
  isRefreshingConversations: boolean;
  isLoadingMessages: boolean;
  isRefreshingMessages: boolean;
  fetchConversations: () => Promise<void>;
  fetchMessages: (moodleUserId: number | string, limit?: number) => Promise<void>;
  sendMessage: (moodleUserId: number | string, text: string) => Promise<boolean>;
  getCachedMessages: (moodleUserId: number | string) => ChatMessage[];
}

interface MoodleConvMember {
  id: number;
  fullname: string;
  profileimageurl?: string;
}

interface MoodleConvMessage {
  id: number;
  text: string;
  timecreated: number;
  useridfrom: number;
}

interface MoodleConversation {
  id: number;
  members?: MoodleConvMember[];
  messages?: MoodleConvMessage[];
  unreadcount?: number;
}

interface PersistedChatCache {
  conversations: Conversation[];
  messagesByUserId: Record<string, ChatMessage[]>;
  currentMoodleUserId: number | null;
}

const CHAT_CACHE_STORAGE_PREFIX = 'claris_moodle_chat_cache';
const moodleChatMemoryCache = new Map<string, PersistedChatCache>();

function normalizeChatErrorMessage(message: string): string {
  return message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isMissingConversationMessage(message?: string | null): boolean {
  if (!message) return false;

  const normalized = normalizeChatErrorMessage(message);
  return normalized.includes('conversa nao existe')
    || normalized.includes('conversation does not exist')
    || normalized.includes('conversation not found');
}

async function extractFunctionErrorMessage(error: unknown): Promise<string | null> {
  if (!error || typeof error !== 'object') return null;

  const context = (error as { context?: Response }).context;
  if (!context) return null;

  try {
    const payload = await context.clone().json();
    return typeof payload?.error === 'string' ? payload.error : null;
  } catch {
    return null;
  }
}

function getEmptyChatCache(): PersistedChatCache {
  return {
    conversations: [],
    messagesByUserId: {},
    currentMoodleUserId: null,
  };
}

function cloneConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    member: {
      ...conversation.member,
    },
    lastMessage: conversation.lastMessage
      ? {
          ...conversation.lastMessage,
        }
      : undefined,
  };
}

function cloneChatMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
  };
}

function cloneChatCache(cache: PersistedChatCache): PersistedChatCache {
  return {
    conversations: cache.conversations.map(cloneConversation),
    messagesByUserId: Object.fromEntries(
      Object.entries(cache.messagesByUserId).map(([moodleUserId, messages]) => [
        moodleUserId,
        messages.map(cloneChatMessage),
      ]),
    ),
    currentMoodleUserId: cache.currentMoodleUserId,
  };
}

function buildChatCacheKey(userId: string | undefined, session: { moodleUrl: string } | null) {
  if (!userId || !session) return null;
  return `${userId}:${session.moodleUrl}`;
}

function buildChatStorageKey(cacheKey: string) {
  return `${CHAT_CACHE_STORAGE_PREFIX}:${encodeURIComponent(cacheKey)}`;
}

function readPersistedChatCache(cacheKey: string | null): PersistedChatCache {
  if (!cacheKey) return getEmptyChatCache();

  const inMemoryCache = moodleChatMemoryCache.get(cacheKey);
  if (inMemoryCache) {
    return cloneChatCache(inMemoryCache);
  }

  if (typeof window === 'undefined') {
    return getEmptyChatCache();
  }

  try {
    const storedValue = window.sessionStorage.getItem(buildChatStorageKey(cacheKey));
    if (!storedValue) return getEmptyChatCache();

    const parsed = JSON.parse(storedValue) as Partial<PersistedChatCache> | null;
    const normalizedCache: PersistedChatCache = {
      conversations: Array.isArray(parsed?.conversations) ? (parsed?.conversations as Conversation[]) : [],
      messagesByUserId:
        parsed?.messagesByUserId && typeof parsed.messagesByUserId === 'object'
          ? (parsed.messagesByUserId as Record<string, ChatMessage[]>)
          : {},
      currentMoodleUserId:
        typeof parsed?.currentMoodleUserId === 'number' ? parsed.currentMoodleUserId : null,
    };

    moodleChatMemoryCache.set(cacheKey, cloneChatCache(normalizedCache));
    return cloneChatCache(normalizedCache);
  } catch {
    return getEmptyChatCache();
  }
}

function writePersistedChatCache(cacheKey: string | null, cache: PersistedChatCache) {
  if (!cacheKey) return;

  const clonedCache = cloneChatCache(cache);
  moodleChatMemoryCache.set(cacheKey, clonedCache);

  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(buildChatStorageKey(cacheKey), JSON.stringify(clonedCache));
  } catch {
    // noop
  }
}

function patchConversationCollection(
  conversations: Conversation[],
  moodleUserId: string,
  patch: Partial<Conversation>,
) {
  let didUpdate = false;

  const nextConversations = conversations.map((conversation) => {
    if (String(conversation.member.id) !== moodleUserId) {
      return conversation;
    }

    didUpdate = true;
    return {
      ...conversation,
      ...patch,
    };
  });

  return didUpdate ? nextConversations : conversations;
}

export function useChat(): UseChatResult {
  const { user } = useAuth();
  const session = useMoodleSession();
  const { track } = useTrackEvent();
  const { logError } = useErrorLog();
  const chatCacheKey = useMemo(() => buildChatCacheKey(user?.id, session), [user?.id, session]);
  const initialCache = useMemo(() => readPersistedChatCache(chatCacheKey), [chatCacheKey]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isRefreshingConversations, setIsRefreshingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isRefreshingMessages, setIsRefreshingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>(initialCache.conversations);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMoodleUserId, setCurrentMoodleUserId] = useState<number | null>(initialCache.currentMoodleUserId);
  const [activeMessagesUserId, setActiveMessagesUserId] = useState<string | null>(null);
  const conversationsCacheRef = useRef<Conversation[]>(initialCache.conversations);
  const messagesCacheRef = useRef<Map<string, ChatMessage[]>>(new Map(Object.entries(initialCache.messagesByUserId)));
  const currentMoodleUserIdRef = useRef<number | null>(initialCache.currentMoodleUserId);
  const activeMessagesKeyRef = useRef<string | null>(null);

  const persistCurrentCache = useCallback(() => {
    writePersistedChatCache(chatCacheKey, {
      conversations: conversationsCacheRef.current,
      messagesByUserId: Object.fromEntries(messagesCacheRef.current.entries()),
      currentMoodleUserId: currentMoodleUserIdRef.current,
    });
  }, [chatCacheKey]);

  const syncCurrentMoodleUserId = useCallback((nextCurrentMoodleUserId: number | null) => {
    currentMoodleUserIdRef.current = nextCurrentMoodleUserId;
    setCurrentMoodleUserId(nextCurrentMoodleUserId);
  }, []);

  const syncConversationsState = useCallback((nextConversations: Conversation[]) => {
    conversationsCacheRef.current = nextConversations;
    setConversations(nextConversations);
    persistCurrentCache();
  }, [persistCurrentCache]);

  const syncMessagesState = useCallback((moodleUserId: string, nextMessages: ChatMessage[]) => {
    messagesCacheRef.current.set(moodleUserId, nextMessages);
    if (activeMessagesKeyRef.current === moodleUserId) {
      setMessages(nextMessages);
    }
    persistCurrentCache();
  }, [persistCurrentCache]);

  const syncConversationPatch = useCallback((moodleUserId: string, patch: Partial<Conversation>) => {
    const nextConversations = patchConversationCollection(conversationsCacheRef.current, moodleUserId, patch);
    if (nextConversations === conversationsCacheRef.current) return;

    syncConversationsState(nextConversations);
  }, [syncConversationsState]);

  const getCachedMessages = useCallback((moodleUserId: number | string) => {
    return messagesCacheRef.current.get(String(moodleUserId)) || [];
  }, []);

  useEffect(() => {
    const hydratedCache = readPersistedChatCache(chatCacheKey);

    conversationsCacheRef.current = hydratedCache.conversations;
    messagesCacheRef.current = new Map(Object.entries(hydratedCache.messagesByUserId));
    currentMoodleUserIdRef.current = hydratedCache.currentMoodleUserId;
    activeMessagesKeyRef.current = null;
    setConversations(hydratedCache.conversations);
    setMessages([]);
    setCurrentMoodleUserId(hydratedCache.currentMoodleUserId);
    setActiveMessagesUserId(null);
    setConversationsError(null);
    setMessagesError(null);
    setIsLoadingConversations(false);
    setIsRefreshingConversations(false);
    setIsLoadingMessages(false);
    setIsRefreshingMessages(false);
    setIsSending(false);
  }, [chatCacheKey]);

  const fetchConversations = useCallback(async () => {
    if (!session) return;

    const hasCachedConversations = conversationsCacheRef.current.length > 0;

    setConversationsError(null);
    if (hasCachedConversations) {
      setConversations(conversationsCacheRef.current);
      setIsLoadingConversations(false);
      setIsRefreshingConversations(true);
    } else {
      setIsLoadingConversations(true);
      setIsRefreshingConversations(false);
    }

    try {
      const { data, error: fnError } = await supabase.functions.invoke('moodle-messaging', {
        body: {
          action: 'get_conversations',
          moodleUrl: session.moodleUrl,
          token: session.moodleToken,
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      syncCurrentMoodleUserId(data.current_user_id);

      const mapped: Conversation[] = (data.conversations || []).map((conversation: MoodleConversation) => {
        const otherMember =
          conversation.members?.find((member: MoodleConvMember) => member.id !== data.current_user_id)
          || conversation.members?.[0];
        const lastMessage = conversation.messages?.[0];

        return {
          id: conversation.id,
          member: otherMember || { id: 0, fullname: 'Desconhecido' },
          lastMessage: lastMessage
            ? {
                text: lastMessage.text,
                timecreated: lastMessage.timecreated,
              }
            : undefined,
          unreadcount: conversation.unreadcount || 0,
        };
      });

      const moodleUserIds = mapped.map((conversation) => String(conversation.member.id));
      if (moodleUserIds.length > 0) {
        const { data: students, error: studentsError } = await supabase
          .from('students')
          .select('id, moodle_user_id')
          .in('moodle_user_id', moodleUserIds);

        if (studentsError) {
          console.error('Error matching Moodle users to students:', studentsError);
        } else {
          const moodleToStudent = new Map(students?.map((student) => [student.moodle_user_id, student.id]) || []);
          mapped.forEach((conversation) => {
            conversation.studentId = moodleToStudent.get(String(conversation.member.id));
          });
        }
      }

      mapped.sort((left, right) => {
        const leftTime = left.lastMessage?.timecreated || 0;
        const rightTime = right.lastMessage?.timecreated || 0;
        return rightTime - leftTime;
      });

      syncConversationsState(mapped);
    } catch (err) {
      console.error('Error fetching conversations:', err);
      setConversationsError(err instanceof Error ? err.message : 'Erro ao carregar conversas');
    } finally {
      persistCurrentCache();
      setIsLoadingConversations(false);
      setIsRefreshingConversations(false);
    }
  }, [persistCurrentCache, session, syncConversationsState, syncCurrentMoodleUserId]);

  const fetchMessages = useCallback(async (moodleUserId: number | string, limit?: number) => {
    if (!session) return;

    const messagesKey = String(moodleUserId);
    const cachedMessages = messagesCacheRef.current.get(messagesKey);

    activeMessagesKeyRef.current = messagesKey;
    setActiveMessagesUserId(messagesKey);
    setMessagesError(null);
    if (cachedMessages) {
      setMessages(cachedMessages);
      setIsLoadingMessages(false);
      setIsRefreshingMessages(true);
    } else {
      setMessages([]);
      setIsLoadingMessages(true);
      setIsRefreshingMessages(false);
    }

    try {
      const { data, error: fnError } = await supabase.functions.invoke('moodle-messaging', {
        body: {
          action: 'get_messages',
          moodleUrl: session.moodleUrl,
          token: session.moodleToken,
          moodle_user_id: Number(moodleUserId),
          limit_num: limit || 50,
        },
      });

      if (fnError) {
        const detailedMessage = await extractFunctionErrorMessage(fnError);
        if (isMissingConversationMessage(detailedMessage) || isMissingConversationMessage(fnError.message)) {
          syncMessagesState(messagesKey, []);
          syncConversationPatch(messagesKey, { unreadcount: 0 });
          return;
        }

        throw new Error(detailedMessage || fnError.message);
      }

      if (data?.error) {
        if (isMissingConversationMessage(data.error)) {
          syncMessagesState(messagesKey, []);
          syncConversationPatch(messagesKey, { unreadcount: 0 });
          return;
        }

        throw new Error(data.error);
      }

      syncCurrentMoodleUserId(data.current_user_id);

      const mapped: ChatMessage[] = (data.messages || []).map((message: MoodleConvMessage) => ({
        id: String(message.id),
        text: message.text,
        timecreated: message.timecreated,
        useridfrom: message.useridfrom,
        senderType: message.useridfrom === data.current_user_id ? 'tutor' : 'student',
      }));

      mapped.sort((left, right) => left.timecreated - right.timecreated);

      syncMessagesState(messagesKey, mapped);

      const lastMessage = mapped.at(-1);
      syncConversationPatch(messagesKey, {
        unreadcount: 0,
        ...(lastMessage
          ? {
              lastMessage: {
                text: lastMessage.text,
                timecreated: lastMessage.timecreated,
              },
            }
          : {}),
      });
    } catch (err) {
      if (err instanceof Error && isMissingConversationMessage(err.message)) {
        syncMessagesState(messagesKey, []);
        setMessagesError(null);
        syncConversationPatch(messagesKey, { unreadcount: 0 });
        return;
      }

      console.error('Error fetching messages:', err);
      setMessagesError(err instanceof Error ? err.message : 'Erro ao carregar mensagens');
    } finally {
      persistCurrentCache();
      if (activeMessagesKeyRef.current === messagesKey) {
        setIsLoadingMessages(false);
        setIsRefreshingMessages(false);
      }
    }
  }, [persistCurrentCache, session, syncConversationPatch, syncCurrentMoodleUserId, syncMessagesState]);

  const sendMessage = useCallback(async (moodleUserId: number | string, text: string) => {
    if (!session || !text.trim()) return false;

    const messagesKey = String(moodleUserId);
    const normalizedText = text.trim();

    setIsSending(true);
    setMessagesError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('moodle-messaging', {
        body: {
          action: 'send_message',
          moodleUrl: session.moodleUrl,
          token: session.moodleToken,
          moodle_user_id: Number(moodleUserId),
          message: normalizedText,
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      const sentAt = Math.floor(Date.now() / 1000);
      const newMessage: ChatMessage = {
        id: data.message_id ? String(data.message_id) : `temp-${Date.now()}`,
        text: normalizedText,
        timecreated: sentAt,
        useridfrom: currentMoodleUserIdRef.current || 0,
        senderType: 'tutor',
      };

      const nextMessages = [...(messagesCacheRef.current.get(messagesKey) || []), newMessage];
      activeMessagesKeyRef.current = messagesKey;
      setActiveMessagesUserId(messagesKey);
      syncMessagesState(messagesKey, nextMessages);
      syncConversationPatch(messagesKey, {
        unreadcount: 0,
        lastMessage: {
          text: normalizedText,
          timecreated: sentAt,
        },
      });

      void track('send_message', { resource: String(moodleUserId) });
      return true;
    } catch (err) {
      console.error('Error sending message:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro ao enviar mensagem';
      setMessagesError(errorMessage);
      void logError('Erro ao enviar mensagem via Moodle', {
        severity: 'error',
        category: 'integration',
        payload: { message: errorMessage, moodleUserId: String(moodleUserId) },
      });
      return false;
    } finally {
      persistCurrentCache();
      setIsSending(false);
    }
  }, [logError, persistCurrentCache, session, syncConversationPatch, syncMessagesState, track]);

  return {
    conversations,
    messages,
    currentMoodleUserId,
    activeMessagesUserId,
    isLoading: isLoadingConversations || isLoadingMessages,
    isSending,
    error: conversationsError || messagesError,
    conversationsError,
    messagesError,
    isLoadingConversations,
    isRefreshingConversations,
    isLoadingMessages,
    isRefreshingMessages,
    fetchConversations,
    fetchMessages,
    sendMessage,
    getCachedMessages,
  };
}
