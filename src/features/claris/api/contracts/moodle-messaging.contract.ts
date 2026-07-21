export interface MoodleConversationDto {
  id: number;
  lastMessage: {
    createdAtUnix: number;
    text: string;
  } | null;
  member: {
    fullName: string;
    id: number;
    profileImageUrl: string | null;
  };
  studentId: string | null;
  unreadCount: number;
}

export interface MoodleConversationsDto {
  contractVersion: 1;
  currentMoodleUserId: number;
  items: MoodleConversationDto[];
}

export interface MoodleMessageDto {
  createdAtUnix: number;
  id: string;
  senderMoodleUserId: number;
  senderType: 'student' | 'tutor';
  text: string;
}

export interface MoodleMessagesDto {
  contractVersion: 1;
  conversationId: number | null;
  currentMoodleUserId: number;
  items: MoodleMessageDto[];
}

export interface MoodleMessageSentDto {
  contractVersion: 1;
  messageId: string | null;
}
