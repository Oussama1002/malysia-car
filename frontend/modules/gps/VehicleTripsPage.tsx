import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { gpsApi } from '@/services/gpsApi';
import { DataTable } from '@/modules/shared/components/DataTable';

export const VehicleTripsPage: React.FC = () => {
  const { id } = useParams();
  const vehicleId = id ?? '';

  const q = useQuery({
    queryKey: ['gps', 'vehicle', vehicleId, 'trips'],
    queryFn: async () => gpsApi.vehicleTrips(vehicleId),
    enabled: !!vehicleId,
  });

  return (
    <div className="space-y-6">
      <header>
        <Link to="/gps" className="text-sm font-semibold text-indigo-600">
          ← GPS
        </Link>
        <h1 className="mt-2 text-2xl font-black text-slate-900">Historique trajets</h1>
        <p className="text-slate-500 font-mono text-xs">{vehicleId}</p>
      </header>

      <DataTable
        loading={q.isLoading}
        rows={q.data ?? []}
        rowKey={(r: any) => r.id}
        emptyTitle="Aucun trajet"
        columns={[
          { key: 'start', header: 'Début', render: (r: any) => <span className="text-xs">{new Date(r.started_at).toLocaleString('fr-MA')}</span> },
          { key: 'end', header: 'Fin', render: (r: any) => <span className="text-xs">{r.ended_at ? new Date(r.ended_at).toLocaleString('fr-MA') : '—'}</span> },
          { key: 'dist', header: 'Distance', render: (r: any) => <span className="font-black">{r.distance_km ?? '—'} km</span> },
          { key: 'dur', header: 'Durée', render: (r: any) => <span className="text-sm">{r.duration_seconds ? `${Math.round(r.duration_seconds / 60)} min` : '—'}</span> },
          { key: 'max', header: 'Vmax', render: (r: any) => <span className="text-sm">{r.max_speed_kmh ?? '—'} km/h</span> },
        ]}
      />
    </div>
  );
};

