import { apiClient } from '@/services/apiClient';

export interface ChatUser {
  id: string;
  name: string;
  role?: string;
  avatar?: string | null;
}

export interface ChatConversation {
  user_id: string;
  name: string;
  role?: string;
  avatar?: string | null;
  last_message: string;
  last_at: string | null;
  last_from_me: boolean;
  unread: number;
}

export interface ChatAttachment {
  name: string;
  mime: string;
  is_image: boolean;
  url: string;
}

export interface ChatMessage {
  id: string;
  body: string | null;
  from_me: boolean;
  created_at: string | null;
  read_at: string | null;
  attachment?: ChatAttachment | null;
}

export const chatApi = {
  users: () => apiClient<{ data: ChatUser[] }>('/v1/chat/users'),
  conversations: () => apiClient<{ data: ChatConversation[] }>('/v1/chat/conversations'),
  messages: (withUserId: string) =>
    apiClient<{ data: ChatMessage[] }>(`/v1/chat/messages?with=${encodeURIComponent(withUserId)}`),
  send: (recipientId: string, body: string, file?: File) => {
    if (file) {
      const fd = new FormData();
      fd.append('recipient_id', recipientId);
      if (body.trim()) fd.append('body', body.trim());
      fd.append('file', file);
      return apiClient<{ data: ChatMessage }>('/v1/chat/messages', { method: 'POST', body: fd });
    }
    return apiClient<{ data: ChatMessage }>('/v1/chat/messages', {
      method: 'POST',
      body: JSON.stringify({ recipient_id: recipientId, body }),
    });
  },
  unreadCount: () => apiClient<{ data: { unread: number } }>('/v1/chat/unread-count'),
};
