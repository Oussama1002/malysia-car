import React, { useState } from 'react';
import { TabsSection } from '@/modules/shared/components/TabsSection';
import { DataTable } from '@/modules/shared/components/DataTable';
import { useQuery } from '@tanstack/react-query';
import { listBranches } from '@/services/adminApi';
import { getApiBase } from '@/services/apiClient';
import { Link } from 'react-router-dom';
import { useAuthSession } from '@/modules/auth/AuthContext';

export const SettingsPage: React.FC = () => {
  const [tab, setTab] = useState('rules');
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
        <h1 className="text-2xl font-black text-slate-900">Paramètres</h1>
        <p className="text-slate-500">Règles métier, pays, devises, templates — UI de configuration.</p>
      </header>

      <TabsSection
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'branches', label: 'Agences' },
        ]}
      />

      {tab === 'branches' && (
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
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <AdminCard
          title="Utilisateurs"
          subtitle="Comptes staff, rôles, affectations"
          href="/settings/users"
        />
        <AdminCard
          title="Rôles & permissions"
          subtitle="Matrice de droits par module"
          href="/settings/roles"
        />
        <AdminCard
          title="Agences"
          subtitle="Points de vente & structure"
          href="/settings/branches"
        />
      </div>
    </div>
  );
};

const AdminCard: React.FC<{ title: string; subtitle: string; href: string }> = ({ title, subtitle, href }) => (
  <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-black text-slate-900">{title}</div>
        <div className="text-sm text-slate-600">{subtitle}</div>
      </div>
      <Link className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white" to={href}>
        Ouvrir
      </Link>
    </div>
  </div>
);
