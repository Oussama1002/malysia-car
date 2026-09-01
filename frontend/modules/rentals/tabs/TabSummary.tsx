import React from 'react';

const fmtMad = (v: number) =>
  `${v.toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MAD`;

const RESERVATION_TYPE_FR: Record<string, string> = {
  SHORT_RENTAL: 'LCD',
  short_rental: 'LCD',
  LONG_RENTAL: 'Location longue durée',
  long_rental: 'Location longue durée',
  LLD: 'LLD',
  LOA: 'LOA',
  CREDIT_AUTO: 'Crédit automobile',
  VENTE_VO: 'Vente VO',
};

const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

interface Props {
  data: any;
}

function diffDays(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

const TabSummary: React.FC<Props> = ({ data }) => {
  if (!data) return null;
  const r = data.reservation;
  const totals = data.totals ?? { estimated_price: 0, extensions_total: 0, damages_total: 0, paid: 0 };
  const grandTotal = totals.estimated_price + totals.extensions_total + totals.damages_total;
  const balance = grandTotal - totals.paid;
  const days = diffDays(r.desired_start_at, r.desired_end_at);

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {[
          { label: 'Durée location', value: `${days} jour${days > 1 ? 's' : ''}`, color: 'bg-indigo-50 text-indigo-700' },
          { label: 'Montant total', value: fmtMad(grandTotal), color: 'bg-slate-50 text-slate-800' },
          { label: 'Payé', value: fmtMad(totals.paid), color: 'bg-emerald-50 text-emerald-700' },
          { label: 'Solde restant', value: fmtMad(balance), color: balance > 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700' },
          { label: 'Caution', value: '—', color: 'bg-amber-50 text-amber-700' },
          { label: 'Km inclus', value: '—', color: 'bg-cyan-50 text-cyan-700' },
          { label: 'Extensions', value: fmtMad(totals.extensions_total), color: 'bg-violet-50 text-violet-700' },
          { label: 'Dommages', value: fmtMad(totals.damages_total), color: 'bg-orange-50 text-orange-700' },
        ].map((c, i) => (
          <div key={i} className={`rounded-xl px-4 py-4 ${c.color}`}>
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">{c.label}</div>
            <div className="mt-1 text-lg font-black">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Reservation info */}
        <div className="rounded-xl border border-slate-100 p-5">
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Informations réservation</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              ['N° réservation', r.reservation_number],
              ['Type', RESERVATION_TYPE_FR[r.reservation_type] ?? r.reservation_type ?? '—'],
              ['Mode paiement', r.payment_method ?? '—'],
              ['Adresse pickup', r.pickup_address ?? '—'],
              ['Adresse livraison', r.delivery_address ?? '—'],
              ['Début', fmtDate(r.desired_start_at)],
              ['Fin', fmtDate(r.desired_end_at)],
              ['Créé le', fmtDate(r.created_at)],
            ].map(([k, v], i) => (
              <React.Fragment key={i}>
                <dt className="font-semibold text-slate-500">{k}</dt>
                <dd className="font-bold text-slate-800">{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>

        {/* Customer */}
        <div className="rounded-xl border border-slate-100 p-5">
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Client</h3>
          <div className="text-sm font-bold text-slate-800">{data.customer_name ?? '—'}</div>
          <div className="mt-1 text-xs text-slate-500">ID : {r.customer_id?.slice(0, 8).toUpperCase() ?? '—'}</div>

          <h3 className="mb-3 mt-6 text-xs font-black uppercase tracking-widest text-slate-400">Véhicule</h3>
          <div className="text-sm font-bold text-slate-800">{data.vehicle_name ?? '—'}</div>
          <div className="mt-1 text-xs text-slate-500">Immatriculation : {data.vehicle_registration ?? '—'}</div>
        </div>
      </div>

      {/* Notes */}
      {r.notes && (
        <div className="rounded-xl border border-slate-100 p-5">
          <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">Notes</h3>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.notes}</p>
        </div>
      )}
    </div>
  );
};

export default TabSummary;
