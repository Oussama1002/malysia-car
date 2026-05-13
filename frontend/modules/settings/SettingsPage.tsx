import React from 'react';
import { DataTable } from '@/modules/shared/components/DataTable';
import { useQuery } from '@tanstack/react-query';
import { listBranches } from '@/services/adminApi';
import { getApiBase } from '@/services/apiClient';
import { Link } from 'react-router-dom';
import { useAuthSession } from '@/modules/auth/AuthContext';

export const SettingsPage: React.FC = () => {
  const apiReady = !!getApiBase();
  const { session } = useAuthSession();
  const canViewBranches = ['ADMIN', 'DIRECTEUR'].includes(session?.user.role ?? '');
  const branches = useQuery({
    queryKey: ['admin', 'branches'],
    queryFn: () => listBranches(),
    enabled: apiReady && canViewBranches,
    retry: false,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-slate-900">Parametres</h1>
        <p className="text-slate-500">Configuration generale de l'application.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <AdminCard
          title="Utilisateurs"
          subtitle="Comptes staff, roles, affectations"
          href="/settings/users"
        />
        <AdminCard
          title="Roles et permissions"
          subtitle="Matrice de droits par module"
          href="/settings/roles"
        />
        <AdminCard
          title="Vehicules"
          subtitle="Marques et modeles du parc"
          href="/settings/vehicules"
        />
        <AdminCard
          title="Agences"
          subtitle="Points de vente et structure"
          href="/settings/branches"
        />
      </div>

      {canViewBranches && (
        <div className="space-y-3">
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">Agences</h2>
          <DataTable
            loading={branches.isLoading}
            columns={[
              { key: 'n', header: 'Agence', render: (r) => r.name },
              { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.code}</span> },
              { key: 'city', header: 'Ville', render: (r) => r.city ?? '—' },
              { key: 'c', header: 'Pays', render: (r) => r.country_code ?? '—' },
            ]}
            rows={branches.data?.data ?? []}
            rowKey={(r) => r.id}
            emptyTitle="Aucune agence"
          />
        </div>
      )}
    </div>
  );
};

const AdminCard: React.FC<{ title: string; subtitle: string; href: string; active?: boolean }> = ({ title, subtitle, href, active }) => (
  <div className={`rounded-2xl border bg-white p-6 shadow-sm ${active ? 'border-indigo-200 ring-2 ring-indigo-500/10' : 'border-slate-100'}`}>
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-black text-slate-900">{title}</div>
        <div className="text-sm text-slate-600">{subtitle}</div>
      </div>
      <Link className={`rounded-xl px-4 py-2 text-sm font-black text-white ${active ? 'bg-indigo-600' : 'bg-slate-700 hover:bg-slate-800'}`} to={href}>
        Ouvrir
      </Link>
    </div>
  </div>
);
