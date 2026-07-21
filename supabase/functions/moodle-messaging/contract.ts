export const MOODLE_MESSAGING_CONTRACT_VERSION = 1 as const

export interface MoodleConversationDto {
  id: number
  lastMessage: {
    createdAtUnix: number
    text: string
  } | null
  member: {
    fullName: string
    id: number
    profileImageUrl: string | null
  }
  studentId: string | null
  unreadCount: number
}

export interface MoodleConversationsDto {
  contractVersion: typeof MOODLE_MESSAGING_CONTRACT_VERSION
  currentMoodleUserId: number
  items: MoodleConversationDto[]
}

export interface MoodleMessageDto {
  createdAtUnix: number
  id: string
  senderMoodleUserId: number
  senderType: 'student' | 'tutor'
  text: string
}

export interface MoodleMessagesDto {
  contractVersion: typeof MOODLE_MESSAGING_CONTRACT_VERSION
  conversationId: number | null
  currentMoodleUserId: number
  items: MoodleMessageDto[]
}

export interface MoodleMessageSentDto {
  contractVersion: typeof MOODLE_MESSAGING_CONTRACT_VERSION
  messageId: string | null
}

export type MoodleMessagingResponseDto =
  | MoodleConversationsDto
  | MoodleMessagesDto
  | MoodleMessageSentDto
