import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { complianceApi, type ComplianceAlertDto } from '@/services/complianceApi';
import { getApiBase } from '@/services/apiClient';
import { formatDate } from '@/modules/shared/formatters';

const EXPIRED_TYPES = new Set(['insurance_expired', 'technical_expired']);
const EXPIRING_TYPES = new Set(['insurance_expiring_soon', 'technical_expiring_soon']);
const MISSING_TYPES = new Set(['insurance_missing', 'technical_missing']);

function bucketFor(a: ComplianceAlertDto): 'expired' | 'expiringSoon' | 'missing' | 'other' {
  if (EXPIRED_TYPES.has(a.type)) return 'expired';
  if (EXPIRING_TYPES.has(a.type)) return 'expiringSoon';
  if (MISSING_TYPES.has(a.type)) return 'missing';
  return 'other';
}

export const FleetComplianceDashboardPage: React.FC = () => {
  const apiReady = !!getApiBase();
  const alertsQ = useQuery({
    queryKey: ['fleet', 'compliance', 'alerts'],
    queryFn: () => complianceApi.alerts(),
    enabled: apiReady,
    refetchInterval: 120000,
  });

  const data = alertsQ.data?.data;
  const alerts = data?.alerts ?? [];

  const buckets = useMemo(() => {
    const expired: ComplianceAlertDto[] = [];
    const expiringSoon: ComplianceAlertDto[] = [];
    const missing: ComplianceAlertDto[] = [];
    for (const a of alerts) {
      const b = bucketFor(a);
      if (b === 'expired') expired.push(a);
      else if (b === 'expiringSoon') expiringSoon.push(a);
      else if (b === 'missing') missing.push(a);
    }
    return { expired, expiringSoon, missing };
  }, [alerts]);

  if (!apiReady) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
        API non configuree. Renseignez <span className="font-mono">VITE_API_BASE</span>.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black text-[color:var(--df-text)]">Conformite vehicules</h1>
        <p className="text-sm text-[color:var(--df-text-muted)]">
          Assurance, visite technique et documents — alertes generees automatiquement.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Expires" value={String(data?.summary?.expired ?? buckets.expired.length)} tone="text-red-600" />
        <KpiCard label="Bientot expires" value={String(data?.summary?.expiringSoon ?? buckets.expiringSoon.length)} tone="text-amber-600" />
        <KpiCard label="Pieces manquantes" value={String(data?.summary?.missingDocuments ?? buckets.missing.length)} tone="text-orange-600" />
        <KpiCard label="Alertes ouvertes" value={String(alerts.length)} tone="text-slate-900" />
      </div>

      <AlertSection title="Expires (assurance ou visite technique)" tone="border-red-200 bg-red-50/80" alerts={buckets.expired} loading={alertsQ.isLoading} />
      <AlertSection title="Expire sous 30 jours" tone="border-amber-200 bg-amber-50/80" alerts={buckets.expiringSoon} loading={alertsQ.isLoading} />
      <AlertSection title="Police ou visite technique manquante" tone="border-orange-200 bg-orange-50/60" alerts={buckets.missing} loading={alertsQ.isLoading} />
    </div>
  );
};

function KpiCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="df-card df-card--elev p-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-[color:var(--df-text-muted)]">{label}</div>
      <div className={`mt-1 text-xl font-black ${tone}`}>{value}</div>
    </div>
  );
}

function AlertSection({
  title,
  tone,
  alerts,
  loading,
}: {
  title: string;
  tone: string;
  alerts: ComplianceAlertDto[];
  loading: boolean;
}) {
  return (
    <section className={`df-card df-card--elev overflow-hidden border-2 ${tone}`}>
      <div className="border-b border-[color:var(--df-border)] px-5 py-3">
        <h2 className="text-sm font-black uppercase tracking-widest text-[color:var(--df-text-muted)]">{title}</h2>
      </div>
      <div className="p-5">
        {loading && <p className="text-sm text-[color:var(--df-text-muted)]">Chargement…</p>}
        {!loading && alerts.length === 0 && <p className="text-sm text-[color:var(--df-text-muted)]">Aucune alerte dans cette categorie.</p>}
        <div className="space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className="rounded-xl border border-[color:var(--df-border)] bg-white px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[color:var(--df-text)]">{a.title}</div>
                  <div className="text-xs text-[color:var(--df-text-muted)]">{a.description ?? '—'}</div>
                  <div className="mt-1 text-[11px] text-[color:var(--df-text-muted)]">
                    {a.dueDate && <>Echeance: {formatDate(a.dueDate)} · </>}
                    {a.triggeredAt && <>Declenche: {formatDate(a.triggeredAt)}</>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      a.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {a.severity}
                  </span>
                  {a.vehicle?.id && (
                    <Link className="text-xs font-semibold text-[color:var(--df-brand-600)]" to={`/fleet/${a.vehicle.id}`}>
                      Fiche vehicule
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
