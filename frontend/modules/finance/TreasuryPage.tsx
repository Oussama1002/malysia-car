import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBankAccount,
  getTreasurySummary,
  listBankAccounts,
  listBankTransactions,
  type BankAccount,
} from '@/services/financeApi';
import { ApiError } from '@/services/apiError';
import { DataTable } from '@/modules/shared/components/DataTable';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { KpiCard } from '@/modules/shared/components/KpiCard';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';

export const TreasuryPage: React.FC = () => {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summaryQ = useQuery({ queryKey: ['treasury', 'summary'], queryFn: () => getTreasurySummary() });
  const accountsQ = useQuery({ queryKey: ['treasury', 'accounts'], queryFn: () => listBankAccounts() });

  const createMut = useMutation({
    mutationFn: (p: Partial<BankAccount>) => createBankAccount(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treasury'] });
      setCreateOpen(false);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const s = summaryQ.data?.data;
  const accounts = accountsQ.data?.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Trésorerie</h1>
          <p className="text-slate-500">Comptes bancaires, rapprochement, projection de cashflow.</p>
        </div>
        <button
          type="button"
          className="df-btn df-btn--primary"
          onClick={() => {
            setError(null);
            setCreateOpen(true);
          }}
        >
          + Nouveau compte
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="Total actuel" value={s ? formatCurrencyMad(Object.values(s.balances_by_currency || {}).reduce((a, b) => a + b.current_balance, 0)) : '…'} accentClass="bg-indigo-600" />
        <KpiCard title="Entrées (30j)" value={s ? formatCurrencyMad(s.projected_inflows_next_30d) : '…'} accentClass="bg-emerald-600" />
        <KpiCard title="Échéances (30j)" value={s ? formatCurrencyMad(s.projected_installments_next_30d) : '…'} accentClass="bg-amber-600" />
        <KpiCard title="Retards" value={s ? formatCurrencyMad(s.overdue_total) : '…'} accentClass="bg-rose-600" />
      </div>

      <DataTable<BankAccount>
        loading={accountsQ.isLoading}
        rows={accounts}
        rowKey={(r) => r.id}
        emptyTitle="Aucun compte bancaire"
        emptyDescription="Ajoutez votre premier compte bancaire pour suivre la trésorerie."
        columns={[
          {
            key: 'bank',
            header: 'Banque',
            render: (a) => (
              <div>
                <div className="font-bold text-slate-900">{a.bank_name}</div>
                <div className="text-xs text-slate-500">{a.account_name}</div>
              </div>
            ),
          },
          { key: 'iban', header: 'IBAN', render: (a) => <span className="font-mono text-xs">{a.iban ?? a.account_number ?? '—'}</span> },
          { key: 'ccy', header: 'Devise', render: (a) => a.currency_code },
          { key: 'balance', header: 'Solde', render: (a) => formatCurrencyMad(Number(a.current_balance)) },
          {
            key: 'flags',
            header: '',
            render: (a) => (
              <div className="flex gap-1">
                {a.is_primary && <StatusBadge label="Principal" tone="info" />}
                {a.is_active ? <StatusBadge label="Actif" tone="success" /> : <StatusBadge label="Inactif" tone="default" />}
              </div>
            ),
          },
          {
            key: 'actions',
            header: '',
            render: (a) => (
              <button
                className="df-btn df-btn--ghost text-xs"
                onClick={() => setSelectedAccount(a)}
              >
                Transactions →
              </button>
            ),
          },
        ]}
      />

      <DrawerPanel open={createOpen} title="Nouveau compte bancaire" onClose={() => setCreateOpen(false)}>
        <BankAccountForm
          submitting={createMut.isPending}
          error={error}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(p) => {
            setError(null);
            createMut.mutate(p);
          }}
        />
      </DrawerPanel>

      <DrawerPanel
        open={!!selectedAccount}
        title={selectedAccount ? `Transactions · ${selectedAccount.bank_name}` : ''}
        widthClass="max-w-3xl"
        onClose={() => setSelectedAccount(null)}
      >
        {selectedAccount && <BankTransactionsPanel account={selectedAccount} />}
      </DrawerPanel>
    </div>
  );
};

const BankAccountForm: React.FC<{
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (p: Partial<BankAccount>) => void;
}> = ({ submitting, error, onCancel, onSubmit }) => {
  const [form, setForm] = useState<Partial<BankAccount>>({
    account_name: '',
    bank_name: '',
    currency_code: 'MAD',
    is_active: true,
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Banque</label>
        <input
          className="df-input mt-1"
          value={form.bank_name ?? ''}
          onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
          required
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Libellé du compte</label>
        <input
          className="df-input mt-1"
          value={form.account_name ?? ''}
          onChange={(e) => setForm({ ...form, account_name: e.target.value })}
          required
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">N° de compte</label>
          <input
            className="df-input mt-1"
            value={form.account_number ?? ''}
            onChange={(e) => setForm({ ...form, account_number: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">IBAN</label>
          <input
            className="df-input mt-1"
            value={form.iban ?? ''}
            onChange={(e) => setForm({ ...form, iban: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Code SWIFT</label>
          <input
            className="df-input mt-1"
            value={form.swift_code ?? ''}
            onChange={(e) => setForm({ ...form, swift_code: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Devise</label>
          <input
            className="df-input mt-1"
            value={form.currency_code ?? 'MAD'}
            onChange={(e) => setForm({ ...form, currency_code: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Solde d'ouverture</label>
          <input
            type="number"
            step="0.01"
            className="df-input mt-1"
            value={form.opening_balance ?? ''}
            onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Solde actuel</label>
          <input
            type="number"
            step="0.01"
            className="df-input mt-1"
            value={form.current_balance ?? ''}
            onChange={(e) => setForm({ ...form, current_balance: Number(e.target.value) })}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!form.is_primary}
          onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
        />
        Compte principal
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>
          Créer
        </button>
      </div>
    </form>
  );
};

const BankTransactionsPanel: React.FC<{ account: BankAccount }> = ({ account }) => {
  const txQ = useQuery({
    queryKey: ['treasury', 'transactions', account.id],
    queryFn: () => listBankTransactions(account.id, { per_page: 50 }),
  });
  const rows = txQ.data?.data ?? [];

  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-600">
        Solde actuel: <b>{formatCurrencyMad(Number(account.current_balance))}</b>
      </div>
      {txQ.isLoading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : !rows.length ? (
        <EmptyState title="Aucune transaction importée" description="Importez un relevé pour démarrer le rapprochement." />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
              <th className="py-2 text-left">Date</th>
              <th className="text-left">Libellé</th>
              <th className="text-right">Montant</th>
              <th className="text-left">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="py-2">{formatDate(t.value_date)}</td>
                <td>
                  <div className="font-semibold text-slate-800">{t.description ?? '—'}</div>
                  <div className="text-xs text-slate-500">{t.counterparty_name ?? ''}</div>
                </td>
                <td className="text-right font-semibold">
                  <span className={t.transaction_type === 'credit' ? 'text-emerald-700' : 'text-rose-700'}>
                    {t.transaction_type === 'credit' ? '+' : '-'}
                    {formatCurrencyMad(Number(t.amount))}
                  </span>
                </td>
                <td>
                  <StatusBadge
                    label={t.reconciliation_status}
                    tone={t.reconciliation_status === 'matched' ? 'success' : t.reconciliation_status === 'ignored' ? 'default' : 'warning'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
