import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subRentalApi, type SubRentalPayment, type PaymentMethod } from '@/services/subRentalApi';
import { apiClient, getApiBase } from '@/services/apiClient';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { ScanProofLink } from '@/modules/shared/components/ScanProofLink';
import { DateField } from '@/modules/shared/components/DateField';

type Tab = 'overview' | 'vehicle' | 'supplier' | 'payments' | 'profitability' | 'return';

function TabBtn({ id, active, onClick, label }: { id: Tab; active: Tab; onClick: (t: Tab) => void; label: string }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
        active === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      {label}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <span className="text-sm text-slate-800">{value ?? '—'}</span>
    </div>
  );
}

function ReturnModal({ contractId, onClose }: { contractId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ returned_at: new Date().toISOString().split('T')[0], odometer_km: '', fuel_level: '', condition_notes: '', damage_notes: '', extra_charges: '', signed_by_supplier: '' });
  const [err, setErr] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => subRentalApi.returnToSupplier(contractId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sub-rental', contractId] }); onClose(); },
    onError: (e: unknown) => setErr((e as any)?.data?.message ?? (e as any)?.data?.errors?.vehicle_id?.[0] ?? 'Erreur'),
  });

  const setField = (k: string) => (value: string) => setForm((f) => ({ ...f, [k]: value }));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const inp = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="font-bold text-slate-900">Retour au fournisseur</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setErr(null); mutation.mutate({ ...form, odometer_km: form.odometer_km ? parseFloat(form.odometer_km) : undefined, extra_charges: form.extra_charges ? parseFloat(form.extra_charges) : undefined }); }} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold text-slate-500 mb-1">Date retour</label><DateField className={inp} value={form.returned_at} onChange={setField('returned_at')} required /></div>
            <div><label className="block text-xs font-semibold text-slate-500 mb-1">Kilométrage</label><input className={inp} type="number" min="0" value={form.odometer_km} onChange={set('odometer_km')} /></div>
            <div><label className="block text-xs font-semibold text-slate-500 mb-1">Niveau carburant</label><select className={inp} value={form.fuel_level} onChange={set('fuel_level')}><option value="">—</option><option value="empty">Vide</option><option value="quarter">1/4</option><option value="half">1/2</option><option value="three_quarters">3/4</option><option value="full">Plein</option></select></div>
            <div><label className="block text-xs font-semibold text-slate-500 mb-1">Frais supplémentaires</label><input className={inp} type="number" min="0" step="0.01" value={form.extra_charges} onChange={set('extra_charges')} /></div>
          </div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1">État du véhicule</label><textarea className={`${inp} resize-none`} rows={2} value={form.condition_notes} onChange={set('condition_notes')} /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1">Dommages constatés</label><textarea className={`${inp} resize-none`} rows={2} value={form.damage_notes} onChange={set('damage_notes')} /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1">Signé par le fournisseur</label><input className={inp} value={form.signed_by_supplier} onChange={set('signed_by_supplier')} /></div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Annuler</button>
            <button type="submit" disabled={mutation.isPending} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">{mutation.isPending ? 'Retour…' : 'Confirmer le retour'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

type ChequeScan = { document_id?: string | null; check_number?: string; bank?: string; check_date?: string; amount?: number };

async function scanCheque(file: File): Promise<ChequeScan> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await apiClient<{ data?: ChequeScan }>('/v1/cheque-ocr', {
    method: 'POST',
    body: fd,
  });
  return res.data ?? {};
}

function AddPaymentDrawer({ contractId, open, onClose }: { contractId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    amount: '',
    payment_method: 'cash' as PaymentMethod,
    payment_date: new Date().toISOString().split('T')[0],
    reference: '',
    check_number: '',
    check_bank: '',
    check_date: '',
    notes: '',
    cheque_document_id: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [chequeScanning, setChequeScanning] = useState(false);
  const [chequeOcrError, setChequeOcrError] = useState<string | null>(null);
  const [chequeNotice, setChequeNotice] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof subRentalApi.addPayment>[1]) => subRentalApi.addPayment(contractId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-rental', contractId, 'payments'] });
      qc.invalidateQueries({ queryKey: ['sub-rental', contractId] });
      onClose();
    },
    onError: (e: unknown) => {
      const msg = (e as any)?.body?.errors
        ? Object.values((e as any).body.errors).flat().join(' · ')
        : (e as any)?.body?.message ?? (e as any)?.message ?? 'Erreur';
      setErr(String(msg));
    },
  });

  const setField = (k: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [k]: value }));
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const applyChequeScan = async (file: File) => {
    setChequeScanning(true);
    setChequeOcrError(null);
    setChequeNotice(null);
    try {
      const data = await scanCheque(file);
      if (!data.check_number && !data.bank && !data.check_date && data.amount == null) {
        setChequeOcrError('Rien n\'a pu être lu sur ce chèque. Saisissez les champs manuellement.');
        return;
      }
      setForm((f) => ({
        ...f,
        check_number: data.check_number ?? f.check_number,
        check_bank:   data.bank ?? f.check_bank,
        check_date:   data.check_date ?? f.check_date,
        amount:       data.amount != null ? String(data.amount) : f.amount,
        // Le scan stocké reste attaché au paiement comme preuve.
        cheque_document_id: data.document_id ?? f.cheque_document_id,
      }));
      const missing = [
        data.amount == null ? 'le montant' : null,
        !data.check_number ? 'le n° de chèque' : null,
        !data.bank ? 'la banque' : null,
        !data.check_date ? 'la date du chèque' : null,
      ].filter(Boolean);
      if (missing.length > 0) {
        setChequeNotice(`Saisissez manuellement ${missing.join(', ')} : l'OCR n'a pas pu le lire.`);
      }
    } catch (e) {
      setChequeOcrError(e instanceof Error ? e.message : 'Échec du scan OCR');
    } finally {
      setChequeScanning(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErr(null);
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErr('Merci de renseigner un montant supérieur à 0.');
      return;
    }
    if (!form.payment_date) {
      setErr('Merci de renseigner la date de paiement.');
      return;
    }
    const payload: Parameters<typeof subRentalApi.addPayment>[1] = {
      amount,
      payment_method: form.payment_method,
      payment_date: form.payment_date,
      reference: form.reference || undefined,
      notes: form.notes || undefined,
    };
    if (form.payment_method === 'cheque') {
      payload.check_number = form.check_number || undefined;
      payload.check_bank = form.check_bank || undefined;
      payload.check_date = form.check_date || undefined;
      payload.cheque_document_id = form.cheque_document_id || undefined;
    }
    mutation.mutate(payload);
  };

  return (
    <DrawerPanel open={open} title="Nouveau paiement fournisseur" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">Montant (MAD) *</span>
            <input className="df-input w-full" type="number" step="0.01" min="0.01" value={form.amount} onChange={set('amount')} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">Date & heure paiement *</span>
            <DateField className="df-input w-full" value={form.payment_date} onChange={setField('payment_date')} required />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">Mode paiement *</span>
            <select className="df-input w-full" value={form.payment_method} onChange={set('payment_method')}>
              <option value="cash">Espèces</option>
              <option value="bank_transfer">Virement</option>
              <option value="cheque">Chèque</option>
              <option value="card">Carte</option>
              <option value="other">Autre</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">Référence</span>
            <input className="df-input w-full" placeholder="Référence externe, n° reçu…" value={form.reference} onChange={set('reference')} />
          </label>
        </div>

        {form.payment_method === 'cheque' && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-indigo-800">Scanner un chèque</span>
              <span className="text-[10px] text-indigo-600">Photo ou upload — remplissage auto par OCR</span>
            </div>
            <div className="flex gap-2">
              <label className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50">
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => {
                  const f = e.target.files?.[0]; if (f) await applyChequeScan(f); e.target.value = '';
                }} />
                {chequeScanning ? 'Analyse en cours…' : 'Importer un fichier'}
              </label>
              <label className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50">
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => {
                  const f = e.target.files?.[0]; if (f) await applyChequeScan(f); e.target.value = '';
                }} />
                {chequeScanning ? 'Analyse…' : 'Prendre une photo'}
              </label>
            </div>
            {chequeOcrError && (
              <div className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{chequeOcrError}</div>
            )}
            {chequeNotice && (
              <div className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">{chequeNotice}</div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">N° chèque</span>
                <input className="df-input w-full" value={form.check_number} onChange={set('check_number')} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Banque</span>
                <input className="df-input w-full" value={form.check_bank} onChange={set('check_bank')} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Date du chèque</span>
                <DateField className="df-input w-full" value={form.check_date} onChange={setField('check_date')} />
              </label>
            </div>
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">Notes</span>
          <textarea className="df-input w-full resize-none" rows={3} value={form.notes} onChange={set('notes')} />
        </label>

        {(err || mutation.error) && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            {err ?? (mutation.error as Error | undefined)?.message ?? 'Erreur inconnue lors de l\'enregistrement.'}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="df-btn df-btn--ghost">Annuler</button>
          <button
            type="submit"
            disabled={mutation.isPending}
            onClick={(e) => {
              // Fallback in case the surrounding <form>'s submit event is
              // intercepted; ensures a click always reaches handleSubmit.
              if (e.currentTarget.form) return; // <form> will handle it
              e.preventDefault();
              handleSubmit();
            }}
            className="df-btn df-btn--primary"
          >
            {mutation.isPending ? 'Enregistrement…' : 'Enregistrer le paiement'}
          </button>
        </div>
      </form>
    </DrawerPanel>
  );
}

export const SubRentalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const apiReady = !!getApiBase();
  const [tab, setTab] = useState<Tab>('overview');
  const [showReturn, setShowReturn] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  const contractQ = useQuery({
    queryKey: ['sub-rental', id],
    queryFn: () => subRentalApi.get(id!),
    enabled: !!id && apiReady,
  });

  const paymentsQ = useQuery({
    queryKey: ['sub-rental', id, 'payments'],
    queryFn: () => subRentalApi.payments(id!),
    enabled: !!id && apiReady && tab === 'payments',
  });

  const profitQ = useQuery({
    queryKey: ['sub-rental', id, 'profitability'],
    queryFn: () => subRentalApi.profitability(id!),
    enabled: !!id && apiReady && tab === 'profitability',
  });

  const activateMutation = useMutation({
    mutationFn: () => subRentalApi.activate(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub-rental', id] }),
  });

  const closeMutation = useMutation({
    mutationFn: (force = false) => subRentalApi.close(id!, force),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub-rental', id] }),
  });

  if (!apiReady) return <div className="p-6 text-sm text-slate-600">API non configurée.</div>;
  if (contractQ.isLoading) return <div className="p-6 text-sm text-slate-500">Chargement…</div>;
  if (contractQ.isError) return <div className="p-6 text-sm text-red-600">Contrat introuvable.</div>;

  const c = contractQ.data?.data;
  if (!c) return null;

  const isActive = c.status === 'active';
  const isDraft = c.status === 'draft';
  const isReturned = c.status === 'returned';
  const isOverdue = isActive && new Date(c.end_date) < new Date();

  const vehicle = c.vehicle as any;
  const agency = c.supplier_agency;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/fleet/sub-rentals" className="text-sm text-slate-400 hover:text-slate-700">← Sous-locations</Link>
          </div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">{c.contract_number}</h1>
          <p className="text-sm text-slate-500">{agency?.name ?? '—'} · {new Date(c.start_date).toLocaleDateString('fr-MA')} → {new Date(c.end_date).toLocaleDateString('fr-MA')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <button
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {activateMutation.isPending ? 'Activation…' : 'Activer'}
            </button>
          )}
          {isActive && (
            <>
              <button onClick={() => setShowPayment(true)} className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">
                + Paiement fournisseur
              </button>
              <button onClick={() => setShowReturn(true)} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700">
                Retourner au fournisseur
              </button>
            </>
          )}
          {(isReturned || isActive) && c.status !== 'closed' && (
            <button
              onClick={() => {
                if (confirm('Clôturer ce contrat ?')) closeMutation.mutate(false);
              }}
              disabled={closeMutation.isPending}
              className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {closeMutation.isPending ? 'Clôture…' : 'Clôturer'}
            </button>
          )}
        </div>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${
          isDraft ? 'bg-slate-100 text-slate-700' :
          isActive ? 'bg-emerald-100 text-emerald-800' :
          isReturned ? 'bg-blue-100 text-blue-800' :
          c.status === 'closed' ? 'bg-purple-100 text-purple-800' :
          'bg-red-100 text-red-700'
        }`}>
          {isDraft ? 'Brouillon' : isActive ? 'Actif' : isReturned ? 'Retourné' : c.status === 'closed' ? 'Clôturé' : 'Annulé'}
        </span>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${
          c.payment_status === 'paid' ? 'bg-green-100 text-green-800' :
          c.payment_status === 'partial' ? 'bg-amber-100 text-amber-800' :
          'bg-red-100 text-red-700'
        }`}>
          {c.payment_status === 'paid' ? 'Payé' : c.payment_status === 'partial' ? 'Partiellement payé' : 'Impayé'}
        </span>
        {isOverdue && <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">EN RETARD</span>}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        <TabBtn id="overview" active={tab} onClick={setTab} label="Vue générale" />
        <TabBtn id="vehicle" active={tab} onClick={setTab} label="Véhicule" />
        <TabBtn id="supplier" active={tab} onClick={setTab} label="Fournisseur" />
        <TabBtn id="payments" active={tab} onClick={setTab} label="Paiements" />
        <TabBtn id="profitability" active={tab} onClick={setTab} label="Rentabilité" />
        <TabBtn id="return" active={tab} onClick={setTab} label="Rapport retour" />
      </div>

      {/* Tab content */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Contrat</h3>
                <InfoRow label="Numéro" value={c.contract_number} />
                <InfoRow label="Statut" value={c.status} />
                <InfoRow label="Date de début" value={new Date(c.start_date).toLocaleDateString('fr-MA')} />
                <InfoRow label="Date de fin" value={new Date(c.end_date).toLocaleDateString('fr-MA')} />
                <InfoRow label="Jours" value={Math.max(1, Math.round((new Date(c.end_date).getTime() - new Date(c.start_date).getTime()) / 86400000))} />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Coûts</h3>
                <InfoRow label="Coût journalier" value={`${Number(c.daily_cost).toLocaleString('fr-MA')} MAD`} />
                <InfoRow label="Coût total" value={`${Number(c.total_cost).toLocaleString('fr-MA')} MAD`} />
                <InfoRow label="Caution" value={c.deposit_amount ? `${Number(c.deposit_amount).toLocaleString('fr-MA')} MAD` : '—'} />
                <InfoRow label="Mode de paiement" value={
                  c.payment_method === 'cash' ? 'Espèces'
                    : c.payment_method === 'bank_transfer' ? 'Virement'
                    : c.payment_method === 'cheque' ? 'Chèque'
                    : c.payment_method === 'card' ? 'Carte'
                    : c.payment_method === 'other' ? 'Autre'
                    : c.payment_method
                } />
                <InfoRow label="Statut paiement" value={
                  c.payment_status === 'paid' ? 'Payé'
                    : c.payment_status === 'partial' ? 'Partiellement payé'
                    : c.payment_status === 'unpaid' ? 'Impayé'
                    : c.payment_status
                } />
              </div>
            </div>
            {c.notes && (
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500 mb-1">Notes</p>
                <p className="text-sm text-slate-700 whitespace-pre-line">{c.notes}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'vehicle' && (
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Véhicule</h3>
            {vehicle ? (
              <>
                <InfoRow label="Immatriculation" value={vehicle.registration_number} />
                <InfoRow label="Marque" value={vehicle.brand?.name} />
                <InfoRow label="Modèle" value={vehicle.model?.name} />
                <InfoRow label="Année" value={vehicle.year} />
                <InfoRow label="Couleur" value={vehicle.color} />
                <InfoRow label="Kilométrage" value={vehicle.mileage_current ? `${vehicle.mileage_current.toLocaleString('fr-MA')} km` : undefined} />
                <InfoRow label="Statut propriété" value={vehicle.ownership_status} />
                <div className="mt-4">
                  <Link to={`/fleet/${vehicle.id}`} className="text-sm font-semibold text-indigo-600 hover:underline">
                    Voir le véhicule dans la flotte →
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-amber-600 mb-3">Aucun véhicule lié (véhicule externe)</p>
                {c.external_vehicle_identity && (
                  <>
                    <InfoRow label="Immatriculation" value={c.external_vehicle_identity.registration_number} />
                    <InfoRow label="Marque" value={c.external_vehicle_identity.brand_name} />
                    <InfoRow label="Modèle" value={c.external_vehicle_identity.model_name} />
                    <InfoRow label="Année" value={c.external_vehicle_identity.year} />
                    <InfoRow label="Couleur" value={c.external_vehicle_identity.color} />
                    <InfoRow label="Kilométrage initial" value={c.external_vehicle_identity.mileage ? `${c.external_vehicle_identity.mileage.toLocaleString('fr-MA')} km` : undefined} />
                  </>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'supplier' && (
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Agence fournisseur</h3>
            {agency ? (
              <>
                <InfoRow label="Nom" value={agency.name} />
                <InfoRow label="Contact" value={agency.contact_person} />
                <InfoRow label="Téléphone" value={agency.phone} />
                <InfoRow label="Email" value={agency.email} />
                <InfoRow label="Ville" value={agency.city} />
                <InfoRow label="ICE" value={agency.ice} />
                <InfoRow label="RC" value={agency.rc} />
                <InfoRow label="Statut" value={
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${agency.status === 'blacklisted' ? 'bg-red-100 text-red-700' : agency.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                    {agency.status}
                  </span>
                } />
                <div className="mt-4">
                  <Link to={`/fleet/supplier-agencies`} className="text-sm font-semibold text-indigo-600 hover:underline">
                    Gérer les agences →
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">Aucune agence liée.</p>
            )}
          </div>
        )}

        {tab === 'payments' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-slate-500">Paiements fournisseur</h3>
              {isActive && (
                <button onClick={() => setShowPayment(true)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700">
                  + Paiement
                </button>
              )}
            </div>
            {paymentsQ.isLoading ? (
              <p className="text-sm text-slate-500">Chargement…</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-200 p-3 text-center">
                    <p className="text-xs font-semibold text-slate-500">Coût total</p>
                    <p className="text-lg font-bold text-slate-800">{Number(c.total_cost).toLocaleString('fr-MA')} MAD</p>
                  </div>
                  <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center">
                    <p className="text-xs font-semibold text-green-600">Payé</p>
                    <p className="text-lg font-bold text-green-800">{(paymentsQ.data?.total_paid ?? 0).toLocaleString('fr-MA')} MAD</p>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
                    <p className="text-xs font-semibold text-red-500">Solde</p>
                    <p className="text-lg font-bold text-red-700">{(paymentsQ.data?.remaining_balance ?? 0).toLocaleString('fr-MA')} MAD</p>
                  </div>
                </div>
                {(paymentsQ.data?.payments ?? []).length === 0 ? (
                  <p className="text-sm text-slate-400">Aucun paiement enregistré.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-right">Montant</th>
                        <th className="px-3 py-2 text-left">Mode</th>
                        <th className="px-3 py-2 text-left">Référence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(paymentsQ.data?.payments ?? []).map((p: SubRentalPayment) => (
                        <tr key={p.id}>
                          <td className="px-3 py-2 text-slate-600">{new Date(p.payment_date).toLocaleDateString('fr-MA')}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">{Number(p.amount).toLocaleString('fr-MA')} MAD</td>
                          <td className="px-3 py-2 text-slate-600">{p.payment_method}</td>
                          <td className="px-3 py-2 text-slate-500 text-xs">
                            {p.reference ?? '—'}
                            <div className="mt-0.5"><ScanProofLink entityType="sub_rental_payment" entityId={p.id} /></div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'profitability' && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase text-slate-500">Analyse de rentabilité</h3>
            {profitQ.isLoading ? (
              <p className="text-sm text-slate-500">Calcul en cours…</p>
            ) : profitQ.data ? (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    { label: 'Coût fournisseur', value: profitQ.data.data.supplier_cost, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
                    { label: 'Revenus client', value: profitQ.data.data.customer_revenue, color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
                    { label: 'Marge', value: profitQ.data.data.margin, color: profitQ.data.data.margin >= 0 ? 'text-emerald-700' : 'text-red-700', bg: profitQ.data.data.margin >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200' },
                    { label: 'Marge %', value: `${profitQ.data.data.margin_percentage}%`, isText: true, color: profitQ.data.data.margin >= 0 ? 'text-emerald-700' : 'text-red-700', bg: profitQ.data.data.margin >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200' },
                  ].map(({ label, value, color, bg, isText }) => (
                    <div key={label} className={`rounded-2xl border p-4 ${bg}`}>
                      <p className="text-xs font-semibold text-slate-500">{label}</p>
                      <p className={`mt-1 text-xl font-bold ${color}`}>
                        {isText ? value : `${Number(value).toLocaleString('fr-MA')} MAD`}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1">
                  <InfoRow label="Jours loués" value={profitQ.data.data.days_count} />
                  <InfoRow label="Coût/jour" value={`${Number(profitQ.data.data.daily_cost).toLocaleString('fr-MA')} MAD`} />
                  <InfoRow label="Montant payé" value={`${Number(profitQ.data.data.total_paid).toLocaleString('fr-MA')} MAD`} />
                  <InfoRow label="Solde restant" value={`${Number(profitQ.data.data.remaining_balance).toLocaleString('fr-MA')} MAD`} />
                </div>
              </>
            ) : null}
          </div>
        )}

        {tab === 'return' && (
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Rapport de retour</h3>
            {(c as any).return_report ? (
              <>
                <InfoRow label="Date retour" value={new Date((c as any).return_report.returned_at).toLocaleDateString('fr-MA')} />
                <InfoRow label="Kilométrage" value={(c as any).return_report.odometer_km ? `${(c as any).return_report.odometer_km.toLocaleString('fr-MA')} km` : undefined} />
                <InfoRow label="Niveau carburant" value={(c as any).return_report.fuel_level} />
                <InfoRow label="Signé par" value={(c as any).return_report.signed_by_supplier} />
                {(c as any).return_report.condition_notes && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500 mb-1">État</p><p className="text-sm">{(c as any).return_report.condition_notes}</p></div>
                )}
                {(c as any).return_report.damage_notes && (
                  <div className="mt-2 rounded-xl bg-red-50 p-3"><p className="text-xs font-semibold text-red-500 mb-1">Dommages</p><p className="text-sm text-red-700">{(c as any).return_report.damage_notes}</p></div>
                )}
                {(c as any).return_report.extra_charges && (
                  <div className="mt-2 rounded-xl bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-600 mb-1">Frais supplémentaires</p><p className="text-sm font-bold text-amber-800">{Number((c as any).return_report.extra_charges).toLocaleString('fr-MA')} MAD</p></div>
                )}
              </>
            ) : (
              <div className="text-sm text-slate-400">
                {isActive ? (
                  <button onClick={() => setShowReturn(true)} className="text-indigo-600 hover:underline font-semibold">
                    Effectuer le retour au fournisseur →
                  </button>
                ) : (
                  <p>Aucun rapport de retour.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showReturn && id && <ReturnModal contractId={id} onClose={() => setShowReturn(false)} />}
      {id && <AddPaymentDrawer contractId={id} open={showPayment} onClose={() => setShowPayment(false)} />}
    </div>
  );
};
