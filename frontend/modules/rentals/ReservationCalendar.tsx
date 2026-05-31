import React, { useMemo, useState } from 'react';
import type { ReservationDto } from '@/services/opsApi';

// ─────────────────────────────────────────────────────────────────────────────
// Google-Calendar-style reservation calendar.
//
// Views:
//   - Week  (default): 7 day columns, hourly grid 07-22, events placed by
//     start time, height = duration.
//   - Month: classic 6 × 7 grid, each day cell shows up to 3 event chips
//     plus an overflow indicator.
//   - Day:   single column, same hour grid as Week, full width.
//
// Interactions:
//   - Prev / Today / Next nav, view switcher in the header.
//   - Optional vehicle filter (dropdown) to focus on one car.
//   - Click an empty time slot (Week / Day) → onCreateAt(startISO, endISO)
//     so the parent can pre-fill its "Nouvelle réservation" form.
//   - Click an event → onSelect(reservation.id) for the parent to open the
//     existing detail / lifecycle panel.
//
// No external calendar library — keeps the bundle small and the styling
// consistent with the rest of the DriveFlow UI.
// ─────────────────────────────────────────────────────────────────────────────

type View = 'week' | 'month' | 'day';

const HOUR_START = 7;
const HOUR_END = 22;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

const FR_DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const FR_MONTH_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/** A small, deterministic colour palette for events. */
const PALETTE = [
  { bg: 'bg-indigo-500', soft: 'bg-indigo-50', border: 'border-indigo-300', text: 'text-indigo-900' },
  { bg: 'bg-emerald-500', soft: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-900' },
  { bg: 'bg-amber-500', soft: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-900' },
  { bg: 'bg-rose-500', soft: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-900' },
  { bg: 'bg-sky-500', soft: 'bg-sky-50', border: 'border-sky-300', text: 'text-sky-900' },
  { bg: 'bg-violet-500', soft: 'bg-violet-50', border: 'border-violet-300', text: 'text-violet-900' },
  { bg: 'bg-teal-500', soft: 'bg-teal-50', border: 'border-teal-300', text: 'text-teal-900' },
] as const;

function colourFor(key: string): (typeof PALETTE)[number] {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ── Date helpers ────────────────────────────────────────────────────────────
const ms = (d: Date) => d.getTime();
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfWeek = (d: Date) => { const x = startOfDay(d); const dow = (x.getDay() + 6) % 7; return addDays(x, -dow); }; // Mon
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

/** Build a yyyy-MM-ddTHH:mm string (the format <input type="datetime-local"> accepts). */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function periodLabel(view: View, anchor: Date): string {
  if (view === 'day') return anchor.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (view === 'month') return `${FR_MONTH_LONG[anchor.getMonth()]} ${anchor.getFullYear()}`;
  const ws = startOfWeek(anchor);
  const we = addDays(ws, 6);
  if (ws.getMonth() === we.getMonth()) return `${ws.getDate()} – ${we.getDate()} ${FR_MONTH_LONG[ws.getMonth()]} ${we.getFullYear()}`;
  return `${ws.getDate()} ${FR_MONTH_LONG[ws.getMonth()]} – ${we.getDate()} ${FR_MONTH_LONG[we.getMonth()]} ${we.getFullYear()}`;
}

// ── Types ───────────────────────────────────────────────────────────────────
interface NormalizedEvent {
  id: string;
  ref: string;
  start: Date;
  end: Date;
  vehicleId: string;
  vehicleLabel: string;
  customerLabel: string;
  status: string;
}

// ── Component ───────────────────────────────────────────────────────────────
export const ReservationCalendar: React.FC<{
  reservations: ReservationDto[];
  vehicles: { id: string; label: string }[];
  customers: { id: string; label: string }[];
  onCreateAt?: (startISO: string, endISO: string) => void;
  onSelect?: (id: string) => void;
}> = ({ reservations, vehicles, customers, onCreateAt, onSelect }) => {
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [vehicleFilter, setVehicleFilter] = useState<string>('');

  const vehicleLabel = (id: string) => vehicles.find((v) => String(v.id) === String(id))?.label ?? `#${id.substring(0, 6)}`;
  const customerLabel = (id: string) => customers.find((c) => String(c.id) === String(id))?.label ?? `#${id.substring(0, 6)}`;

  // Visible range for filtering events.
  const range = useMemo(() => {
    if (view === 'day') return { start: startOfDay(anchor), end: endOfDay(anchor) };
    if (view === 'week') {
      const ws = startOfWeek(anchor);
      return { start: ws, end: endOfDay(addDays(ws, 6)) };
    }
    // Month grid covers complete 6 weeks for layout reasons.
    const first = startOfMonth(anchor);
    const ws = startOfWeek(first);
    return { start: ws, end: endOfDay(addDays(ws, 6 * 7 - 1)) };
  }, [view, anchor]);

  const events = useMemo<NormalizedEvent[]>(() => {
    const out: NormalizedEvent[] = [];
    for (const r of reservations) {
      if (!r.desired_start_at || !r.desired_end_at) continue;
      if (vehicleFilter && String(r.vehicle_id) !== vehicleFilter) continue;
      const s = new Date(r.desired_start_at);
      const e = new Date(r.desired_end_at);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
      // Visibility test: overlaps the visible range at all.
      if (ms(e) < ms(range.start) || ms(s) > ms(range.end)) continue;
      out.push({
        id: r.id,
        ref: r.reservation_number,
        start: s,
        end: e,
        vehicleId: String(r.vehicle_id),
        vehicleLabel: vehicleLabel(String(r.vehicle_id)),
        customerLabel: customerLabel(String(r.customer_id)),
        status: r.status,
      });
    }
    return out;
  }, [reservations, range, vehicleFilter, vehicles, customers]);

  const goPrev = () => setAnchor(addDays(anchor, view === 'day' ? -1 : view === 'week' ? -7 : -30));
  const goNext = () => setAnchor(addDays(anchor, view === 'day' ? 1 : view === 'week' ? 7 : 30));
  const goToday = () => setAnchor(new Date());

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToday}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Aujourd'hui
          </button>
          <div className="flex overflow-hidden rounded-xl border border-slate-200">
            <button type="button" aria-label="Précédent" onClick={goPrev} className="px-3 py-1.5 text-slate-700 hover:bg-slate-50">‹</button>
            <button type="button" aria-label="Suivant"  onClick={goNext} className="border-l border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50">›</button>
          </div>
          <div className="ml-1 text-lg font-black capitalize text-slate-900">{periodLabel(view, anchor)}</div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
          >
            <option value="">Tous les véhicules</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
          <div className="flex overflow-hidden rounded-xl border border-slate-200 text-xs font-bold">
            {(['day', 'week', 'month'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1.5 ${view === v ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'} ${v !== 'day' ? 'border-l border-slate-200' : ''}`}
              >
                {v === 'day' ? 'Jour' : v === 'week' ? 'Semaine' : 'Mois'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Grid ─────────────────────────────────────────────────────── */}
      {view === 'month' ? (
        <MonthGrid anchor={anchor} events={events} onSelect={onSelect} onCreateAt={onCreateAt} />
      ) : (
        <TimeGrid view={view} anchor={anchor} events={events} onSelect={onSelect} onCreateAt={onCreateAt} />
      )}
    </div>
  );
};

// ── Time grid (Week + Day) ──────────────────────────────────────────────────
const SLOT_HEIGHT_PX = 56;          // height of one hour cell
const HEADER_HEIGHT_PX = 36;        // day-name header row

const TimeGrid: React.FC<{
  view: View;
  anchor: Date;
  events: NormalizedEvent[];
  onSelect?: (id: string) => void;
  onCreateAt?: (startISO: string, endISO: string) => void;
}> = ({ view, anchor, events, onSelect, onCreateAt }) => {
  const days = useMemo(() => {
    if (view === 'day') return [startOfDay(anchor)];
    const ws = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [view, anchor]);

  const totalHeight = HOURS.length * SLOT_HEIGHT_PX;

  // Position an event vertically within the day column.
  const positionFor = (e: NormalizedEvent, day: Date) => {
    const dayStart = new Date(day); dayStart.setHours(HOUR_START, 0, 0, 0);
    const dayEnd = new Date(day); dayEnd.setHours(HOUR_END, 59, 59, 999);
    const s = ms(e.start) < ms(dayStart) ? dayStart : e.start;
    const en = ms(e.end) > ms(dayEnd) ? dayEnd : e.end;
    const top = ((ms(s) - ms(dayStart)) / 3600000) * SLOT_HEIGHT_PX;
    const height = Math.max(28, ((ms(en) - ms(s)) / 3600000) * SLOT_HEIGHT_PX);
    return { top, height };
  };

  const handleSlotClick = (day: Date, hour: number) => {
    if (!onCreateAt) return;
    const s = new Date(day); s.setHours(hour, 0, 0, 0);
    const e = new Date(s.getTime() + 60 * 60 * 1000);
    onCreateAt(toLocalInput(s), toLocalInput(e));
  };

  return (
    <div className="overflow-x-auto">
      <div className="grid" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(140px, 1fr))` }}>
        {/* Day header row */}
        <div className="border-b border-slate-100" style={{ height: HEADER_HEIGHT_PX }} />
        {days.map((d) => {
          const today = isSameDay(d, new Date());
          return (
            <div
              key={d.toISOString()}
              className={`flex items-center justify-center border-b border-l border-slate-100 text-xs font-bold ${today ? 'text-indigo-700' : 'text-slate-500'}`}
              style={{ height: HEADER_HEIGHT_PX }}
            >
              <span className="mr-2 uppercase tracking-wider">{FR_DAY_SHORT[(d.getDay() + 6) % 7]}</span>
              <span className={`flex h-7 w-7 items-center justify-center rounded-full ${today ? 'bg-indigo-600 text-white' : ''}`}>
                {d.getDate()}
              </span>
            </div>
          );
        })}

        {/* Hour gutter */}
        <div className="relative" style={{ height: totalHeight }}>
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute right-2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-slate-400"
              style={{ top: (h - HOUR_START) * SLOT_HEIGHT_PX }}
            >
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="relative border-l border-slate-100"
            style={{ height: totalHeight }}
          >
            {/* Hour grid lines + clickable slots */}
            {HOURS.map((h) => (
              <button
                type="button"
                key={h}
                className="absolute left-0 right-0 border-t border-slate-100 transition hover:bg-indigo-50/40"
                style={{ top: (h - HOUR_START) * SLOT_HEIGHT_PX, height: SLOT_HEIGHT_PX }}
                onClick={() => handleSlotClick(day, h)}
                title="Créer une réservation à cette heure"
              />
            ))}

            {/* Events */}
            {events
              .filter((e) => isSameDay(e.start, day) || (ms(e.start) <= ms(endOfDay(day)) && ms(e.end) >= ms(startOfDay(day))))
              .map((e) => {
                const pos = positionFor(e, day);
                const c = colourFor(e.vehicleId);
                return (
                  <button
                    type="button"
                    key={e.id + day.toISOString()}
                    onClick={(ev) => { ev.stopPropagation(); onSelect?.(e.id); }}
                    className={`absolute left-1 right-1 overflow-hidden rounded-lg border ${c.border} ${c.soft} px-2 py-1 text-left shadow-sm hover:shadow-md`}
                    style={{ top: pos.top, height: pos.height }}
                    title={`${e.ref} · ${e.vehicleLabel} · ${e.customerLabel}`}
                  >
                    <div className="flex items-center gap-1">
                      <span className={`inline-block h-2 w-2 rounded-full ${c.bg}`} />
                      <span className={`truncate text-[11px] font-black ${c.text}`}>{e.customerLabel}</span>
                    </div>
                    <div className="truncate text-[10px] font-semibold text-slate-700">{e.vehicleLabel}</div>
                    {pos.height >= 56 && (
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {e.start.getHours().toString().padStart(2, '0')}:{e.start.getMinutes().toString().padStart(2, '0')}
                        {' – '}
                        {e.end.getHours().toString().padStart(2, '0')}:{e.end.getMinutes().toString().padStart(2, '0')}
                      </div>
                    )}
                  </button>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Month grid ───────────────────────────────────────────────────────────────
const MonthGrid: React.FC<{
  anchor: Date;
  events: NormalizedEvent[];
  onSelect?: (id: string) => void;
  onCreateAt?: (startISO: string, endISO: string) => void;
}> = ({ anchor, events, onSelect, onCreateAt }) => {
  const first = startOfMonth(anchor);
  const last = endOfMonth(anchor);
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 6 * 7 }, (_, i) => addDays(gridStart, i));

  const handleCreate = (day: Date) => {
    if (!onCreateAt) return;
    const s = new Date(day); s.setHours(9, 0, 0, 0);
    const e = new Date(s); e.setHours(18, 0, 0, 0);
    onCreateAt(toLocalInput(s), toLocalInput(e));
  };

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-slate-100 text-xs font-bold uppercase tracking-wider text-slate-500">
        {FR_DAY_SHORT.map((d) => (
          <div key={d} className="border-l border-slate-100 px-3 py-2 first:border-l-0">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7" style={{ gridAutoRows: '110px' }}>
        {days.map((d) => {
          const inMonth = d.getMonth() === anchor.getMonth() && d.getFullYear() === anchor.getFullYear();
          const today = isSameDay(d, new Date());
          const dayEvents = events.filter((e) => isSameDay(e.start, d) || (ms(e.start) <= ms(endOfDay(d)) && ms(e.end) >= ms(startOfDay(d))));
          const visible = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - visible.length;
          return (
            <button
              type="button"
              key={d.toISOString()}
              onClick={() => handleCreate(d)}
              className={`relative flex flex-col gap-1 overflow-hidden border-l border-t border-slate-100 px-2 py-1.5 text-left transition first:border-l-0 hover:bg-indigo-50/30 ${inMonth ? 'bg-white' : 'bg-slate-50/40'}`}
            >
              <div className={`flex items-center gap-1.5 ${inMonth ? '' : 'text-slate-400'}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${today ? 'bg-indigo-600 text-white' : 'text-slate-700'}`}>
                  {d.getDate()}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                {visible.map((e) => {
                  const c = colourFor(e.vehicleId);
                  return (
                    <span
                      key={e.id}
                      className={`inline-flex items-center gap-1 truncate rounded ${c.soft} px-1.5 py-0.5 text-[10px] font-semibold ${c.text}`}
                      onClick={(ev) => { ev.stopPropagation(); onSelect?.(e.id); }}
                    >
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.bg}`} />
                      <span className="truncate">{e.customerLabel}</span>
                    </span>
                  );
                })}
                {overflow > 0 && (
                  <span className="text-[10px] font-bold text-slate-500">+{overflow} de plus</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
