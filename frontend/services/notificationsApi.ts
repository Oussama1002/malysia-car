import { apiClient, endpoints } from '@/services/apiClient';

export type NotificationChannel = 'in_app' | 'email' | 'sms';

export type DeliveryStatus = 'pending' | 'queued' | 'sent' | 'failed' | 'read';

export interface NotificationDeliveryDto {
  id: string;
  notification_id: string;
  channel: NotificationChannel;
  status: DeliveryStatus;
  attempts: number;
  last_attempt_at?: string | null;
  sent_at?: string | null;
  failed_at?: string | null;
  error_message?: string | null;
  provider_message_id?: string | null;
  created_at: string;
}

export interface NotificationDto {
  id: string;
  user_id: string;
  company_id?: string | null;
  customer_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  category: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  module?: string | null;
  channels?: NotificationChannel[] | null;
  title: string;
  body: string | null;
  link_url: string | null;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
  deliveries?: NotificationDeliveryDto[];
}

interface Paginated<T> {
  data: T[];
  meta?: { total?: number; current_page?: number; last_page?: number };
}

function q(p: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== false) sp.append(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const notificationsApi = {
  list: (params?: {
    unread_only?: boolean;
    per_page?: number;
    priority?: string;
    module?: string;
    failed_delivery?: boolean;
    channel?: string;
    include_deliveries?: boolean;
  }) =>
    apiClient<Paginated<NotificationDto>>(
      `${endpoints.notifications.list}${q({
        unread_only: params?.unread_only ? 1 : undefined,
        per_page: params?.per_page,
        priority: params?.priority,
        module: params?.module,
        failed_delivery: params?.failed_delivery ? 1 : undefined,
        channel: params?.channel,
        include_deliveries: params?.include_deliveries ? 1 : undefined,
      })}`,
    ),
  deliveries: (params?: { per_page?: number; status?: string; channel?: string }) =>
    apiClient<Paginated<NotificationDeliveryDto & { notification?: NotificationDto }>>(
      `${endpoints.notifications.deliveries}${q({
        per_page: params?.per_page,
        status: params?.status,
        channel: params?.channel,
      })}`,
    ),
  unreadCount: () => apiClient<{ data: { unread: number } }>(endpoints.notifications.unreadCount),
  markRead: (id: string) =>
    apiClient<{ data: NotificationDto }>(endpoints.notifications.markRead(id), { method: 'POST' }),
  markAllRead: () =>
    apiClient<{ data: { marked: number } }>(endpoints.notifications.markAllRead, { method: 'POST' }),
  retry: (id: string) =>
    apiClient<{ data: { notification_id: string; retried_deliveries: number } }>(
      endpoints.notifications.retry(id),
      { method: 'POST' },
    ),
  destroy: (id: string) =>
    apiClient<{ message: string }>(endpoints.notifications.destroy(id), { method: 'DELETE' }),
};

export const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  in_app: 'In-app',
  email: 'E-mail',
  sms: 'SMS',
};

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: 'En attente',
  queued: 'En file',
  sent: 'Envoyé',
  failed: 'Échec',
  read: 'Lu',
};
