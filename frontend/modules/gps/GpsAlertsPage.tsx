import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { gpsApi } from '@/services/gpsApi';
import { queryKeys } from '@/services/queryKeys';
import { DataTable } from '@/modules/shared/components/DataTable';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';

export const GpsAlertsPage: React.FC = () => {
  const q = useQuery({ queryKey: queryKeys.gps.alerts, queryFn: async () => gpsApi.alerts() });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-slate-900">Alertes GPS</h1>
        <p className="text-slate-500">Détection rule-driven (zones, immobilisation, mouvements non autorisés).</p>
      </header>

      <DataTable
        loading={q.isLoading}
        rows={q.data ?? []}
        rowKey={(r: any) => r.id}
        emptyTitle="Aucune alerte"
        columns={[
          { key: 'type', header: 'Type', render: (r: any) => <StatusBadge label={r.type} tone="info" /> },
          { key: 'sev', header: 'Sévérité', render: (r: any) => <StatusBadge label={r.severity} tone={r.severity === 'CRITICAL' ? 'danger' : r.severity === 'WARN' ? 'warning' : 'info'} /> },
          { key: 'msg', header: 'Message', render: (r: any) => <span className="text-sm">{r.message}</span> },
          { key: 'at', header: 'Date', render: (r: any) => <span className="text-xs text-slate-500">{new Date(r.at).toLocaleString('fr-MA')}</span> },
        ]}
      />
    </div>
  );
};

