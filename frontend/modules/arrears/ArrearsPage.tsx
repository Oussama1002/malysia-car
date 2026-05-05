import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { listArrearsCases } from '@/services/arrearsApi';
import { queryKeys } from '@/services/queryKeys';
import { DataTable } from '@/modules/shared/components/DataTable';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { formatCurrencyMad } from '@/modules/shared/formatters';
import { Timeline } from '@/modules/shared/components/Timeline';

export const ArrearsPage: React.FC = () => {
  const q = useQuery({
    queryKey: queryKeys.arrears.cases,
    queryFn: async () => {
      const res = await listArrearsCases({ per_page: 200 });
      return res.data;
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-slate-900">Impayés & recouvrement</h1>
        <p className="text-slate-500">Relances, mises en demeure, contentieux.</p>
      </header>

      <DataTable
        loading={q.isLoading}
        columns={[
          { key: 'c', header: 'Client', render: (r) => <span className="font-bold">{r.clientName}</span> },
          { key: 'd', header: 'Retard (j)', render: (r) => <span className="font-black">{r.daysLate}</span> },
          { key: 'a', header: 'Montant', render: (r) => formatCurrencyMad(r.amountDueMad) },
          {
            key: 's',
            header: 'Gravité',
            render: (r) => <StatusBadge label={r.severity} tone={r.severity === 'HIGH' ? 'danger' : 'warning'} />,
          },
          { key: 'st', header: 'Statut', render: (r) => <span className="text-xs font-black uppercase">{r.status}</span> },
          { key: 'n', header: 'Prochaine action', render: (r) => r.nextAction ?? '—' },
        ]}
        rows={q.data ?? []}
        rowKey={(r) => r.id}
        emptyTitle="Aucun dossier"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-3 text-sm font-black">Timeline (exemple)</div>
          <Timeline
            items={[
              { id: '1', title: 'Relance 1 envoyée', at: new Date().toISOString(), tone: 'info' },
              { id: '2', title: 'Relance 2', at: new Date().toISOString(), tone: 'warning' },
            ]}
          />
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="text-sm font-black">Automatisations</div>
          <p className="mt-2 text-sm text-slate-600">Règles de relance / pénalités / escalade: écran admin à brancher.</p>
        </div>
      </div>
    </div>
  );
};
