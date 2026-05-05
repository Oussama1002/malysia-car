import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gpsApi } from '@/services/gpsApi';
import { queryKeys } from '@/services/queryKeys';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';

export const GeofencesPage: React.FC = () => {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: queryKeys.gps.geofences, queryFn: async () => gpsApi.geofences() });
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: async () =>
      gpsApi.createGeofence({
        name,
        geofence_type: 'CIRCLE',
        center_latitude: 33.5731,
        center_longitude: -7.5898,
        radius_meters: 900,
      }),
    onSuccess: async () => {
      setName('');
      await qc.invalidateQueries({ queryKey: queryKeys.gps.geofences });
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-slate-900">Géofences</h1>
        <p className="text-slate-500">Création et affectation véhicule (zones dépôt, agences, zones interdites).</p>
      </header>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm space-y-3">
        <div className="text-sm font-black text-slate-900">Créer une géofence (cercle)</div>
        <div className="flex flex-col gap-3 md:flex-row">
          <input className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom zone" />
          <button
            className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {(q.data ?? []).map((g: any) => (
            <div key={g.id} className="p-5 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-slate-900">{g.name}</div>
                <div className="mt-1 text-xs text-slate-500 font-mono">{String(g.id).slice(0, 12)}</div>
              </div>
              <StatusBadge label="ACTIVE" tone="success" />
            </div>
          ))}
          {(q.data ?? []).length === 0 && <div className="p-10 text-center text-sm text-slate-500">Aucune zone.</div>}
        </div>
      </div>
    </div>
  );
};

