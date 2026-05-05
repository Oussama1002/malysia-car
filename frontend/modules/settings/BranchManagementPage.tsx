import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBranch, deleteBranch, listBranches, updateBranch, type Branch } from '@/services/adminApi';
import { useAuthSession } from '@/modules/auth/AuthContext';
import { apiClient } from '@/services/apiClient';
import { ApiError } from '@/services/apiError';
import { DataTable } from '@/modules/shared/components/DataTable';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { ConfirmModal } from '@/modules/shared/components/ConfirmModal';

export const BranchManagementPage: React.FC = () => {
  const { session } = useAuthSession();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'branches'],
    queryFn: () => listBranches(),
    retry: false,
  });
  const me = useQuery({
    queryKey: ['auth', 'me', 'permissions'],
    queryFn: () => apiClient<{ data: { permissions?: string[] } }>('/v1/auth/me'),
    retry: false,
  });
  const [mode, setMode] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<Branch | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'branches'] });
  const role = session?.user.role ?? null;
  const permissions = me.data?.data.permissions ?? [];
  const canManageBranches = role === 'ADMIN' || role === 'DIRECTEUR' || permissions.includes('branches.manage');

  const createMut = useMutation({
    mutationFn: createBranch,
    onSuccess: () => {
      invalidate();
      setMode(null);
      setSelected(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur de création'),
  });
  const updateMut = useMutation({
    mutationFn: (vars: { id: string; payload: Partial<Branch> }) => updateBranch(vars.id, vars.payload),
    onSuccess: () => {
      invalidate();
      setMode(null);
      setSelected(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur de mise à jour'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteBranch(id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
    },
    onError: (e) => alert(e instanceof ApiError ? e.message : 'Impossible de supprimer'),
  });

  const rows = q.data?.data ?? [];
  const queryError = q.error instanceof ApiError ? q.error : null;
  const forbidden = queryError?.status === 403;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Agences</h1>
          <p className="text-sm text-slate-500">Créez et gérez les points de vente.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="text-sm font-bold text-indigo-600" to="/settings">
            ← Paramètres
          </Link>
          <button
            type="button"
            className="df-btn df-btn--primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canManageBranches}
            onClick={() => {
              if (!canManageBranches) return;
              setError(null);
              setSelected(null);
              setMode('create');
            }}
          >
            + Nouvelle agence
          </button>
        </div>
      </div>

      {forbidden && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Acces refuse: cette page est reservee aux roles ADMIN/DIRECTEUR avec la permission branches.view.
        </div>
      )}
      {!forbidden && !canManageBranches && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
          Consultation uniquement: vous n'avez pas la permission branches.manage pour creer, modifier ou supprimer une
          agence.
        </div>
      )}

      <DataTable<Branch>
        loading={q.isLoading}
        rows={rows}
        rowKey={(r) => r.id}
        emptyTitle="Aucune agence"
        columns={[
          {
            key: 'code',
            header: 'Code',
            render: (r) => <span className="font-mono text-xs font-bold text-slate-900">{r.code}</span>,
          },
          {
            key: 'name',
            header: 'Nom',
            render: (r) => <span className="font-bold text-slate-900">{r.name}</span>,
          },
          { key: 'city', header: 'Ville', render: (r) => r.city ?? '—' },
          { key: 'phone', header: 'Téléphone', render: (r) => r.phone ?? '—' },
          { key: 'email', header: 'Email', render: (r) => r.email ?? '—' },
          {
            key: 'users',
            header: 'Utilisateurs',
            render: (r) => (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                {r.users_count ?? 0}
              </span>
            ),
          },
          {
            key: 'active',
            header: 'Statut',
            render: (r) =>
              r.is_active ? (
                <StatusBadge label="Actif" tone="success" />
              ) : (
                <StatusBadge label="Désactivé" tone="default" />
              ),
          },
          {
            key: 'actions',
            header: '',
            render: (r) => (
              <div className="flex justify-end gap-1">
                <button
                  className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canManageBranches}
                  onClick={() => {
                    if (!canManageBranches) return;
                    setError(null);
                    setSelected(r);
                    setMode('edit');
                  }}
                >
                  Éditer
                </button>
                <button
                  className="rounded-lg bg-rose-100 px-2 py-1 text-xs font-bold text-rose-800 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canManageBranches}
                  onClick={() => {
                    if (!canManageBranches) return;
                    setDeleteTarget(r);
                  }}
                >
                  Supprimer
                </button>
              </div>
            ),
          },
        ]}
      />

      <DrawerPanel
        open={mode === 'create' || mode === 'edit'}
        title={mode === 'create' ? 'Nouvelle agence' : 'Modifier l’agence'}
        onClose={() => {
          setMode(null);
          setSelected(null);
        }}
        widthClass="max-w-lg"
      >
        <BranchForm
          key={selected?.id ?? 'new'}
          branch={mode === 'edit' ? selected : null}
          error={error}
          submitting={createMut.isPending || updateMut.isPending}
          onCancel={() => {
            setMode(null);
            setSelected(null);
          }}
          onSubmit={(payload) => {
            setError(null);
            if (!canManageBranches) {
              setError("Acces refuse: permission branches.manage requise.");
              return;
            }
            if (mode === 'edit' && selected) {
              updateMut.mutate({ id: selected.id, payload });
            } else {
              createMut.mutate(payload);
            }
          }}
        />
      </DrawerPanel>

      <ConfirmModal
        open={!!deleteTarget}
        title="Supprimer l’agence"
        description={`Confirmez la suppression de "${deleteTarget?.name}". Impossible si l'agence est encore utilisée.`}
        confirmLabel="Supprimer"
        danger
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
};

const BranchForm: React.FC<{
  branch: Branch | null;
  error: string | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: Partial<Branch>) => void;
}> = ({ branch, error, submitting, onCancel, onSubmit }) => {
  const [form, setForm] = useState<Partial<Branch>>({
    code: branch?.code ?? '',
    name: branch?.name ?? '',
    city: branch?.city ?? '',
    country_code: branch?.country_code ?? 'MA',
    phone: branch?.phone ?? '',
    email: branch?.email ?? '',
    is_active: branch?.is_active ?? true,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-4"
    >
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          {error}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Code</label>
          <input
            className="df-input"
            required
            maxLength={10}
            value={form.code ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Nom</label>
          <input
            className="df-input"
            required
            value={form.name ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Ville</label>
          <input
            className="df-input"
            value={form.city ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Code pays (ISO 2)
          </label>
          <input
            className="df-input"
            maxLength={2}
            value={form.country_code ?? 'MA'}
            onChange={(e) => setForm((f) => ({ ...f, country_code: e.target.value.toUpperCase() }))}
          />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Téléphone</label>
          <input
            className="df-input"
            value={form.phone ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Email</label>
          <input
            type="email"
            className="df-input"
            value={form.email ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input
          type="checkbox"
          checked={!!form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
        />
        Agence active
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="df-btn df-btn--ghost">
          Annuler
        </button>
        <button type="submit" disabled={submitting} className="df-btn df-btn--primary disabled:opacity-60">
          {submitting ? 'Enregistrement…' : branch ? 'Mettre à jour' : 'Créer'}
        </button>
      </div>
    </form>
  );
};
