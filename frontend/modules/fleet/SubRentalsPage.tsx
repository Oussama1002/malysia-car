import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, getApiBase } from '@/services/apiClient';
import { formatCurrencyMad } from '@/modules/shared/formatters';

type SubRow = {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  total_cost: string | null;
  supplier_agency?: { name: string };
};

export const SubRentalsPage: React.FC = () => {
  const qc = useQueryClient();
  const [supplierName, setSupplierName] = useState('');

  const suppliersQ = useQuery({
    queryKey: ['supplier-agencies'],
    queryFn: async () => {
      const r = await apiClient<{ data: { id: string; name: string }[] }>('/v1/supplier-agencies?per_page=200');
      return (r as { data: { id: string; name: string }[] }).data;
    },
    enabled: !!getApiBase(),
  });

  const subsQ = useQuery({
    queryKey: ['sub-rentals'],
    queryFn: async () => {
      const r = await apiClient<{ data: SubRow[] }>('/v1/sub-rentals?per_page=100');
      return (r as { data: SubRow[] }).data;
    },
    enabled: !!getApiBase(),
  });

  const createSupplier = useMutation({
    mutationFn: async () => {
      await apiClient('/v1/supplier-agencies', {
        method: 'POST',
        body: JSON.stringify({ name: supplierName }),
      });
    },
    onSuccess: () => {
      setSupplierName('');
      void qc.invalidateQueries({ queryKey: ['supplier-agencies'] });
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-[color:var(--df-text)]">Sous-location</h1>
        <p className="text-sm text-[color:var(--df-text-muted)]">Fournisseurs externes et contrats de sous-location.</p>
      </header>

      <div className="df-card p-5">
        <h2 className="mb-2 text-sm font-bold">Agence fournisseur</h2>
        <div className="flex flex-wrap gap-2">
          <input className="df-input max-w-md" placeholder="Nom de l'agence" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
          <button type="button" className="df-btn df-btn--primary df-btn--sm" disabled={!supplierName || createSupplier.isPending} onClick={() => createSupplier.mutate()}>
            Ajouter
          </button>
        </div>
        <ul className="mt-3 text-sm text-[color:var(--df-text-muted)]">
          {(suppliersQ.data ?? []).map((s) => (
            <li key={s.id}>{s.name}</li>
          ))}
        </ul>
      </div>

      <div className="df-card p-5">
        <h2 className="mb-3 text-sm font-bold">Contrats sous-location</h2>
        <div className="overflow-x-auto">
          <table className="df-table w-full text-sm">
            <thead>
              <tr>
                <th>Fournisseur</th>
                <th>Début</th>
                <th>Fin</th>
                <th>Coût total</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {(subsQ.data ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{r.supplier_agency?.name ?? '—'}</td>
                  <td>{r.start_date}</td>
                  <td>{r.end_date ?? '—'}</td>
                  <td>{r.total_cost != null ? formatCurrencyMad(Number(r.total_cost)) : '—'}</td>
                  <td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
