import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listLegalCases, type LegalCase } from '@/services/arrearsApi';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { formatCurrencyMad } from '@/modules/shared/formatters';

const CASE_TYPE_LABEL: Record<LegalCase['case_type'], string> = {
  recovery: 'Recouvrement',
  repossession: 'Saisie véhicule',
  judgment: 'Jugement',
  settlement: 'Accord amiable',
};

const STATUS_LABEL: Record<LegalCase['status'], string> = {
  open: 'Ouvert',
  in_progress: 'En cours',
  judgment_obtained: 'Jugement obtenu',
  appeal: 'Appel',
  settled: 'Réglé',
  closed: 'Clôturé',
};

const STATUS_TONE: Record<LegalCase['status'], 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  open: 'info',
  in_progress: 'warning',
  judgment_obtained: 'success',
  appeal: 'warning',
  settled: 'success',
  closed: 'default',
};

export const LegalCasesPage: React.FC = () => {
  const [caseType, setCaseType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const legalQ = useQuery({
    queryKey: ['arrears', 'legal-cases', { caseType, status, search }],
    queryFn: () => listLegalCases({ case_type: caseType || undefined, status: status || undefined, search: search || undefined }),
  });

  const cases = legalQ.data?.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/arrears" className="text-xs font-bold text-indigo-600">← Contentieux</Link>
          <h1 className="text-2xl font-black text-slate-900">Dossiers juridiques</h1>
          <p className="text-slate-500">Procédures judiciaires, jugements et ordres de saisie.</p>
        </div>
      </header>

      <div className="df-card">
        <div className="df-card__body flex flex-wrap gap-3">
          <input
            placeholder="Référence dossier / client…"
            className="df-input flex-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="df-input" value={caseType} onChange={(e) => setCaseType(e.target.value)}>
            <option value="">Tous types</option>
            {(Object.entries(CASE_TYPE_LABEL) as [LegalCase['case_type'], string][]).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
          <select className="df-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous statuts</option>
            {(Object.entries(STATUS_LABEL) as [LegalCase['status'], string][]).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {legalQ.isLoading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : !cases.length ? (
        <EmptyState title="Aucun dossier juridique" description="Les dossiers juridiques sont créés depuis un dossier contentieux en phase juridique." />
      ) : (
        <div className="df-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">N° dossier</th>
                <th>Client</th>
                <th>Type</th>
                <th>Avocat</th>
                <th>Tribunal</th>
                <th className="text-right">Montant réclamé</th>
                <th>Audience</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cases.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono font-bold text-slate-900">{c.case_number}</td>
                  <td className="text-slate-800">{c.customer?.full_name ?? '—'}</td>
                  <td><StatusBadge label={CASE_TYPE_LABEL[c.case_type]} tone="info" /></td>
                  <td className="text-slate-600">{c.lawyer_name ?? '—'}</td>
                  <td className="text-slate-600">{c.court_name ?? '—'}</td>
                  <td className="text-right font-mono">{formatCurrencyMad(Number(c.claimed_amount))}</td>
                  <td className="text-slate-500 text-xs">{c.hearing_date ?? '—'}</td>
                  <td><StatusBadge label={STATUS_LABEL[c.status]} tone={STATUS_TONE[c.status]} /></td>
                  <td className="px-2">
                    <Link to={`/arrears/legal/${c.id}`} className="df-btn df-btn--ghost text-xs">Détail →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
