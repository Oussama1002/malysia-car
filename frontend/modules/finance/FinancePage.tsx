import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getTreasurySummary } from '@/services/financeApi';
import { KpiCard } from '@/modules/shared/components/KpiCard';
import { formatCurrencyMad } from '@/modules/shared/formatters';

export const FinancePage: React.FC = () => {
  const summaryQ = useQuery({
    queryKey: ['treasury', 'summary'],
    queryFn: () => getTreasurySummary(),
  });
  const s = summaryQ.data?.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-slate-900">Finance & trésorerie</h1>
        <p className="text-slate-500">Facturation, encaissements, trésorerie, relevés clients.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard
          title="Solde de trésorerie"
          value={
            s
              ? Object.values(s.balances_by_currency || {})
                  .map((b) => formatCurrencyMad(b.current_balance))
                  .join(' / ') || '—'
              : '…'
          }
          accentClass="bg-indigo-600"
        />
        <KpiCard
          title="Entrées prévues (30j)"
          value={s ? formatCurrencyMad(s.projected_inflows_next_30d) : '…'}
          accentClass="bg-emerald-600"
        />
        <KpiCard
          title="Échéances à recouvrer"
          value={s ? formatCurrencyMad(s.projected_installments_next_30d) : '…'}
          accentClass="bg-amber-600"
        />
        <KpiCard
          title="Retards de paiement"
          value={s ? formatCurrencyMad(s.overdue_total) : '…'}
          accentClass="bg-rose-600"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <FinanceCard
          to="/finance/invoices"
          title="Factures"
          description="Générer, émettre et suivre les factures depuis les contrats ou les ventes."
        />
        <FinanceCard
          to="/finance/payments"
          title="Paiements"
          description="Enregistrer un encaissement et l'allouer aux factures ou échéances."
        />
        <FinanceCard
          to="/finance/treasury"
          title="Trésorerie"
          description="Comptes bancaires, import de relevés, rapprochement."
        />
      </div>
    </div>
  );
};

const FinanceCard: React.FC<{ to: string; title: string; description: string }> = ({ to, title, description }) => (
  <Link to={to} className="df-card hover:shadow-lg transition">
    <div className="df-card__body">
      <div className="text-sm font-black text-slate-900">{title}</div>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <div className="mt-3 text-xs font-bold uppercase tracking-wide text-indigo-600">Ouvrir →</div>
    </div>
  </Link>
);
