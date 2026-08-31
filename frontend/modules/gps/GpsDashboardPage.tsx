import React, { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { queryKeys } from '@/services/queryKeys';
import { Icon } from '@/modules/shared/components/Icon';
import { StatusChip } from '@/modules/shared/components/StatusChip';
import { KpiCard } from '@/modules/shared/components/KpiCard';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';
import { useUIPrefs } from '@/providers/UIPreferencesProvider';
import type { FleetVehicleDto, GpsAlertDto } from '@/services/dtos';
import { gpsApi } from '@/services/gpsApi';
import { opsApi } from '@/services/opsApi';

// Leaflet default icon fix
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Casablanca center
const CENTER: [number, number] = [33.5731, -7.5898];

/** Deterministic fake coords spread around Casablanca */
function fakeCoords(id: number | string): [number, number] {
  let seed = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) & 0xffffffff;
  seed = Math.abs(seed);
  const lat = CENTER[0] + ((seed % 100) - 50) * 0.0012;
  const lon = CENTER[1] + (((seed >>> 7) % 100) - 50) * 0.0015;
  return [lat, lon];
}

const STATUS_META: Record<string, { label: string; color: string; tone: 'success' | 'warning' | 'info' | 'danger' | 'neutral' | 'brand' }> = {
  AVAILABLE: { label: 'Disponible', color: '#10b981', tone: 'success' },
  RESERVED: { label: 'Réservé', color: '#f59e0b', tone: 'warning' },
  RENTED: { label: 'En location', color: '#22d3ee', tone: 'info' },
  UNDER_LOA: { label: 'LOA active', color: '#22d3ee', tone: 'info' },
  UNDER_CREDIT: { label: 'Crédit auto', color: '#22d3ee', tone: 'info' },
  IN_DELIVERY: { label: 'En livraison', color: '#f59e0b', tone: 'warning' },
  MAINTENANCE: { label: 'Maintenance', color: '#f59e0b', tone: 'warning' },
  BLOCKED: { label: 'Bloqué', color: '#ef4444', tone: 'danger' },
  SOLD: { label: 'Vendu', color: '#64748b', tone: 'neutral' },
};

const ACTIVE_RESERVATION_STATUSES = new Set([
  'draft', 'reserved', 'confirmed', 'pickup_scheduled',
  'handed_over', 'active', 'extension_requested',
]);

function effectiveStatusFor(v: any, reservedIds: Set<string>): string {
  const raw = String(v?.status ?? '').toUpperCase();
  if (raw === 'AVAILABLE' && reservedIds.has(String(v?.id))) return 'RESERVED';
  return raw || 'AVAILABLE';
}

function isSubRental(v: any): boolean {
  const ownership = String(v?.ownership_status ?? v?.ownershipStatus ?? '').toLowerCase();
  return ownership === 'sub_rented' || ownership === 'sub_rental';
}

const FILTER_GROUPS: { key: string; label: string; match: string[] }[] = [
  { key: 'all', label: 'Tous', match: [] },
  { key: 'live', label: 'En circulation', match: ['RENTED', 'UNDER_LOA', 'UNDER_CREDIT', 'IN_DELIVERY'] },
  { key: 'idle', label: 'Disponibles', match: ['AVAILABLE', 'RESERVED'] },
  { key: 'maint', label: 'Maintenance', match: ['MAINTENANCE'] },
  { key: 'alert', label: 'Alertes', match: ['BLOCKED'] },
];

function makeVehicleIcon(color: string, pulse = false): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:30px;height:30px;display:flex;align-items:center;justify-content:center;
      background:${color};
      border-radius:999px;
      box-shadow:0 4px 12px ${color}80, 0 0 0 4px ${color}26;
      ${pulse ? 'animation:df-pulse 1.6s infinite;' : ''}
      color:#fff;font-weight:700;
    ">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 14v4h3m13-4v4h-3M4 14l1.8-5.2A2 2 0 0 1 7.7 7.4h8.6a2 2 0 0 1 1.9 1.4L20 14M4 14h16"/>
      </svg>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

const CASA_NEIGHBORHOODS = [
  'Maarif', 'Gauthier', 'Anfa', 'Bourgogne', 'Hay Hassani', 'Sidi Bernoussi',
  'Ain Chock', 'Ain Sebaa', 'Ben M\'sik', 'Derb Sultan', 'Salmia', 'Oulfa',
  'Sbata', 'Hay Mohammadi', 'Nassim', '2 Mars', 'Racine', 'Polo',
];

const FAKE_CLIENT_NAMES = [
  'Ahmed Benali', 'Khalid Razi', 'Youssef El Idrissi', 'Omar Tazi', 'Hassan Bouazzaoui',
  'Rachid Lahlou', 'Mehdi Chraibi', 'Karim Alaoui', 'Samir Berrada', 'Nabil Ouali',
];

function fakeGpsData(id: number | string, status: string) {
  let seed = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) & 0xffffffff;
  seed = Math.abs(seed);
  const isMoving = ['RENTED', 'IN_DELIVERY', 'UNDER_LOA', 'UNDER_CREDIT'].includes(status);
  const speed = isMoving ? (seed % 90) + 10 : 0;
  const fuel = ((seed >>> 3) % 70) + 25;
  const neighborhood = CASA_NEIGHBORHOODS[seed % CASA_NEIGHBORHOODS.length];
  const clientName = isMoving ? FAKE_CLIENT_NAMES[(seed >>> 4) % FAKE_CLIENT_NAMES.length] : null;
  const now = new Date();
  const minOffset = (seed % 18);
  now.setMinutes(now.getMinutes() - minOffset);
  const lastUpdate = now.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' });
  return { speed, fuel, neighborhood, clientName, lastUpdate };
}

const MapController: React.FC<{ focus?: [number, number] }> = ({ focus }) => {
  const map = useMap();
  React.useEffect(() => {
    if (focus) map.flyTo(focus, 15, { duration: 0.7 });
  }, [focus, map]);
  return null;
};

const MapResizer: React.FC = () => {
  const map = useMap();
  React.useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(t);
  }, [map]);
  return null;
};

export const GpsDashboardPage: React.FC = () => {
  const { theme } = useUIPrefs();
  const navigate = useNavigate();
  const vehicles = useQuery({ queryKey: queryKeys.fleet.all, queryFn: async () => gpsApi.fleetVehicles() });
  const alerts = useQuery({ queryKey: queryKeys.gps.alerts, queryFn: async () => gpsApi.alerts() });
  const reservationsQ = useQuery({
    queryKey: [...queryKeys.reservations, 'gps'],
    queryFn: async () => opsApi.reservations(),
    staleTime: 60_000,
  });

  const reservedVehicleIds = useMemo(() => {
    const now = Date.now();
    const LIVE = new Set(['handed_over', 'active', 'extension_requested']);
    const s = new Set<string>();
    for (const r of ((reservationsQ.data ?? []) as any[])) {
      const st = String(r.status ?? '').toLowerCase();
      if (!r.vehicle_id) continue;
      if (LIVE.has(st)) { s.add(String(r.vehicle_id)); continue; }
      if (!ACTIVE_RESERVATION_STATUSES.has(st)) continue;
      const endMs = r.desired_end_at ? new Date(r.desired_end_at).getTime() : 0;
      if (endMs >= now) s.add(String(r.vehicle_id));
    }
    return s;
  }, [reservationsQ.data]);

  const statusOf = (v: any) => effectiveStatusFor(v, reservedVehicleIds);
  const geofencesQ = useQuery({ queryKey: [...queryKeys.gps.geofences], queryFn: async () => gpsApi.geofences() });
  const geofences = geofencesQ.data ?? [];

  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focus, setFocus] = useState<[number, number] | undefined>(undefined);

  const all = vehicles.data ?? [];
  const filtered = useMemo(() => {
    const grp = FILTER_GROUPS.find((g) => g.key === filter);
    const base = !grp || grp.match.length === 0 ? all : all.filter((v) => grp.match.includes(statusOf(v)));
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter(
      (v) =>
        v.registration.toLowerCase().includes(q) ||
        v.brand.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q),
    );
  }, [all, filter, query]);

  const selected = all.find((v) => v.id === selectedId) ?? null;
  const criticalCount = (alerts.data ?? []).filter((a) => a.severity === 'CRITICAL').length;
  const liveCount = all.filter((v) => ['RENTED', 'UNDER_LOA', 'UNDER_CREDIT', 'IN_DELIVERY'].includes(v.status)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--df-text-faint)]">
            <span className="df-pulse-dot" style={{ background: 'var(--df-success-500)', color: 'var(--df-success-500)' }} />
            Flux GPS temps réel · {formatDate(new Date())}
          </div>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Flotte & géolocalisation</h1>
          <p className="text-[color:var(--df-text-muted)]">Suivi en temps réel, historique des trajets, géofences et alertes contractuelles.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/gps/geofences" className="df-btn df-btn--ghost df-btn--sm"><Icon name="pin" size={14} /> Gérer géofences</Link>
          <button
            className="df-btn df-btn--ghost df-btn--sm"
            onClick={() => {
              const rows = [
                ['Immatriculation', 'Marque', 'Modèle', 'Statut', 'Latitude', 'Longitude'],
                ...all.map((v) => {
                  const [lat, lon] = fakeCoords(v.id);
                  return [v.registration, v.brand, v.model, v.status, lat.toFixed(6), lon.toFixed(6)];
                }),
              ];
              const csv = rows.map((r) => r.join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `positions_flotte_${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Icon name="download" size={14} /> Exporter positions
          </button>
          <Link to="/fleet" className="df-btn df-btn--primary df-btn--sm"><Icon name="plus" size={14} /> Ajouter véhicule</Link>
        </div>
      </header>

      {/* Mini KPIs */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard title="Véhicules suivis" value={all.length} tone="brand" icon="car" hint="Dispositifs GPS actifs" />
        <KpiCard title="En circulation" value={liveCount} tone="info" icon="wifi" hint="Clients / livraison" />
        <KpiCard title="Alertes actives" value={(alerts.data ?? []).length} tone={criticalCount > 0 ? 'danger' : 'warning'} icon="alert" hint={`${criticalCount} critiques`} />
        <KpiCard title="Zones (géofences)" value={geofences.length} tone="success" icon="pin" hint="Périmètres actifs" />
      </section>

      {/* Split view */}
      <section
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"
      >
        {/* LEFT — Map panel */}
        <div className="df-card overflow-hidden">
          <div className="df-card__header">
            <div>
              <div className="df-card__hint">Carte interactive</div>
              <h3 className="text-lg font-bold tracking-tight">Parc automobile · Casablanca</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="df-tabs">
                {FILTER_GROUPS.map((g) => (
                  <button key={g.key} className={`df-tab ${filter === g.key ? 'df-tab--active' : ''}`} onClick={() => setFilter(g.key)}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="h-[560px] w-full overflow-hidden rounded-2xl">
              <MapContainer center={CENTER} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <MapResizer />
                <TileLayer
                  url={
                    theme === 'dark'
                      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
                  }
                  attribution="&copy; OpenStreetMap, &copy; CARTO"
                />
                <MapController focus={focus} />
                {filtered.map((v) => {
                  const pos = fakeCoords(v.id);
                  const meta = STATUS_META[statusOf(v)] ?? STATUS_META.AVAILABLE;
                  const isSelected = selectedId === v.id;
                  return (
                    <Marker
                      key={v.id}
                      position={pos}
                      icon={makeVehicleIcon(isSelected ? '#5b5bf4' : meta.color, ['IN_DELIVERY', 'RENTED'].includes(v.status))}
                      eventHandlers={{
                        click: () => {
                          setSelectedId(isSelected ? null : v.id);
                          if (!isSelected) setFocus(pos);
                        },
                      }}
                    />
                  );
                })}
                {geofences.slice(0, 3).map((g, i) => (
                  <Circle
                    key={g.id}
                    center={[CENTER[0] + (i - 1) * 0.02, CENTER[1] + (i - 1) * 0.02]}
                    radius={900}
                    pathOptions={{ color: '#5b5bf4', fillColor: '#5b5bf4', fillOpacity: 0.08, weight: 1.5, dashArray: '6,6' }}
                  />
                ))}
              </MapContainer>
            </div>

            {/* Vehicle info card overlay */}
            {selected && (
              <div className="pointer-events-auto absolute bottom-4 left-4 z-[1000] w-72">
                <VehicleInfoCard
                  vehicle={selected}
                  onClose={() => setSelectedId(null)}
                  onNavigate={navigate}
                  reservedIds={reservedVehicleIds}
                />
              </div>
            )}

            {/* Map overlay — legend */}
            <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2">
              {(['AVAILABLE', 'RENTED', 'IN_DELIVERY', 'MAINTENANCE', 'BLOCKED'] as const).map((s) => {
                const m = STATUS_META[s];
                return (
                  <span key={s} className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-[color:var(--df-border-strong)] bg-[color:var(--df-glass)] px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md">
                    <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                    {m.label}
                  </span>
                );
              })}
            </div>

            {/* Search overlay */}
            <div className="pointer-events-none absolute right-4 top-4 w-72 max-w-[80%]">
              <div className="df-card pointer-events-auto !rounded-xl p-1.5">
                <div className="relative">
                  <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--df-text-faint)]" />
                  <input
                    type="text"
                    placeholder="Rechercher une immatriculation…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-10 w-full rounded-lg border-0 bg-transparent pl-9 pr-2 text-[13px] outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Vehicle list & alerts */}
        <aside className="space-y-6">
          {/* Vehicle list */}
          <div className="df-card">
            <div className="df-card__header">
              <div>
                <div className="df-card__hint">Flotte</div>
                <h3 className="text-[15px] font-bold">Véhicules · {filtered.length}</h3>
              </div>
              <button className="df-btn df-btn--subtle df-btn--sm df-btn--icon" aria-label="Filtres"><Icon name="filter-2" size={14} /></button>
            </div>
            <div className="max-h-[380px] overflow-y-auto px-2 pb-2">
              {filtered.map((v) => {
                const meta = STATUS_META[statusOf(v)] ?? STATUS_META.AVAILABLE;
                const isSel = selectedId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => { setSelectedId(v.id); setFocus(fakeCoords(v.id)); }}
                    className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${
                      isSel ? 'bg-[color:var(--df-brand-50)] dark:bg-[color:var(--df-brand-100)]' : 'hover:bg-[color:var(--df-surface-sunk)]'
                    }`}
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}
                    >
                      <Icon name="car" size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {isSubRental(v) && (
                          <span
                            title="Véhicule en sous-location"
                            className="rounded bg-violet-600 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-white"
                          >
                            SL
                          </span>
                        )}
                        <div className="truncate text-[13px] font-bold">{v.brand} {v.model}</div>
                      </div>
                      <div className="truncate font-mono text-[11px] text-[color:var(--df-text-muted)]">{v.registration}</div>
                    </div>
                    <StatusChip label={meta.label} tone={meta.tone} />
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="py-10 text-center text-sm text-[color:var(--df-text-muted)]">Aucun véhicule ne correspond.</div>
              )}
            </div>
          </div>

          {/* Alerts */}
          <div className="df-card">
            <div className="df-card__header">
              <div>
                <div className="df-card__hint">Sécurité</div>
                <h3 className="text-[15px] font-bold">Alertes récentes</h3>
              </div>
              <StatusChip label={`${criticalCount} critiques`} tone={criticalCount > 0 ? 'danger' : 'neutral'} dot />
            </div>
            <div className="space-y-2 p-3">
              {(alerts.data ?? []).slice(0, 5).map((a) => (
                <AlertRow key={a.id} a={a} />
              ))}
              {(alerts.data ?? []).length === 0 && (
                <div className="py-6 text-center text-sm text-[color:var(--df-text-muted)]">Aucune alerte en cours.</div>
              )}
            </div>
          </div>
        </aside>
      </section>

    </div>
  );
};

const VehicleInfoCard: React.FC<{
  vehicle: FleetVehicleDto;
  onClose: () => void;
  onNavigate: ReturnType<typeof useNavigate>;
  reservedIds?: Set<string>;
}> = ({ vehicle: v, onClose, onNavigate, reservedIds }) => {
  const meta = STATUS_META[effectiveStatusFor(v, reservedIds ?? new Set())] ?? STATUS_META.AVAILABLE;
  const gps = fakeGpsData(v.id, v.status);

  const fuelColor = gps.fuel >= 50 ? '#10b981' : gps.fuel >= 25 ? '#f59e0b' : '#ef4444';

  return (
    <div
      className="rounded-2xl border border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur-md overflow-hidden"
      style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
    >
      {/* Header: photo + identity */}
      <div className="relative">
        {v.image ? (
          <img src={v.image} alt={`${v.brand} ${v.model}`} className="h-28 w-full object-cover" />
        ) : (
          <div className="flex h-28 w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
            <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.2" className="h-12 w-12">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 14v4h3m13-4v4h-3M4 14l1.8-5.2A2 2 0 0 1 7.7 7.4h8.6a2 2 0 0 1 1.9 1.4L20 14M4 14h16M7.5 17.5h.01m9 0h.01" />
            </svg>
          </div>
        )}
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60"
          aria-label="Fermer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {/* Status badge */}
        <div
          className="absolute bottom-2 left-3 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white"
          style={{ background: meta.color }}
        >
          {meta.label}
        </div>
      </div>

      {/* Body */}
      <div className="px-3 pb-3 pt-2.5 space-y-2.5">
        {/* Vehicle title */}
        <div>
          <div className="flex items-center gap-1.5">
            {isSubRental(v) && (
              <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-white">SL</span>
            )}
            <div className="text-[15px] font-black text-slate-900">{v.brand} {v.model} {v.version ?? ''}</div>
          </div>
          <div className="font-mono text-[11px] font-bold text-slate-500">{v.registration}</div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-1.5">
          {/* Client */}
          <div className="col-span-2 flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-[11px] text-slate-500">Client</span>
            <span className="ml-auto text-[11px] font-bold text-slate-800">{gps.clientName ?? '—'}</span>
          </div>

          {/* Position */}
          <div className="col-span-2 flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[11px] text-slate-500">Position</span>
            <span className="ml-auto text-[11px] font-bold text-slate-800">Casablanca — {gps.neighborhood}</span>
          </div>

          {/* Speed */}
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Vitesse</div>
              <div className="text-[12px] font-black text-slate-800">{gps.speed} km/h</div>
            </div>
          </div>

          {/* Fuel */}
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l9-3 9 3M3 6v13l9 3 9-3V6" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Carburant</div>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${gps.fuel}%`, background: fuelColor }} />
                </div>
                <span className="text-[11px] font-black" style={{ color: fuelColor }}>{gps.fuel}%</span>
              </div>
            </div>
          </div>

          {/* Km */}
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
              <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 8v4l3 3" />
            </svg>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Kilométrage</div>
              <div className="text-[12px] font-black text-slate-800">
                {v.mileageKm ? v.mileageKm.toLocaleString('fr-MA') : '—'} km
              </div>
            </div>
          </div>

          {/* Last update */}
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
              <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v6l4 2" />
            </svg>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Mise à jour</div>
              <div className="text-[12px] font-black text-slate-800">{gps.lastUpdate}</div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => onNavigate(`/fleet?id=${v.id}`)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-indigo-700 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 14v4h3m13-4v4h-3M4 14l1.8-5.2A2 2 0 0 1 7.7 7.4h8.6a2 2 0 0 1 1.9 1.4L20 14M4 14h16" />
            </svg>
            Voir véhicule
          </button>
          <button
            type="button"
            onClick={() => onNavigate(`/gps?trip=${v.id}`)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Voir trajet
          </button>
          <button
            type="button"
            onClick={() => {
              if (v.assignedClientId) onNavigate(`/customers/${v.assignedClientId}`);
            }}
            disabled={!v.assignedClientId}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Conducteur
          </button>
        </div>
      </div>
    </div>
  );
};

const AlertRow: React.FC<{ a: GpsAlertDto }> = ({ a }) => {
  const tone = a.severity === 'CRITICAL' ? 'danger' : a.severity === 'WARN' ? 'warning' : 'info';
  const iconMap = { CRITICAL: 'alert', WARN: 'alert', INFO: 'bell' } as const;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-sunk)] p-3">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: tone === 'danger' ? 'color-mix(in srgb, var(--df-danger-500) 14%, transparent)'
                     : tone === 'warning' ? 'color-mix(in srgb, var(--df-warning-500) 14%, transparent)'
                     : 'color-mix(in srgb, var(--df-info-500) 14%, transparent)',
          color: tone === 'danger' ? 'var(--df-danger-600)'
                : tone === 'warning' ? 'var(--df-warning-600)'
                : 'var(--df-info-500)',
        }}
      >
        <Icon name={iconMap[a.severity]} size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusChip label={a.type} tone={tone} />
          <span className="text-[11px] text-[color:var(--df-text-faint)]">{new Date(a.at).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="mt-1 text-[12.5px] leading-relaxed text-[color:var(--df-text-muted)]">{a.message}</div>
      </div>
    </div>
  );
};

