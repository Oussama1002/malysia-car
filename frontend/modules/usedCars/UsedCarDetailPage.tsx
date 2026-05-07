import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelReservation,
  evaluateListing,
  getUsedCarListing,
  listTransfers,
  listValuations,
  publishListing,
  reserveListing,
  sellAndInvoiceListing,
  updateTransfer,
  type SellPayload,
  type UsedCarSale,
  type UsedCarValuation,
  type ValuationPayload,
  type VehicleOwnershipTransfer,
  USED_CAR_STAGE_LABEL,
  usedCarStageTone,
} from '@/services/usedCarsApi';
import { ApiError } from '@/services/apiError';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { TabsSection } from '@/modules/shared/components/TabsSection';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';
import { formatClientCode } from '@/services/entityCode';

type Tab = 'overview' | 'valuations' | 'sale' | 'transfers';

export const UsedCarDetailPage: React.FC = () => {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [evaluateOpen, setEvaluateOpen] = useState(false);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workflowWarnings, setWorkflowWarnings] = useState<string[]>([]);

  const listingQ = useQuery({
    queryKey: ['used-cars', 'listing', id],
    queryFn: () => getUsedCarListing(id),
    enabled: !!id,
  });
  const valuationsQ = useQuery({
    queryKey: ['used-cars', 'listing', id, 'valuations'],
    queryFn: () => listValuations(id),
    enabled: !!id && tab === 'valuations',
  });
  const transfersQ = useQuery({
    queryKey: ['used-cars', 'listing', id, 'transfers'],
    queryFn: () => listTransfers(id),
    enabled: !!id && tab === 'transfers',
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['used-cars', 'listing', id] });
    qc.invalidateQueries({ queryKey: ['used-cars', 'listings'] });
  };

  const evaluateMut = useMutation({
    mutationFn: (p: ValuationPayload) => evaluateListing(id, p),
    onSuccess: () => {
      invalidate();
      setEvaluateOpen(false);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const publishMut = useMutation({
    mutationFn: () => publishListing(id),
    onSuccess: () => invalidate(),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const reserveMut = useMutation({
    mutationFn: (payload: { customer_id: string; reserved_until?: string }) => reserveListing(id, payload),
    onSuccess: () => {
      invalidate();
      setReserveOpen(false);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const cancelReserveMut = useMutation({
    mutationFn: () => cancelReservation(id),
    onSuccess: () => invalidate(),
  });

  const sellMut = useMutation({
    mutationFn: (p: SellPayload) => sellAndInvoiceListing(id, p),
    onSuccess: (res) => {
      setWorkflowWarnings(res.data.warnings ?? []);
      invalidate();
      setSellOpen(false);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const l = listingQ.data?.data;

  if (listingQ.isLoading) return <div className="text-slate-500">Chargement…</div>;
  if (!l) return <EmptyState title="Fiche VO introuvable" />;

  const canEvaluate = l.stage === 'draft' || l.stage === 'evaluated' || l.stage === 'published';
  const canPublish = l.stage === 'draft' || l.stage === 'evaluated';
  const canReserve = l.stage === 'published' || l.stage === 'evaluated';
  const canCancelReservation = l.stage === 'reserved';
  const canSell = l.stage !== 'sold' && l.stage !== 'cancelled';

  return (
    <div className="space-y-6">
      <Link to="/used-cars" className="text-xs font-bold text-indigo-600">
        ← Retour aux fiches VO
      </Link>

      <div className="df-card df-card--elevated">
        <div className="df-card__body flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900">{l.listing_code}</h1>
              <StatusBadge label={USED_CAR_STAGE_LABEL[l.stage]} tone={usedCarStageTone(l.stage)} />
            </div>
            <p className="text-slate-500">
              {l.vehicle?.brand?.name} {l.vehicle?.model?.name} {l.vehicle?.year ? `· ${l.vehicle.year}` : ''}
              {l.vehicle?.registration_number ? ` · ${l.vehicle.registration_number}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEvaluate && (
              <button className="df-btn df-btn--ghost" onClick={() => setEvaluateOpen(true)}>
                Évaluer
              </button>
            )}
            {canPublish && (
              <button className="df-btn df-btn--ghost" onClick={() => publishMut.mutate()} disabled={publishMut.isPending}>
                Publier
              </button>
            )}
            {canReserve && (
              <button className="df-btn df-btn--ghost" onClick={() => setReserveOpen(true)}>
                Réserver
              </button>
            )}
            {canCancelReservation && (
              <button
                className="df-btn df-btn--ghost"
                onClick={() => cancelReserveMut.mutate()}
                disabled={cancelReserveMut.isPending}
              >
                Libérer
              </button>
            )}
            {canSell && (
              <button className="df-btn df-btn--primary" onClick={() => setSellOpen(true)}>
                Finaliser la vente
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {!!workflowWarnings.length && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
          {workflowWarnings.join(' · ')}
        </div>
      )}

      <TabsSection
        active={tab}
        onChange={(t) => setTab(t as Tab)}
        tabs={[
          { id: 'overview', label: 'Synthèse' },
          { id: 'valuations', label: 'Évaluations' },
          { id: 'sale', label: 'Vente' },
          { id: 'transfers', label: 'Mutation' },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid gap-4 md:grid-cols-3">
          <InfoCard title="Prix demandé" value={l.asking_price ? formatCurrencyMad(Number(l.asking_price)) : '—'} />
          <InfoCard title="Prix plancher" value={l.min_acceptable_price ? formatCurrencyMad(Number(l.min_acceptable_price)) : '—'} />
          <InfoCard title="Estimation marché" value={l.estimated_value ? formatCurrencyMad(Number(l.estimated_value)) : '—'} />
          <InfoCard title="Score valuation" value={l.valuation_score ? `${Number(l.valuation_score).toFixed(1)} / 100` : '—'} />
          <InfoCard title="Score inspection" value={l.inspection_score ? `${l.inspection_score} / 100` : '—'} />
          <InfoCard title="Kilométrage" value={l.mileage_at_listing ? `${l.mileage_at_listing} km` : '—'} />
          <InfoCard title="Canal" value={l.publication_channel ?? '—'} />
          <InfoCard title="Publié le" value={l.published_at ? formatDate(l.published_at) : '—'} />
          <InfoCard title="Réservé jusqu'au" value={l.reserved_until ? formatDate(l.reserved_until) : '—'} />
          {l.sold_at && <InfoCard title="Vendu le" value={formatDate(l.sold_at)} />}
          {l.final_sale_price && <InfoCard title="Prix final" value={formatCurrencyMad(Number(l.final_sale_price))} />}
          {l.notes && (
            <div className="df-card md:col-span-3">
              <div className="df-card__body">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Notes</div>
                <p className="mt-1 text-sm text-slate-700 whitespace-pre-line">{l.notes}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'valuations' && (
        <ValuationsTab valuations={valuationsQ.data?.data ?? l.valuations ?? []} loading={valuationsQ.isLoading} />
      )}

      {tab === 'sale' && <SalesTab sales={l.sales ?? []} />}

      {tab === 'transfers' && (
        <TransfersTab
          transfers={transfersQ.data?.data ?? []}
          loading={transfersQ.isLoading}
          onUpdate={(tid, payload) => updateTransfer(tid, payload).then(() => invalidate())}
        />
      )}

      <DrawerPanel open={evaluateOpen} title="Nouvelle évaluation" onClose={() => setEvaluateOpen(false)}>
        <ValuationForm
          submitting={evaluateMut.isPending}
          onCancel={() => setEvaluateOpen(false)}
          onSubmit={(p) => {
            setError(null);
            evaluateMut.mutate(p);
          }}
        />
      </DrawerPanel>

      <DrawerPanel open={reserveOpen} title="Réserver le véhicule" onClose={() => setReserveOpen(false)}>
        <ReserveForm
          submitting={reserveMut.isPending}
          onCancel={() => setReserveOpen(false)}
          onSubmit={(p) => {
            setError(null);
            reserveMut.mutate(p);
          }}
        />
      </DrawerPanel>

      <DrawerPanel open={sellOpen} title="Finaliser la vente" onClose={() => setSellOpen(false)} widthClass="max-w-xl">
        <SellForm
          askingPrice={l.asking_price ? Number(l.asking_price) : undefined}
          submitting={sellMut.isPending}
          onCancel={() => setSellOpen(false)}
          onSubmit={(p) => {
            setError(null);
            sellMut.mutate(p);
          }}
        />
      </DrawerPanel>
    </div>
  );
};

// ============================================================================
// Sub components
// ============================================================================

const InfoCard: React.FC<{ title: string; value: React.ReactNode }> = ({ title, value }) => (
  <div className="df-card">
    <div className="df-card__body">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-1 text-lg font-black text-slate-900">{value}</div>
    </div>
  </div>
);

const ValuationsTab: React.FC<{ valuations: UsedCarValuation[]; loading: boolean }> = ({ valuations, loading }) => {
  const sorted = useMemo(
    () => [...valuations].sort((a, b) => String(b.valued_at ?? '').localeCompare(String(a.valued_at ?? ''))),
    [valuations],
  );
  if (loading) return <div className="text-slate-500">Chargement…</div>;
  if (!sorted.length) return <EmptyState title="Aucune évaluation" description="Lancez une évaluation pour obtenir une estimation marché." />;

  return (
    <div className="space-y-3">
      {sorted.map((v) => (
        <div key={v.id} className="df-card">
          <div className="df-card__body grid gap-3 md:grid-cols-5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Méthode</div>
              <div className="font-bold text-slate-900">{v.method}</div>
              <div className="text-xs text-slate-500">{v.valued_at ? formatDate(v.valued_at) : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Marché</div>
              <div className="font-bold text-slate-900">
                {v.market_value ? formatCurrencyMad(Number(v.market_value)) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Reprise</div>
              <div className="font-bold text-slate-900">
                {v.trade_in_value ? formatCurrencyMad(Number(v.trade_in_value)) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Prix suggéré</div>
              <div className="font-bold text-slate-900">
                {v.suggested_price ? formatCurrencyMad(Number(v.suggested_price)) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">État</div>
              <div className="font-bold text-slate-900">
                {v.condition_score ? `${v.condition_score} / 100` : '—'}
              </div>
              {v.mileage && <div className="text-xs text-slate-500">{v.mileage} km</div>}
            </div>
            {v.notes && <div className="md:col-span-5 text-sm text-slate-600">{v.notes}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};

const SalesTab: React.FC<{ sales: UsedCarSale[] }> = ({ sales }) => {
  if (!sales || !sales.length) {
    return <EmptyState title="Aucune vente enregistrée" description="La vente se crée au clic sur « Finaliser la vente »." />;
  }
  return (
    <div className="space-y-3">
      {sales.map((s) => (
        <div key={s.id} className="df-card">
          <div className="df-card__body grid gap-3 md:grid-cols-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">N° vente</div>
              <div className="font-mono font-bold text-slate-900">{s.sale_number}</div>
              <div className="text-xs text-slate-500">{s.sale_date ? formatDate(s.sale_date) : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Prix</div>
              <div className="font-bold">{formatCurrencyMad(Number(s.sale_price))}</div>
              <div className="text-xs text-slate-500">Total {formatCurrencyMad(Number(s.total_amount))}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Mode</div>
              <div className="font-bold">{s.payment_method}</div>
              <div className="text-xs text-slate-500">{s.payment_status}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Finance</div>
              <div className="text-xs text-slate-700">
                Facture: {s.invoice_id ? 'générée' : 'manquante'} · Paiement: {s.payment_status}
              </div>
              <div className="text-xs text-slate-700">
                Compta: {s.accounting_status === 'posted' ? 'comptabilisée' : 'en attente'} · Mutation:{' '}
                {s.transfer_status ?? 'initiated'}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Acheteur</div>
              <div className="font-bold">{s.buyer?.full_name ?? formatClientCode(s.buyer_customer_id)}</div>
            </div>
            {s.notes && <div className="md:col-span-4 text-sm text-slate-600">{s.notes}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};

const TransfersTab: React.FC<{
  transfers: VehicleOwnershipTransfer[];
  loading: boolean;
  onUpdate: (id: string, payload: Parameters<typeof updateTransfer>[1]) => void;
}> = ({ transfers, loading, onUpdate }) => {
  if (loading) return <div className="text-slate-500">Chargement…</div>;
  if (!transfers.length) return <EmptyState title="Aucune mutation" description="La mutation est créée automatiquement lors de la vente." />;
  return (
    <div className="space-y-3">
      {transfers.map((t) => (
        <div key={t.id} className="df-card">
          <div className="df-card__body space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-slate-900">Mutation {t.transfer_type}</div>
                <div className="text-xs text-slate-500">
                  {t.transfer_date ? formatDate(t.transfer_date) : '—'}
                  {t.admin_reference ? ` · Réf ${t.admin_reference}` : ''}
                </div>
              </div>
              <StatusBadge
                label={t.transfer_status}
                tone={t.transfer_status === 'completed' ? 'success' : t.transfer_status === 'failed' ? 'danger' : 'warning'}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(['docs_submitted', 'stamped', 'completed', 'failed'] as const).map((s) => (
                <button
                  key={s}
                  className="df-btn df-btn--ghost text-xs"
                  onClick={() => onUpdate(t.id, { transfer_status: s })}
                >
                  → {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// Forms
// ============================================================================

const ValuationForm: React.FC<{
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (p: ValuationPayload) => void;
}> = ({ submitting, onCancel, onSubmit }) => {
  const [form, setForm] = useState<ValuationPayload>({ method: 'expert' });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Méthode</label>
        <select
          className="df-input mt-1"
          value={form.method}
          onChange={(e) => setForm({ ...form, method: e.target.value as ValuationPayload['method'] })}
        >
          <option value="expert">Expert</option>
          <option value="argus">Argus</option>
          <option value="comparable">Comparable</option>
          <option value="automated">Automatisé</option>
        </select>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <NumInput label="Valeur marché" value={form.market_value} onChange={(v) => setForm({ ...form, market_value: v })} />
        <NumInput label="Reprise" value={form.trade_in_value} onChange={(v) => setForm({ ...form, trade_in_value: v })} />
        <NumInput label="Prix suggéré" value={form.suggested_price} onChange={(v) => setForm({ ...form, suggested_price: v })} />
        <NumInput label="Score état (0-100)" value={form.condition_score} onChange={(v) => setForm({ ...form, condition_score: v })} />
        <NumInput label="Kilométrage" value={form.mileage} onChange={(v) => setForm({ ...form, mileage: v })} />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Notes</label>
        <textarea
          className="df-input mt-1"
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>
          Évaluer
        </button>
      </div>
    </form>
  );
};

const ReserveForm: React.FC<{
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (p: { customer_id: string; reserved_until?: string }) => void;
}> = ({ submitting, onCancel, onSubmit }) => {
  const [customerId, setCustomerId] = useState('');
  const [until, setUntil] = useState('');
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ customer_id: customerId, reserved_until: until || undefined });
      }}
    >
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">ID client acheteur</label>
        <input
          className="df-input mt-1"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          required
          placeholder="uuid du client"
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Réservé jusqu'au</label>
        <input
          type="date"
          className="df-input mt-1"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">Par défaut : +7 jours.</p>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>
          Réserver
        </button>
      </div>
    </form>
  );
};

const SellForm: React.FC<{
  askingPrice?: number;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (p: SellPayload) => void;
}> = ({ askingPrice, submitting, onCancel, onSubmit }) => {
  const [form, setForm] = useState<SellPayload>({
    buyer_customer_id: '',
    sale_price: askingPrice ?? 0,
    vat_mode: 'standard',
    vat_rate: 20,
    payment_method: 'bank_transfer',
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">ID client acheteur</label>
        <input
          className="df-input mt-1"
          value={form.buyer_customer_id}
          onChange={(e) => setForm({ ...form, buyer_customer_id: e.target.value })}
          required
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <NumInput
          label="Prix de vente (MAD)"
          value={form.sale_price}
          onChange={(v) => setForm({ ...form, sale_price: v ?? 0 })}
          required
        />
        <NumInput label="Remise" value={form.discount_amount} onChange={(v) => setForm({ ...form, discount_amount: v })} />
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Mode TVA</label>
          <select
            className="df-input mt-1"
            value={form.vat_mode ?? 'standard'}
            onChange={(e) => setForm({ ...form, vat_mode: e.target.value as SellPayload['vat_mode'] })}
          >
            <option value="standard">TVA standard</option>
            <option value="margin">TVA marge VO</option>
            <option value="exempt">Exonéré</option>
          </select>
        </div>
        <NumInput label="Taux TVA (%)" value={form.vat_rate} onChange={(v) => setForm({ ...form, vat_rate: v })} />
        <NumInput label="Acompte versé" value={form.amount_paid} onChange={(v) => setForm({ ...form, amount_paid: v })} />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Mode de paiement</label>
        <select
          className="df-input mt-1"
          value={form.payment_method}
          onChange={(e) => setForm({ ...form, payment_method: e.target.value as SellPayload['payment_method'] })}
        >
          <option value="cash">Espèces</option>
          <option value="bank_transfer">Virement</option>
          <option value="check">Chèque</option>
          <option value="card">Carte</option>
          <option value="financed">Financement</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Date de vente</label>
        <input
          type="date"
          className="df-input mt-1"
          value={form.sale_date ?? ''}
          onChange={(e) => setForm({ ...form, sale_date: e.target.value || undefined })}
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Notes</label>
        <textarea
          className="df-input mt-1"
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>
          Confirmer la vente
        </button>
      </div>
    </form>
  );
};

const NumInput: React.FC<{
  label: string;
  value?: number | null;
  onChange: (v: number | undefined) => void;
  required?: boolean;
}> = ({ label, value, onChange, required }) => (
  <div>
    <label className="text-xs font-bold uppercase text-slate-500">{label}</label>
    <input
      type="number"
      min="0"
      step="0.01"
      className="df-input mt-1"
      value={value ?? ''}
      required={required}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    />
  </div>
);
