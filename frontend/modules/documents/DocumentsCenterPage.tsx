import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { documentCenterApi, type DocumentCenterItem } from '@/services/documentCenterApi';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { formatDate } from '@/modules/shared/formatters';
import { Link } from 'react-router-dom';

const ENTITY_OPTIONS = ['', 'vehicle', 'customer', 'contract', 'accident', 'mission', 'kyc_case', 'invoice'];
const EXPIRY_OPTIONS = ['', 'expired', 'expiring_30', 'missing_expiry', 'ok'];

export const DocumentsCenterPage: React.FC = () => {
  const [entityType, setEntityType] = useState('');
  const [category, setCategory] = useState('');
  const [expiryStatus, setExpiryStatus] = useState('');
  const [owner, setOwner] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filters = useMemo(
    () => ({
      entity_type: entityType || undefined,
      category: category || undefined,
      expiry_status: expiryStatus || undefined,
      uploaded_by: owner || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      per_page: 200,
    }),
    [entityType, category, expiryStatus, owner, dateFrom, dateTo],
  );

  const listQ = useQuery({
    queryKey: ['documents-center', filters],
    queryFn: () => documentCenterApi.list(filters),
  });
  const expiringQ = useQuery({
    queryKey: ['documents-expiring'],
    queryFn: () => documentCenterApi.expiring(30),
  });

  const rows = listQ.data?.data ?? [];
  const expiring = expiringQ.data?.data?.items ?? [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black text-slate-900">Centre documentaire</h1>
        <p className="text-sm text-slate-500">Référentiel unique des pièces KYC, flotte, sinistres, missions et PDFs générés.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">Filtres</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <SelectFilter label="Type entité" value={entityType} onChange={setEntityType} options={ENTITY_OPTIONS} />
          <TextFilter label="Catégorie" value={category} onChange={setCategory} placeholder="ex: assurance" />
          <SelectFilter label="Statut expiration" value={expiryStatus} onChange={setExpiryStatus} options={EXPIRY_OPTIONS} />
          <TextFilter label="Owner (ID utilisateur)" value={owner} onChange={setOwner} placeholder="uuid" />
          <DateFilter label="Date début" value={dateFrom} onChange={setDateFrom} />
          <DateFilter label="Date fin" value={dateTo} onChange={setDateTo} />
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="mb-2 text-sm font-black text-amber-900">Cockpit expiration (30 jours)</div>
        {expiringQ.isLoading ? (
          <p className="text-sm text-amber-700">Chargement…</p>
        ) : expiring.length === 0 ? (
          <p className="text-sm text-amber-700">Aucun document en alerte.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {expiring.slice(0, 12).map((d) => (
              <div key={d.id} className="rounded-xl border border-amber-200 bg-white px-3 py-2">
                <div className="text-sm font-semibold text-slate-900">{d.title}</div>
                <div className="text-xs text-slate-500">
                  {d.entityType} #{d.entityId} · {d.expiryDate ? formatDate(d.expiryDate) : 'Sans échéance'}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-black text-slate-900">Repository central</div>
          <div className="text-xs text-slate-500">{rows.length} élément(s)</div>
        </div>
        {listQ.isLoading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="Aucun document trouvé" description="Ajustez les filtres ou téléversez des documents depuis les entités." />
        ) : (
          <div className="space-y-2">
            {rows.map((d) => (
              <DocumentLine key={d.id} doc={d} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const DocumentLine: React.FC<{ doc: DocumentCenterItem }> = ({ doc }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
    <div>
      <div className="text-sm font-semibold text-slate-900">{doc.title}</div>
      <div className="text-xs text-slate-500">
        {doc.category ?? '—'} · {doc.entityType ?? '—'} #{doc.entityId ?? '—'} · {doc.source}
      </div>
    </div>
    <div className="flex items-center gap-2 text-xs">
      {doc.expiryDate && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-700">Expire: {formatDate(doc.expiryDate)}</span>}
      <a className="font-bold text-indigo-600 hover:underline" href={documentCenterApi.downloadUrl(doc.id)} target="_blank" rel="noreferrer">
        Ouvrir
      </a>
      {doc.entityType && doc.entityId && <Link className="font-bold text-slate-600 hover:underline" to={entityLink(doc.entityType, doc.entityId)}>Entité</Link>}
    </div>
  </div>
);

function entityLink(entityType: string, entityId: string): string {
  if (entityType === 'vehicle') return `/fleet/${entityId}`;
  if (entityType === 'customer') return `/customers/${entityId}`;
  if (entityType === 'contract') return `/contracts/${entityId}`;
  if (entityType === 'mission') return '/mobile-ops';
  return '/dashboard';
}

const SelectFilter: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: string[] }> = ({ label, value, onChange, options }) => (
  <label className="text-xs font-bold text-slate-600">
    <span className="mb-1 block">{label}</span>
    <select className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o || 'all'} value={o}>
          {o || 'Tous'}
        </option>
      ))}
    </select>
  </label>
);

const TextFilter: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string }> = ({ label, value, onChange, placeholder }) => (
  <label className="text-xs font-bold text-slate-600">
    <span className="mb-1 block">{label}</span>
    <input className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  </label>
);

const DateFilter: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <label className="text-xs font-bold text-slate-600">
    <span className="mb-1 block">{label}</span>
    <input type="date" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
  </label>
);
