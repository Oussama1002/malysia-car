import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CHANNEL_LABEL,
  DELIVERY_STATUS_LABEL,
  notificationsApi,
  type NotificationDto,
  type NotificationDeliveryDto,
} from '@/services/notificationsApi';
import { getApiBase } from '@/services/apiClient';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { useAuthSession } from '@/modules/auth/AuthContext';
import { ApiError } from '@/services/apiError';

type ListFilter = 'all' | 'unread' | 'critical' | 'failed';

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const apiReady = !!getApiBase();
  const { session } = useAuthSession();
  const canRetry = ['ADMIN', 'DIRECTEUR'].includes(session?.user.role ?? '');

  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('');
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [selected, setSelected] = useState<NotificationDto | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const unreadQ = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsApi.unreadCount(),
    enabled: apiReady,
  });

  const q = useQuery({
    queryKey: ['notifications', 'list', { listFilter, moduleFilter, channelFilter }],
    queryFn: () =>
      notificationsApi.list({
        per_page: 50,
        unread_only: listFilter === 'unread',
        priority: listFilter === 'critical' ? 'critical' : undefined,
        module: moduleFilter || undefined,
        failed_delivery: listFilter === 'failed',
        channel: channelFilter || undefined,
        include_deliveries: true,
      }),
    enabled: apiReady,
  });

  const items: NotificationDto[] = q.data?.data ?? [];
  const modules = Array.from(new Set(items.map((n) => n.module).filter(Boolean))) as string[];
  const unreadTotal = unreadQ.data?.data?.unread ?? 0;

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      setListError(null);
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      setListError(null);
    },
  });

  const retryMut = useMutation({
    mutationFn: (id: string) => notificationsApi.retry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      setListError(null);
    },
    onError: (e) => setListError(e instanceof ApiError ? e.message : 'Relance impossible'),
  });

  const destroy = useMutation({
    mutationFn: (id: string) => notificationsApi.destroy(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      setDrawerOpen(false);
      setSelected(null);
    },
  });

  const openDrawer = (n: NotificationDto) => {
    setSelected(n);
    setDrawerOpen(true);
  };

  if (!apiReady) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Backend non configuré. Renseignez <span className="font-mono">VITE_API_BASE</span> pour activer les notifications.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Notifications</h1>
          <p className="text-slate-500">
            Centre in-app et suivi des livraisons e-mail / SMS — <strong>{unreadTotal}</strong> non lue(s)
          </p>
        </div>
        {unreadTotal > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="self-start rounded-2xl bg-indigo-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white shadow disabled:opacity-50"
          >
            {markAllRead.isPending ? 'Mise à jour…' : 'Tout marquer lu'}
          </button>
        )}
      </header>

      {listError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{listError}</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setListFilter('all')} className={`df-btn text-xs ${listFilter === 'all' ? 'df-btn--primary' : 'df-btn--ghost'}`}>Toutes</button>
        <button type="button" onClick={() => setListFilter('unread')} className={`df-btn text-xs ${listFilter === 'unread' ? 'df-btn--primary' : 'df-btn--ghost'}`}>Non lues</button>
        <button type="button" onClick={() => setListFilter('critical')} className={`df-btn text-xs ${listFilter === 'critical' ? 'df-btn--primary' : 'df-btn--ghost'}`}>Critiques</button>
        <button type="button" onClick={() => setListFilter('failed')} className={`df-btn text-xs ${listFilter === 'failed' ? 'df-btn--primary' : 'df-btn--ghost'}`}>Livraison en échec</button>
        <select className="df-input w-auto text-xs" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
          <option value="">Tous modules</option>
          {modules.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="df-input w-auto text-xs" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
          <option value="">Tous canaux</option>
          <option value="in_app">In-app</option>
          <option value="email">E-mail</option>
          <option value="sms">SMS</option>
        </select>
      </div>

      {q.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center text-sm text-slate-500">
          Aucune notification.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => openDrawer(n)}
              className={`w-full text-left rounded-2xl border p-4 transition hover:border-indigo-200 ${n.read_at ? 'border-slate-100 bg-white' : 'border-indigo-100 bg-indigo-50/40'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={n.category} tone="info" />
                    {n.priority && <StatusBadge label={n.priority} tone={n.priority === 'critical' ? 'danger' : n.priority === 'high' ? 'warning' : 'default'} />}
                    <div className="text-sm font-black text-slate-900">{n.title}</div>
                  </div>
                  {n.body && <div className="mt-2 text-sm text-slate-600 line-clamp-2">{n.body}</div>}
                  <DeliveryChips deliveries={n.deliveries} />
                  <div className="mt-2 text-xs text-slate-400">
                    {new Date(n.created_at).toLocaleString('fr-MA')}
                  </div>
                </div>
                <span className="text-xs font-bold text-indigo-600 shrink-0">Détail →</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <DrawerPanel open={drawerOpen} title={selected?.title ?? 'Notification'} onClose={() => { setDrawerOpen(false); setSelected(null); }} widthClass="max-w-xl">
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={selected.category} tone="info" />
              {selected.priority && <StatusBadge label={selected.priority} tone={selected.priority === 'critical' ? 'danger' : 'default'} />}
              {selected.read_at ? <StatusBadge label="Lu" tone="success" /> : <StatusBadge label="Non lu" tone="warning" />}
            </div>
            {selected.body && <p className="text-slate-700 whitespace-pre-wrap">{selected.body}</p>}
            <div>
              <div className="text-xs font-bold uppercase text-slate-500 mb-2">Canaux & livraisons</div>
              <DeliveryChips deliveries={selected.deliveries} detailed />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                className="df-btn df-btn--primary text-xs"
                onClick={() => {
                  const target = resolveNotificationRoute(selected);
                  if (target) navigate(target);
                }}
              >
                Ouvrir l’entité
              </button>
              {!selected.read_at && (
                <button type="button" className="df-btn df-btn--ghost text-xs" onClick={() => markRead.mutate(selected.id)}>Marquer lu</button>
              )}
              {canRetry && (selected.deliveries ?? []).some((d) => d.status === 'failed' && (d.channel === 'email' || d.channel === 'sms')) && (
                <button
                  type="button"
                  className="df-btn df-btn--ghost text-xs text-amber-800 border border-amber-300"
                  disabled={retryMut.isPending}
                  onClick={() => retryMut.mutate(selected.id)}
                >
                  {retryMut.isPending ? 'Relance…' : 'Relancer livraisons'}
                </button>
              )}
              <button type="button" className="df-btn df-btn--ghost text-xs text-rose-600" onClick={() => destroy.mutate(selected.id)}>Supprimer</button>
            </div>
          </div>
        )}
      </DrawerPanel>
    </div>
  );
};

function DeliveryChips({ deliveries, detailed }: { deliveries?: NotificationDeliveryDto[]; detailed?: boolean }) {
  if (!deliveries?.length) return null;
  return (
    <div className={`mt-2 flex flex-wrap gap-1.5 ${detailed ? 'flex-col items-stretch' : ''}`}>
      {deliveries.map((d) => (
        <div
          key={d.id}
          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${
            d.status === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-800' :
            d.status === 'sent' || d.status === 'read' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' :
            'border-slate-200 bg-slate-50 text-slate-700'
          }`}
        >
          <span>{CHANNEL_LABEL[d.channel]}</span>
          <span className="opacity-70">·</span>
          <span>{DELIVERY_STATUS_LABEL[d.status]}</span>
          {detailed && d.error_message && (
            <span className="block w-full text-[10px] font-normal text-rose-600 mt-0.5">{d.error_message}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function resolveNotificationRoute(n: NotificationDto): string | null {
  if (n.link_url) return n.link_url;
  const type = (n.entity_type ?? '').toLowerCase();
  const id = n.entity_id;
  if (!id) return null;
  if (type.includes('contract')) return `/contracts/${id}`;
  if (type.includes('customer')) return `/customers/${id}`;
  if (type.includes('vehicle') && !type.includes('accident')) return `/fleet/${id}`;
  if (type.includes('invoice')) return `/finance/invoices/${id}`;
  if (type.includes('arrearscase') || type.includes('arrears')) return `/arrears/${id}`;
  if (type.includes('signatureenvelope')) return `/signatures/${id}`;
  if (type.includes('kyccase') || type.includes('customerkyccase')) return `/customers/${n.customer_id ?? id}`;
  if (type.includes('accident')) return `/fleet`;
  return null;
}
