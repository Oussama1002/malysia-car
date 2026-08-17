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

// ── French translation maps ──────────────────────────────────────────────

const CATEGORY_FR: Record<string, string> = {
  'vehicle_insurance_expiry': 'Assurance véhicule',
  'vehicle_technical_expiry': 'Visite technique',
  'vehicle_vignette_expiry': 'Vignette',
  'fleet.maintenance_due_soon': 'Maintenance à prévoir',
  'fleet.maintenance_overdue': 'Maintenance en retard',
  'fleet.oil_change_due': 'Vidange à prévoir',
  'fleet.tire_change_due': 'Changement pneus',
  'fleet.immobilized': 'Véhicule immobilisé',
  'fleet.accident_declared': 'Accident déclaré',
  'fleet.document_expired': 'Document expiré',
  'fleet.document_expiring': 'Document bientôt expiré',
  'contract.pending_approval': 'Contrat en attente',
  'contract.approved': 'Contrat approuvé',
  'contract.activated': 'Contrat activé',
  'contract.terminated': 'Contrat résilié',
  'contract_expiry': 'Contrat bientôt expiré',
  'contracts.expiring': 'Contrat bientôt expiré',
  'rentals.return_due': 'Retour prévu',
  'rentals.confirmation_due': 'Réservation à confirmer',
  'invoice.overdue': 'Facture en retard',
  'payment.received': 'Paiement reçu',
  'arrears.detected': 'Impayé détecté',
  'arrears.escalated': 'Impayé escaladé',
  'kyc.pending_validation': 'KYC en attente',
  'kyc.document_uploaded': 'Document KYC uploadé',
  'signature.sent': 'Signature envoyée',
  'signature.signed': 'Signature complétée',
  'signature.voided': 'Signature annulée',
  'gps.alert': 'Alerte GPS',
  'gps.unknown_device': 'Appareil GPS inconnu',
  'finance.fixed_charge_overdue': 'Charge fixe en retard',
  'sub_rental_return_due': 'Retour sous-location',
  'sub_rental_overdue': 'Sous-location en retard',
  'sub_rental_margin_negative': 'Marge sous-location négative',
  'sub_rental_blacklisted_supplier': 'Fournisseur bloqué',
};

const MODULE_FR: Record<string, string> = {
  fleet: 'Flotte',
  contracts: 'Contrats',
  rentals: 'Locations',
  finance: 'Finance',
  customers: 'Clients',
  arrears: 'Impayés',
  gps: 'GPS',
  signatures: 'Signatures',
  documents: 'Documents',
  notifications: 'Notifications',
  mobile_ops: 'Ops. terrain',
  auth: 'Authentification',
  signature: 'Signatures',
};

const PRIORITY_FR: Record<string, string> = {
  low: 'Basse',
  normal: 'Normale',
  high: 'Haute',
  critical: 'Critique',
};

function translateCategory(raw: string): string {
  if (CATEGORY_FR[raw]) return CATEGORY_FR[raw];
  // Handle dynamic categories like "fleet.oil_change_due"
  const cleaned = raw
    .replace(/^fleet\./, '')
    .replace(/^contract\./, '')
    .replace(/^rentals\./, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return cleaned;
}

function translateModule(raw: string): string {
  return MODULE_FR[raw] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function translatePriority(raw: string): string {
  return PRIORITY_FR[raw] ?? raw;
}

function translateText(text: string, payload?: Record<string, unknown> | null): string {
  let t = text;
  for (const [code, fr] of Object.entries(MAINTENANCE_TYPE_FR)) {
    t = t.replace(new RegExp(`\\b${code}\\b`, 'g'), fr);
  }
  t = t.replace(/\bEntretien depasse\b/g, 'Entretien dépassé');
  t = t.replace(/\bEntretien bientot du\b/g, 'Entretien bientôt dû');
  t = t.replace(/\bAssurance expiree\b/gi, 'Assurance expirée');
  t = t.replace(/\bAssurance bientot expiree\b/gi, 'Assurance bientôt expirée');
  t = t.replace(/\bVignette expiree\b/gi, 'Vignette expirée');
  t = t.replace(/\bVignette bientot expiree\b/gi, 'Vignette bientôt expirée');
  t = t.replace(/\bVisite technique expiree\b/gi, 'Visite technique expirée');
  t = t.replace(/\bVisite technique bientot expiree\b/gi, 'Visite technique bientôt expirée');
  t = t.replace(/\bVehicule\b/g, 'Véhicule');
  // Enrich plate-only text with brand+model from payload
  if (payload) {
    const brand = payload.vehicle_brand as string | undefined;
    const model = payload.vehicle_model as string | undefined;
    const reg = payload.registration_number as string | undefined;
    const vLabel = [brand, model].filter(Boolean).join(' ');
    if (vLabel && reg) {
      t = t.replace(new RegExp(`pour\\s+${reg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), `pour ${vLabel} (${reg})`);
      t = t.replace(new RegExp(`Véhicule\\s+${reg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), `Véhicule ${vLabel} (${reg})`);
    }
  }
  return t;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('fr-MA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days}j`;
  return formatDate(dateStr);
}

// ── Component ─────────────────────────────────────────────────────────────

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
    if (!n.read_at) markRead.mutate(n.id);
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
          <h1 className="text-2xl font-black text-[color:var(--df-text)]">Notifications</h1>
          <p className="text-[color:var(--df-text-muted)]">
            Centre de notifications — <strong>{unreadTotal}</strong> non lue(s)
          </p>
        </div>
        {unreadTotal > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="self-start rounded-2xl bg-[color:var(--df-brand-500)] px-4 py-2 text-xs font-black uppercase tracking-widest text-white shadow disabled:opacity-50"
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
          {modules.map((m) => <option key={m} value={m}>{translateModule(m)}</option>)}
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
            <div key={i} className="h-24 rounded-2xl bg-[color:var(--df-surface-sunk)] animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--df-border)] bg-[color:var(--df-surface)] p-12 text-center text-sm text-[color:var(--df-text-muted)]">
          Aucune notification.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => openDrawer(n)}
              className={`w-full text-left rounded-2xl border p-4 transition hover:border-[color:var(--df-brand-300)] ${n.read_at ? 'border-[color:var(--df-border)] bg-[color:var(--df-surface)]' : 'border-[color:var(--df-brand-200)] bg-[color:var(--df-brand-500)]/[0.04]'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {n.module && <StatusBadge label={translateModule(n.module)} tone="info" />}
                    <StatusBadge label={translateCategory(n.category)} tone="default" />
                    {n.priority && n.priority !== 'normal' && (
                      <StatusBadge
                        label={translatePriority(n.priority)}
                        tone={n.priority === 'critical' ? 'danger' : n.priority === 'high' ? 'warning' : 'default'}
                      />
                    )}
                  </div>
                  <div className="mt-2 text-sm font-bold text-[color:var(--df-text)]">{translateText(n.title, n.payload)}</div>
                  {n.body && <div className="mt-1 text-[13px] text-[color:var(--df-text-muted)] line-clamp-2">{translateText(n.body, n.payload)}</div>}
                  <div className="mt-2 text-[11px] font-semibold text-[color:var(--df-text-faint)]">
                    {formatTimeAgo(n.created_at)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {!n.read_at && <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--df-brand-500)]" />}
                  <span className="text-[11px] font-bold text-[color:var(--df-brand-500)]">Détail →</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <DrawerPanel open={drawerOpen} title="Détail de la notification" onClose={() => { setDrawerOpen(false); setSelected(null); }} widthClass="max-w-xl">
        {selected && (
          <div className="space-y-5 text-sm">
            {/* Header badges */}
            <div className="flex flex-wrap gap-2">
              {selected.module && <StatusBadge label={translateModule(selected.module)} tone="info" />}
              <StatusBadge label={translateCategory(selected.category)} tone="default" />
              {selected.priority && (
                <StatusBadge
                  label={translatePriority(selected.priority)}
                  tone={selected.priority === 'critical' ? 'danger' : selected.priority === 'high' ? 'warning' : 'success'}
                />
              )}
              {selected.read_at ? <StatusBadge label="Lu" tone="success" /> : <StatusBadge label="Non lu" tone="warning" />}
            </div>

            {/* Title */}
            <div>
              <h3 className="text-base font-black text-[color:var(--df-text)]">{translateText(selected.title, selected.payload)}</h3>
            </div>

            {/* Body */}
            {selected.body && (
              <div className="rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-sunk)] p-4">
                <p className="text-[color:var(--df-text)] whitespace-pre-wrap leading-relaxed">{translateText(selected.body, selected.payload)}</p>
              </div>
            )}

            {/* Details grid */}
            <div className="rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface)] p-4 space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--df-text-faint)]">Informations</h4>
              <div className="grid grid-cols-2 gap-3">
                <DetailRow label="Module" value={selected.module ? translateModule(selected.module) : '—'} />
                <DetailRow label="Catégorie" value={translateCategory(selected.category)} />
                <DetailRow label="Priorité" value={translatePriority(selected.priority ?? 'normal')} />
                <DetailRow label="Statut" value={selected.read_at ? `Lu le ${formatDate(selected.read_at)}` : 'Non lu'} />
                <DetailRow label="Créée le" value={formatDate(selected.created_at)} />
                <DetailRow label="Dernière maj" value={formatDate(selected.updated_at)} />
                {selected.entity_type && (
                  <DetailRow label="Type d'entité" value={translateEntityType(selected.entity_type)} />
                )}
                {selected.entity_id && (
                  <DetailRow label="ID entité" value={selected.entity_id.substring(0, 8) + '…'} />
                )}
              </div>
            </div>

            {/* Payload details */}
            {selected.payload && Object.keys(selected.payload).length > 0 && (
              <div className="rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface)] p-4 space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--df-text-faint)]">Données associées</h4>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(selected.payload).map(([k, v]) => (
                    <DetailRow key={k} label={translatePayloadKey(k)} value={translatePayloadValue(k, v)} />
                  ))}
                </div>
              </div>
            )}

            {/* Deliveries */}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-[color:var(--df-border)]">
              {typeof selected.payload?.whatsapp_url === 'string' && (
                <a
                  href={selected.payload.whatsapp_url as string}
                  target="_blank"
                  rel="noreferrer"
                  className="df-btn text-xs text-white"
                  style={{ background: '#25D366', borderColor: '#25D366' }}
                >
                  Confirmer via WhatsApp
                </a>
              )}
              <button
                type="button"
                className="df-btn df-btn--primary text-xs"
                onClick={() => {
                  const target = resolveNotificationRoute(selected);
                  if (target) { setDrawerOpen(false); navigate(target); }
                }}
              >
                Ouvrir l'entité
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

// ── Helpers ───────────────────────────────────────────────────────────────

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--df-text-faint)]">{label}</div>
    <div className="mt-0.5 text-[13px] font-semibold text-[color:var(--df-text)]">{value}</div>
  </div>
);

function translateEntityType(raw: string): string {
  const map: Record<string, string> = {
    'App\\Models\\Vehicle': 'Véhicule',
    'App\\Models\\Contract': 'Contrat',
    'App\\Models\\Customer': 'Client',
    'App\\Models\\Invoice': 'Facture',
    'App\\Models\\Payment': 'Paiement',
    'App\\Models\\Reservation': 'Réservation',
    'App\\Models\\ArrearsCase': 'Dossier impayé',
    'App\\Models\\SignatureEnvelope': 'Signature',
    'App\\Models\\Notification': 'Notification',
    'App\\Models\\VehicleAccident': 'Accident',
    'App\\Models\\SubRentalContract': 'Sous-location',
  };
  return map[raw] ?? raw.replace(/^App\\Models\\/, '').replace(/([A-Z])/g, ' $1').trim();
}

const MAINTENANCE_TYPE_FR: Record<string, string> = {
  OIL_CHANGE: 'Vidange',
  TIRES: 'Pneus',
  INSPECTION: 'Inspection',
  BRAKES: 'Freins',
  FILTER: 'Filtre',
  BATTERY: 'Batterie',
  TIMING_BELT: 'Courroie de distribution',
  TECH_CONTROL: 'Contrôle technique',
  OTHER: 'Autre',
};

const SEVERITY_FR: Record<string, string> = {
  critical: 'Critique',
  high: 'Haute',
  medium: 'Moyenne',
  low: 'Basse',
  ok: 'OK',
  due_soon: 'Bientôt dû',
  overdue: 'En retard',
};

const STATUS_FR: Record<string, string> = {
  active: 'Actif',
  inactive: 'Inactif',
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Refusé',
  cancelled: 'Annulé',
  completed: 'Terminé',
  draft: 'Brouillon',
  paid: 'Payé',
  unpaid: 'Impayé',
  overdue: 'En retard',
  sent: 'Envoyé',
  signed: 'Signé',
  voided: 'Annulé',
  expired: 'Expiré',
  ok: 'OK',
  due_soon: 'Bientôt dû',
};

function translatePayloadValue(key: string, value: unknown): string {
  const v = String(value ?? '—');
  if (key === 'maintenance_type') return MAINTENANCE_TYPE_FR[v] ?? v;
  if (key === 'severity') return SEVERITY_FR[v] ?? v;
  if (key === 'status') return STATUS_FR[v] ?? v;
  if (key === 'type') return MAINTENANCE_TYPE_FR[v] ?? CATEGORY_FR[v] ?? v;
  return v;
}

function translatePayloadKey(key: string): string {
  const map: Record<string, string> = {
    vehicle_id: 'Véhicule',
    vehicle_name: 'Véhicule',
    vehicle_registration: 'Immatriculation',
    brand: 'Marque',
    model: 'Modèle',
    registration: 'Immatriculation',
    contract_id: 'Contrat',
    contract_number: 'N° contrat',
    customer_id: 'Client',
    customer_name: 'Client',
    days_left: 'Jours restants',
    days_overdue: 'Jours de retard',
    amount: 'Montant',
    total_amount: 'Montant total',
    due_date: "Date d'échéance",
    expiry_date: "Date d'expiration",
    severity: 'Sévérité',
    type: 'Type',
    status: 'Statut',
    reason: 'Raison',
    notification_id: 'N° notification',
    category: 'Catégorie',
    title: 'Titre',
    channels: 'Canaux',
    maintenance_type: 'Type maintenance',
    mileage_threshold: 'Seuil km',
    current_mileage: 'Km actuel',
    next_service_date: 'Prochaine révision',
  };
  return map[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function DeliveryChips({ deliveries, detailed }: { deliveries?: NotificationDeliveryDto[]; detailed?: boolean }) {
  if (!deliveries?.length) return null;
  return (
    <div className={`mt-2 flex flex-wrap gap-1.5 ${detailed ? 'flex-col items-stretch' : ''}`}>
      {deliveries.map((d) => (
        <div
          key={d.id}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
            d.status === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300' :
            d.status === 'sent' || d.status === 'read' ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' :
            'border-[color:var(--df-border)] bg-[color:var(--df-surface-sunk)] text-[color:var(--df-text-muted)]'
          }`}
        >
          <span>{CHANNEL_LABEL[d.channel]}</span>
          <span className="opacity-40">·</span>
          <span>{DELIVERY_STATUS_LABEL[d.status]}</span>
          {detailed && d.sent_at && (
            <span className="opacity-60 text-[10px]">— {formatDate(d.sent_at)}</span>
          )}
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
  if (type.includes('reservation')) return `/reservations/${id}`;
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
