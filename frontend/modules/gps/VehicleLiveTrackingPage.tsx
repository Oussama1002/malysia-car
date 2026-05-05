import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet';
import { gpsApi } from '@/services/gpsApi';
import { queryKeys } from '@/services/queryKeys';

export const VehicleLiveTrackingPage: React.FC = () => {
  const { id } = useParams();
  const vehicleId = id ?? '';

  const q = useQuery({
    queryKey: [...queryKeys.gps.live, vehicleId],
    queryFn: async () => gpsApi.vehiclePositions(vehicleId),
    enabled: !!vehicleId,
    refetchInterval: 5000,
  });

  const points = useMemo(() => {
    const rows = (q.data ?? []).slice().reverse();
    return rows
      .map((p: any) => [Number(p.latitude), Number(p.longitude)] as [number, number])
      .filter((x) => Number.isFinite(x[0]) && Number.isFinite(x[1]));
  }, [q.data]);

  const center = points.length ? points[points.length - 1] : ([33.5731, -7.5898] as [number, number]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <Link to="/gps" className="text-sm font-semibold text-indigo-600">
            ← GPS
          </Link>
          <h1 className="mt-2 text-2xl font-black text-slate-900">Tracking live</h1>
          <p className="text-slate-500 font-mono text-xs">{vehicleId}</p>
        </div>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="h-[560px] w-full">
          <MapContainer center={center} zoom={14} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution="&copy; OpenStreetMap, &copy; CARTO" />
            {points.length > 1 && <Polyline positions={points} pathOptions={{ color: '#5b5bf4', weight: 4, opacity: 0.85 }} />}
            {points.length > 0 && <Marker position={points[points.length - 1]} />}
          </MapContainer>
        </div>
      </div>
    </div>
  );
};

