import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRole,
  deleteRole,
  listPermissions,
  listRoles,
  syncRolePermissions,
  updateRole,
  type AdminPermission,
  type AdminRole,
} from '@/services/adminApi';
import { ApiError } from '@/services/apiError';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { ConfirmModal } from '@/modules/shared/components/ConfirmModal';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';

export const RolesPermissionsPage: React.FC = () => {
  const qc = useQueryClient();
  const rolesQ = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => listRoles() });
  const permsQ = useQuery({ queryKey: ['admin', 'permissions'], queryFn: () => listPermissions() });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<'create' | 'edit' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roles = rolesQ.data?.data ?? [];
  const permissions = permsQ.data?.data ?? [];
  const selected = useMemo(() => roles.find((r) => r.id === selectedId) ?? null, [roles, selectedId]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'roles'] });

  const createMut = useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      invalidate();
      setMode(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur de création'),
  });
  const updateMut = useMutation({
    mutationFn: (vars: { id: number; payload: Parameters<typeof updateRole>[1] }) => updateRole(vars.id, vars.payload),
    onSuccess: () => {
      invalidate();
      setMode(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur de mise à jour'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteRole(id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      if (selectedId && !roles.find((r) => r.id === selectedId)) setSelectedId(null);
    },
    onError: (e) => alert(e instanceof ApiError ? e.message : 'Erreur de suppression'),
  });
  const syncMut = useMutation({
    mutationFn: (vars: { id: number; ids: number[] }) => syncRolePermissions(vars.id, vars.ids),
    onSuccess: invalidate,
  });

  // Group permissions by module
  const grouped = useMemo(() => {
    const g: Record<string, AdminPermission[]> = {};
    permissions.forEach((p) => {
      (g[p.module] = g[p.module] ?? []).push(p);
    });
    return g;
  }, [permissions]);

  const [draftPermIds, setDraftPermIds] = useState<number[] | null>(null);
  React.useEffect(() => {
    if (selected) {
      setDraftPermIds((selected.permissions ?? []).map((p) => p.id));
    } else {
      setDraftPermIds(null);
    }
  }, [selected]);

  const togglePerm = (id: number) => {
    setDraftPermIds((d) => {
      if (!d) return [id];
      return d.includes(id) ? d.filter((x) => x !== id) : [...d, id];
    });
  };

  const saveMatrix = () => {
    if (!selected || !draftPermIds) return;
    syncMut.mutate({ id: selected.id, ids: draftPermIds });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Rôles & permissions</h1>
          <p className="text-sm text-slate-500">Configurez les rôles et leurs droits fonctionnels.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="text-sm font-bold text-indigo-600" to="/settings">
            ← Paramètres
          </Link>
          <button
            type="button"
            className="df-btn df-btn--primary"
            onClick={() => {
              setError(null);
              setMode('create');
            }}
          >
            + Nouveau rôle
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Roles list */}
        <div className="df-card">
          <div className="df-card__body space-y-2">
            <div className="text-xs font-black uppercase tracking-wider text-slate-500">Rôles</div>
            {rolesQ.isLoading && <div className="text-sm text-slate-500">Chargement…</div>}
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                  selectedId === r.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div>
                  <div className="font-bold text-slate-900">{r.name}</div>
                  <div className="text-xs text-slate-500">{r.code}</div>
                </div>
                <div className="flex items-center gap-1">
                  {r.is_system_role && <StatusBadge label="Système" tone="warning" />}
                  {typeof r.users_count === 'number' && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      {r.users_count}
                    </span>
                  )}
                </div>
              </button>
            ))}
            {!rolesQ.isLoading && !roles.length && (
              <p className="text-sm text-slate-500">Aucun rôle — créez le premier.</p>
            )}
          </div>
        </div>

        {/* Permission matrix for selected role */}
        <div className="df-card">
          <div className="df-card__body space-y-4">
            {!selected ? (
              <div className="py-16 text-center text-sm text-slate-500">
                Sélectionnez un rôle pour modifier ses permissions.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">{selected.name}</h2>
                    <p className="text-xs text-slate-500">
                      {selected.code} · {selected.description ?? 'Sans description'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="df-btn df-btn--ghost"
                      onClick={() => {
                        setError(null);
                        setMode('edit');
                      }}
                    >
                      Éditer
                    </button>
                    {!selected.is_system_role && (
                      <button
                        type="button"
                        className="df-btn df-btn--danger"
                        onClick={() => setDeleteTarget(selected)}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {(Object.entries(grouped) as [string, AdminPermission[]][]).map(([module, perms]) => {
                    const all = perms.every((p) => draftPermIds?.includes(p.id));
                    const some = perms.some((p) => draftPermIds?.includes(p.id));
                    return (
                      <div key={module} className="rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-2">
                          <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                            {module}
                          </span>
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                            <input
                              type="checkbox"
                              checked={all}
                              ref={(el) => {
                                if (el) el.indeterminate = !all && some;
                              }}
                              onChange={(e) => {
                                const ids = perms.map((p) => p.id);
                                setDraftPermIds((d) => {
                                  const set = new Set(d ?? []);
                                  if (e.target.checked) ids.forEach((i) => set.add(i));
                                  else ids.forEach((i) => set.delete(i));
                                  return Array.from(set);
                                });
                              }}
                            />
                            Tout sélectionner
                          </label>
                        </div>
                        <div className="grid gap-2 p-4 md:grid-cols-2">
                          {perms.map((p) => {
                            const on = draftPermIds?.includes(p.id) ?? false;
                            return (
                              <label
                                key={p.id}
                                className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                                  on ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                <input type="checkbox" checked={on} onChange={() => togglePerm(p.id)} />
                                <span>
                                  <span className="font-bold text-slate-800">{p.name}</span>
                                  <span className="block text-xs text-slate-500">{p.code}</span>
                                  {p.description && (
                                    <span className="block text-xs text-slate-400">{p.description}</span>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    className="df-btn df-btn--ghost"
                    onClick={() => setDraftPermIds((selected.permissions ?? []).map((p) => p.id))}
                  >
                    Réinitialiser
                  </button>
                  <button
                    type="button"
                    className="df-btn df-btn--primary disabled:opacity-60"
                    onClick={saveMatrix}
                    disabled={syncMut.isPending}
                  >
                    {syncMut.isPending ? 'Enregistrement…' : 'Enregistrer les permissions'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <DrawerPanel
        open={mode === 'create' || mode === 'edit'}
        title={mode === 'create' ? 'Nouveau rôle' : 'Modifier le rôle'}
        onClose={() => setMode(null)}
        widthClass="max-w-lg"
      >
        <RoleForm
          key={selected?.id ?? 'new'}
          role={mode === 'edit' ? selected : null}
          error={error}
          submitting={createMut.isPending || updateMut.isPending}
          onCancel={() => setMode(null)}
          onSubmit={(payload) => {
            setError(null);
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
        title="Supprimer le rôle"
        description={`Supprimer "${deleteTarget?.name}" ? Tous les utilisateurs affectés perdront ce rôle.`}
        confirmLabel="Supprimer"
        danger
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
};

const RoleForm: React.FC<{
  role: AdminRole | null;
  error: string | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: { code: string; name: string; description?: string | null }) => void;
}> = ({ role, error, submitting, onCancel, onSubmit }) => {
  const [form, setForm] = useState({
    code: role?.code ?? '',
    name: role?.name ?? '',
    description: role?.description ?? '',
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ code: form.code, name: form.name, description: form.description || null });
      }}
      className="space-y-4"
    >
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          {error}
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Code</label>
        <input
          className="df-input"
          required
          value={form.code}
          disabled={!!role?.is_system_role}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
          placeholder="ex: AGENT_COMMERCIAL"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Nom</label>
        <input
          className="df-input"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Description</label>
        <textarea
          className="df-input min-h-[100px]"
          value={form.description ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="df-btn df-btn--ghost">
          Annuler
        </button>
        <button type="submit" disabled={submitting} className="df-btn df-btn--primary disabled:opacity-60">
          {submitting ? 'Enregistrement…' : role ? 'Mettre à jour' : 'Créer'}
        </button>
      </div>
    </form>
  );
};
