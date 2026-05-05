import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getTrialBalance, getIncomeStatement } from '@/services/accountingApi';
import { KpiCard } from '@/modules/shared/components/KpiCard';
import { formatCurrencyMad } from '@/modules/shared/formatters';

export const AccountingPage: React.FC = () => {
  const tbQ = useQuery({ queryKey: ['accounting', 'trial-balance'], queryFn: () => getTrialBalance() });
  const plQ = useQuery({ queryKey: ['accounting', 'income-statement'], queryFn: () => getIncomeStatement() });
  const tb = tbQ.data?.data;
  const pl = plQ.data?.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-slate-900">Comptabilité générale</h1>
        <p className="text-slate-500">Plan comptable · Journaux · Écritures · Immobilisations · États financiers.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          title="Total débit (période)"
          value={tb ? formatCurrencyMad(tb.totals.total_debit) : '…'}
          accentClass="bg-indigo-600"
        />
        <KpiCard
          title="Total crédit (période)"
          value={tb ? formatCurrencyMad(tb.totals.total_credit) : '…'}
          accentClass="bg-indigo-600"
        />
        <KpiCard
          title="Résultat net"
          value={pl ? formatCurrencyMad(pl.net_income) : '…'}
          accentClass={pl && pl.net_income >= 0 ? 'bg-emerald-600' : 'bg-rose-600'}
        />
        <KpiCard
          title="Balance équilibrée"
          value={tb ? (tb.totals.is_balanced ? 'Oui ✓' : 'Non ✗') : '…'}
          accentClass={tb?.totals.is_balanced ? 'bg-emerald-600' : 'bg-rose-600'}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <AccountingCard to="/accounting/chart" title="Plan comptable" description="Comptes, classes, sous-comptes — MAROC PCG." />
        <AccountingCard to="/accounting/journals" title="Journaux & Écritures" description="Journaux de ventes, banque, caisse, OD — saisie et comptabilisation." />
        <AccountingCard to="/accounting/entries" title="Toutes les écritures" description="Grand livre des écritures brouillon et comptabilisées." />
        <AccountingCard to="/accounting/reports/trial-balance" title="Balance générale" description="Totaux débits/crédits par compte sur la période." />
        <AccountingCard to="/accounting/reports/balance-sheet" title="Bilan (Actif/Passif)" description="Situation patrimoniale à une date donnée." />
        <AccountingCard to="/accounting/reports/income-statement" title="Compte de résultat" description="Produits vs charges — résultat de l'exercice." />
        <AccountingCard to="/accounting/reports/tax-report" title="État TVA" description="TVA collectée et retenues à la source par période." />
        <AccountingCard to="/accounting/fixed-assets" title="Immobilisations" description="Actifs, dotations aux amortissements, cessions." />
        <AccountingCard to="/accounting/settings" title="Paramètres fiscaux" description="Taxes, exercices fiscaux, périodes." />
      </div>
    </div>
  );
};

const AccountingCard: React.FC<{ to: string; title: string; description: string }> = ({ to, title, description }) => (
  <Link to={to} className="df-card hover:shadow-lg transition">
    <div className="df-card__body">
      <div className="text-sm font-black text-slate-900">{title}</div>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <div className="mt-3 text-xs font-bold uppercase tracking-wide text-indigo-600">Ouvrir →</div>
    </div>
  </Link>
);
