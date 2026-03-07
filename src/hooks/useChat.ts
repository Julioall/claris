import { useState, useCallback } from 'react';
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
  studentId?: string; // mapped from our DB
}

function normalizeChatErrorMessage(message: string): string {
  return message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function isMissingConversationMessage(message?: string | null): boolean {
  if (!message) return false

  const normalized = normalizeChatErrorMessage(message)
  return normalized.includes('conversa nao existe') ||
    normalized.includes('conversation does not exist') ||
    normalized.includes('conversation not found')
}

async function extractFunctionErrorMessage(error: unknown): Promise<string | null> {
  if (!error || typeof error !== 'object') return null

  const context = (error as { context?: Response }).context
  if (!context) return null

  try {
    const payload = await context.clone().json()
    return typeof payload?.error === 'string' ? payload.error : null
  } catch {
    return null
  }
}

export function useChat() {
  const { moodleSession: session } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMoodleUserId, setCurrentMoodleUserId] = useState<number | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!session) return;

    setIsLoading(true);
    setError(null);

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

      const currentUserId = data.current_user_id;
      setCurrentMoodleUserId(currentUserId);

      // Map conversations — each has members (other user) + last message
      const mapped: Conversation[] = (data.conversations || []).map((conv: any) => {
        const otherMember = conv.members?.find((m: any) => m.id !== currentUserId) || conv.members?.[0];
        const lastMsg = conv.messages?.[0];

        return {
          id: conv.id,
          member: otherMember || { id: 0, fullname: 'Desconhecido' },
          lastMessage: lastMsg ? { text: lastMsg.text, timecreated: lastMsg.timecreated } : undefined,
          unreadcount: conv.unreadcount || 0,
        };
      });

      // Try to match with student IDs from our DB
      const moodleUserIds = mapped.map(c => String(c.member.id));
      if (moodleUserIds.length > 0) {
        const { data: students } = await supabase
          .from('students')
          .select('id, moodle_user_id')
          .in('moodle_user_id', moodleUserIds);

        const moodleToStudent = new Map(students?.map(s => [s.moodle_user_id, s.id]) || []);
        mapped.forEach(c => {
          c.studentId = moodleToStudent.get(String(c.member.id));
        });
      }

      setConversations(mapped);
    } catch (err) {
      console.error('Error fetching conversations:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar conversas');
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  const fetchMessages = useCallback(async (moodleUserId: number | string, limit?: number) => {
    if (!session) return;

    setIsLoading(true);
    setError(null);

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
          setMessages([]);
          return;
        }

        throw new Error(detailedMessage || fnError.message);
      }

      if (data?.error) {
        if (isMissingConversationMessage(data.error)) {
          setMessages([]);
          return;
        }

        throw new Error(data.error);
      }

      const currentUserId = data.current_user_id;
      setCurrentMoodleUserId(currentUserId);

      const mapped: ChatMessage[] = (data.messages || []).map((msg: any) => ({
        id: String(msg.id),
        text: msg.text,
        timecreated: msg.timecreated,
        useridfrom: msg.useridfrom,
        senderType: msg.useridfrom === currentUserId ? 'tutor' : 'student',
      }));

      // Sort by time ascending
      mapped.sort((a, b) => a.timecreated - b.timecreated);

      setMessages(mapped);
    } catch (err) {
      if (err instanceof Error && isMissingConversationMessage(err.message)) {
        setMessages([]);
        setError(null);
        return;
      }

      console.error('Error fetching messages:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar mensagens');
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  const sendMessage = useCallback(async (moodleUserId: number | string, text: string) => {
    if (!session || !text.trim()) return false;

    setIsSending(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('moodle-messaging', {
        body: {
          action: 'send_message',
          moodleUrl: session.moodleUrl,
          token: session.moodleToken,
          moodle_user_id: Number(moodleUserId),
          message: text.trim(),
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      // Add sent message optimistically
      const newMsg: ChatMessage = {
        id: data.message_id ? String(data.message_id) : `temp-${Date.now()}`,
        text: text.trim(),
        timecreated: Math.floor(Date.now() / 1000),
        useridfrom: currentMoodleUserId || 0,
        senderType: 'tutor',
      };

      setMessages(prev => [...prev, newMsg]);
      return true;
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err instanceof Error ? err.message : 'Erro ao enviar mensagem');
      return false;
    } finally {
      setIsSending(false);
    }
  }, [session, currentMoodleUserId]);

  return {
    conversations,
    messages,
    currentMoodleUserId,
    isLoading,
    isSending,
    error,
    fetchConversations,
    fetchMessages,
    sendMessage,
  };
}
