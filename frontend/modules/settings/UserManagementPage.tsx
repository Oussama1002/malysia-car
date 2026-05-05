import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activateUser,
  assignUserBranches,
  createUser,
  deactivateUser,
  deleteUser,
  listBranches,
  listRoles,
  listUsers,
  updateUser,
  userLoginHistory,
  type AdminUser,
  type Branch,
  type UserPayload,
  type LoginHistoryRow,
} from '@/services/adminApi';
import { ApiError } from '@/services/apiError';
import { DataTable } from '@/modules/shared/components/DataTable';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { ConfirmModal } from '@/modules/shared/components/ConfirmModal';
import { EmptyState } from '@/modules/shared/components/EmptyState';

type Mode = 'create' | 'edit' | 'branches' | 'history' | null;

export const UserManagementPage: React.FC = () => {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<{ search: string; role: string; status: string; branch_id: string }>({
    search: '',
    role: '',
    status: '',
    branch_id: '',
  });
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<Mode>(null);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const usersQ = useQuery({
    queryKey: ['admin', 'users', { ...filters, page }],
    queryFn: () =>
      listUsers({
        search: filters.search || undefined,
        role: filters.role || undefined,
        status: (filters.status || undefined) as 'active' | 'inactive' | 'suspended' | undefined,
        branch_id: filters.branch_id || undefined,
        page,
        per_page: 20,
      }),
  });
  const rolesQ = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => listRoles() });
  const branchesQ = useQuery({ queryKey: ['admin', 'branches'], queryFn: () => listBranches() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] });

  const createMut = useMutation({
    mutationFn: (p: UserPayload) => createUser(p),
    onSuccess: () => {
      invalidate();
      setMode(null);
      setSelected(null);
    },
    onError: (err) => setErrorMsg(err instanceof ApiError ? err.message : 'Erreur lors de la création'),
  });

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; payload: Partial<UserPayload> }) => updateUser(vars.id, vars.payload),
    onSuccess: () => {
      invalidate();
      setMode(null);
      setSelected(null);
    },
    onError: (err) => setErrorMsg(err instanceof ApiError ? err.message : 'Erreur lors de la mise à jour'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
    },
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => activateUser(id),
    onSuccess: invalidate,
  });
  const deactivateMut = useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: invalidate,
  });
  const assignBranchesMut = useMutation({
    mutationFn: (vars: { id: string; branchIds: string[]; primary: string | null }) =>
      assignUserBranches(vars.id, vars.branchIds, vars.primary),
    onSuccess: () => {
      invalidate();
      setMode(null);
      setSelected(null);
    },
  });

  const openCreate = () => {
    setSelected(null);
    setErrorMsg(null);
    setMode('create');
  };
  const openEdit = (u: AdminUser) => {
    setSelected(u);
    setErrorMsg(null);
    setMode('edit');
  };
  const openBranches = (u: AdminUser) => {
    setSelected(u);
    setErrorMsg(null);
    setMode('branches');
  };
  const openHistory = (u: AdminUser) => {
    setSelected(u);
    setMode('history');
  };
  const close = () => {
    setMode(null);
    setSelected(null);
    setErrorMsg(null);
  };

  const users = usersQ.data?.data ?? [];
  const meta = usersQ.data?.meta;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Utilisateurs</h1>
          <p className="text-sm text-slate-500">Gérez les comptes staff, rôles et affectations.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="text-sm font-bold text-indigo-600" to="/settings">
            ← Paramètres
          </Link>
          <button type="button" onClick={openCreate} className="df-btn df-btn--primary">
            + Nouvel utilisateur
          </button>
        </div>
      </div>

      <div className="df-card">
        <div className="df-card__body grid gap-3 md:grid-cols-4">
          <input
            placeholder="Rechercher (nom ou email)…"
            className="df-input"
            value={filters.search}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, search: e.target.value }));
            }}
          />
          <select
            className="df-input"
            value={filters.role}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, role: e.target.value }));
            }}
          >
            <option value="">Tous les rôles</option>
            {rolesQ.data?.data.map((r) => (
              <option key={r.id} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            className="df-input"
            value={filters.status}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, status: e.target.value }));
            }}
          >
            <option value="">Tous statuts</option>
            <option value="active">Actif</option>
            <option value="inactive">Inactif</option>
            <option value="suspended">Suspendu</option>
          </select>
          <select
            className="df-input"
            value={filters.branch_id}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, branch_id: e.target.value }));
            }}
          >
            <option value="">Toutes les agences</option>
            {branchesQ.data?.data.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DataTable<AdminUser>
        loading={usersQ.isLoading}
        rows={users}
        rowKey={(r) => r.id}
        emptyTitle="Aucun utilisateur"
        emptyDescription="Modifiez les filtres ou créez un nouvel utilisateur."
        columns={[
          {
            key: 'name',
            header: 'Nom',
            render: (r) => (
              <div>
                <div className="font-bold text-slate-900">
                  {r.first_name || r.last_name ? `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() : r.name}
                </div>
                <div className="text-xs text-slate-500">{r.email}</div>
              </div>
            ),
          },
          {
            key: 'role',
            header: 'Rôles',
            render: (r) => (
              <div className="flex flex-wrap gap-1">
                {(r.roles ?? []).map((ro) => (
                  <StatusBadge key={ro.id} label={ro.name} tone="info" />
                ))}
                {!(r.roles ?? []).length && <StatusBadge label={r.role} tone="default" />}
              </div>
            ),
          },
          {
            key: 'branches',
            header: 'Agences',
            render: (r) => (
              <div className="text-xs text-slate-600">
                {(r.branches ?? []).map((b) => (
                  <span key={b.id} className="mr-1 inline-flex items-center gap-1">
                    {b.is_primary && <span className="text-amber-500">★</span>}
                    {b.name}
                  </span>
                ))}
                {!(r.branches ?? []).length && <span className="text-slate-400">—</span>}
              </div>
            ),
          },
          {
            key: 'status',
            header: 'Statut',
            render: (r) =>
              r.status === 'active' ? (
                <StatusBadge label="Actif" tone="success" />
              ) : r.status === 'suspended' ? (
                <StatusBadge label="Suspendu" tone="danger" />
              ) : (
                <StatusBadge label="Inactif" tone="default" />
              ),
          },
          {
            key: 'last',
            header: 'Dernière connexion',
            render: (r) =>
              r.last_login_at ? (
                <span className="text-xs text-slate-600">{new Date(r.last_login_at).toLocaleString('fr-FR')}</span>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              ),
          },
          {
            key: 'actions',
            header: '',
            render: (r) => (
              <div className="flex flex-wrap justify-end gap-1 text-xs font-bold">
                <button className="rounded-lg bg-slate-100 px-2 py-1 hover:bg-slate-200" onClick={() => openEdit(r)}>
                  Éditer
                </button>
                <button
                  className="rounded-lg bg-slate-100 px-2 py-1 hover:bg-slate-200"
                  onClick={() => openBranches(r)}
                >
                  Agences
                </button>
                <button
                  className="rounded-lg bg-slate-100 px-2 py-1 hover:bg-slate-200"
                  onClick={() => openHistory(r)}
                >
                  Historique
                </button>
                {r.status === 'active' ? (
                  <button
                    className="rounded-lg bg-amber-100 px-2 py-1 text-amber-800 hover:bg-amber-200"
                    onClick={() => deactivateMut.mutate(r.id)}
                  >
                    Désactiver
                  </button>
                ) : (
                  <button
                    className="rounded-lg bg-emerald-100 px-2 py-1 text-emerald-800 hover:bg-emerald-200"
                    onClick={() => activateMut.mutate(r.id)}
                  >
                    Activer
                  </button>
                )}
                <button
                  className="rounded-lg bg-rose-100 px-2 py-1 text-rose-800 hover:bg-rose-200"
                  onClick={() => setDeleteTarget(r)}
                >
                  Supprimer
                </button>
              </div>
            ),
          },
        ]}
      />

      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            className="df-btn df-btn--ghost disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Précédent
          </button>
          <span className="text-xs font-semibold text-slate-600">
            Page {meta.current_page} / {meta.last_page} · {meta.total} total
          </span>
          <button
            className="df-btn df-btn--ghost disabled:opacity-40"
            disabled={page >= meta.last_page}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant →
          </button>
        </div>
      )}

      <DrawerPanel
        open={mode === 'create' || mode === 'edit'}
        title={mode === 'create' ? 'Nouvel utilisateur' : 'Modifier l’utilisateur'}
        onClose={close}
        widthClass="max-w-xl"
      >
        <UserForm
          key={selected?.id ?? 'new'}
          user={mode === 'edit' ? selected : null}
          roles={rolesQ.data?.data ?? []}
          branches={branchesQ.data?.data ?? []}
          errorMsg={errorMsg}
          submitting={createMut.isPending || updateMut.isPending}
          onCancel={close}
          onSubmit={(payload) => {
            setErrorMsg(null);
            if (mode === 'edit' && selected) {
              updateMut.mutate({ id: selected.id, payload });
            } else {
              createMut.mutate(payload);
            }
          }}
        />
      </DrawerPanel>

      <DrawerPanel
        open={mode === 'branches'}
        title={`Agences de ${selected?.email ?? ''}`}
        onClose={close}
        widthClass="max-w-md"
      >
        {selected && (
          <BranchAssignmentForm
            user={selected}
            branches={branchesQ.data?.data ?? []}
            submitting={assignBranchesMut.isPending}
            onCancel={close}
            onSubmit={(branchIds, primary) =>
              assignBranchesMut.mutate({ id: selected.id, branchIds, primary })
            }
          />
        )}
      </DrawerPanel>

      <DrawerPanel
        open={mode === 'history'}
        title={`Historique — ${selected?.email ?? ''}`}
        onClose={close}
        widthClass="max-w-xl"
      >
        {selected && <LoginHistoryList userId={selected.id} />}
      </DrawerPanel>

      <ConfirmModal
        open={!!deleteTarget}
        title="Supprimer l’utilisateur"
        description={`Êtes-vous sûr de vouloir supprimer ${deleteTarget?.email} ? Cette action est définitive.`}
        confirmLabel="Supprimer"
        danger
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// User form (create/edit)
// ---------------------------------------------------------------------------

const UserForm: React.FC<{
  user: AdminUser | null;
  roles: { id: number; code: string; name: string }[];
  branches: Branch[];
  errorMsg: string | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: UserPayload) => void;
}> = ({ user, roles, branches, errorMsg, submitting, onCancel, onSubmit }) => {
  const [form, setForm] = useState({
    first_name: user?.first_name ?? '',
    last_name: user?.last_name ?? '',
    email: user?.email ?? '',
    password: '',
    phone: user?.phone ?? '',
    locale: (user?.locale as 'fr' | 'en' | 'ar') ?? 'fr',
    status: (user?.status as 'active' | 'inactive' | 'suspended') ?? 'active',
    roleIds: (user?.roles ?? []).map((r) => r.id),
    branchIds: (user?.branches ?? []).map((b) => b.id),
    primaryBranchId: (user?.branches ?? []).find((b) => b.is_primary)?.id ?? '',
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: UserPayload = {
      email: form.email,
      first_name: form.first_name,
      last_name: form.last_name,
      phone: form.phone || undefined,
      locale: form.locale,
      status: form.status,
      role_ids: form.roleIds,
      branch_ids: form.branchIds,
      primary_branch_id: form.primaryBranchId || null,
    };
    if (!user || form.password) {
      payload.password = form.password;
    }
    onSubmit(payload);
  };

  const toggleRole = (id: number) =>
    setForm((f) => ({
      ...f,
      roleIds: f.roleIds.includes(id) ? f.roleIds.filter((x) => x !== id) : [...f.roleIds, id],
    }));
  const toggleBranch = (id: string) =>
    setForm((f) => {
      const has = f.branchIds.includes(id);
      const nextBranches = has ? f.branchIds.filter((x) => x !== id) : [...f.branchIds, id];
      return {
        ...f,
        branchIds: nextBranches,
        primaryBranchId: has && f.primaryBranchId === id ? '' : f.primaryBranchId,
      };
    });

  return (
    <form onSubmit={submit} className="space-y-5">
      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          {errorMsg}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Prénom">
          <input
            className="df-input"
            required
            value={form.first_name}
            onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
          />
        </Field>
        <Field label="Nom">
          <input
            className="df-input"
            required
            value={form.last_name}
            onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
          />
        </Field>
      </div>
      <Field label="Email">
        <input
          type="email"
          className="df-input"
          required
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Téléphone">
          <input
            className="df-input"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </Field>
        <Field label={user ? 'Nouveau mot de passe (laisser vide pour conserver)' : 'Mot de passe'}>
          <input
            type="password"
            className="df-input"
            required={!user}
            minLength={user ? 0 : 8}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Langue">
          <select
            className="df-input"
            value={form.locale}
            onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value as 'fr' | 'en' | 'ar' }))}
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </Field>
        <Field label="Statut">
          <select
            className="df-input"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'active' | 'inactive' | 'suspended' }))}
          >
            <option value="active">Actif</option>
            <option value="inactive">Inactif</option>
            <option value="suspended">Suspendu</option>
          </select>
        </Field>
      </div>
      <Field label="Rôles">
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => {
            const on = form.roleIds.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleRole(r.id)}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                  on
                    ? 'border-indigo-500 bg-indigo-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {r.name}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Agences">
        <div className="space-y-1">
          {branches.map((b) => {
            const on = form.branchIds.includes(b.id);
            return (
              <label key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <span className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={on} onChange={() => toggleBranch(b.id)} />
                  <span className="font-semibold text-slate-800">{b.name}</span>
                  <span className="text-xs text-slate-500">· {b.code}</span>
                </span>
                <label className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                  <input
                    type="radio"
                    name="primaryBranchId"
                    disabled={!on}
                    checked={form.primaryBranchId === b.id}
                    onChange={() => setForm((f) => ({ ...f, primaryBranchId: b.id }))}
                  />
                  Principale
                </label>
              </label>
            );
          })}
          {!branches.length && <p className="text-xs text-slate-500">Aucune agence configurée.</p>}
        </div>
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="df-btn df-btn--ghost">
          Annuler
        </button>
        <button type="submit" disabled={submitting} className="df-btn df-btn--primary disabled:opacity-60">
          {submitting ? 'Enregistrement…' : user ? 'Mettre à jour' : 'Créer'}
        </button>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Branch assignment form
// ---------------------------------------------------------------------------

const BranchAssignmentForm: React.FC<{
  user: AdminUser;
  branches: Branch[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (branchIds: string[], primary: string | null) => void;
}> = ({ user, branches, submitting, onCancel, onSubmit }) => {
  const [selected, setSelected] = useState<string[]>((user.branches ?? []).map((b) => b.id));
  const [primary, setPrimary] = useState<string>((user.branches ?? []).find((b) => b.is_primary)?.id ?? '');

  const toggle = (id: string) => {
    setSelected((s) => {
      const has = s.includes(id);
      if (has && primary === id) setPrimary('');
      return has ? s.filter((x) => x !== id) : [...s, id];
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(selected, primary || null);
      }}
      className="space-y-4"
    >
      <p className="text-xs text-slate-500">
        Sélectionnez les agences auxquelles {user.first_name ?? user.name} a accès.
      </p>
      <div className="space-y-1">
        {branches.map((b) => {
          const on = selected.includes(b.id);
          return (
            <label
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={on} onChange={() => toggle(b.id)} />
                <span className="font-semibold text-slate-800">{b.name}</span>
                <span className="text-xs text-slate-500">· {b.code}</span>
              </span>
              <label className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                <input
                  type="radio"
                  name="primary"
                  disabled={!on}
                  checked={primary === b.id}
                  onChange={() => setPrimary(b.id)}
                />
                Principale
              </label>
            </label>
          );
        })}
        {!branches.length && <p className="text-xs text-slate-500">Aucune agence configurée.</p>}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="df-btn df-btn--ghost">
          Annuler
        </button>
        <button type="submit" disabled={submitting} className="df-btn df-btn--primary disabled:opacity-60">
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Login history
// ---------------------------------------------------------------------------

const LoginHistoryList: React.FC<{ userId: string }> = ({ userId }) => {
  const q = useQuery({ queryKey: ['admin', 'user', userId, 'history'], queryFn: () => userLoginHistory(userId) });
  const rows = useMemo<LoginHistoryRow[]>(() => q.data?.data ?? [], [q.data]);
  if (q.isLoading) return <div className="text-sm text-slate-500">Chargement…</div>;
  if (!rows.length) return <EmptyState title="Aucun historique" description="Aucune tentative de connexion enregistrée." />;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.id}
          className={`rounded-xl border px-3 py-2 text-sm ${
            r.success ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800">{new Date(r.attempted_at).toLocaleString('fr-FR')}</span>
            <StatusBadge label={r.success ? 'Succès' : 'Échec'} tone={r.success ? 'success' : 'danger'} />
          </div>
          <div className="mt-1 text-xs text-slate-600">
            IP: {r.ip_address ?? '—'} · Device: {r.device_name ?? '—'}
          </div>
          {!r.success && r.failure_reason && (
            <div className="mt-1 text-xs font-semibold text-rose-700">Motif: {r.failure_reason}</div>
          )}
        </li>
      ))}
    </ul>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">{label}</label>
    {children}
  </div>
);
