import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listBranches, getUser, type Branch } from '@/services/adminApi';
import { useAuthSession } from '@/modules/auth/AuthContext';
import { getApiBase } from '@/services/apiClient';

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-center py-3 border-b border-slate-100 last:border-0">
      <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <span className="text-sm font-bold text-slate-800">{value}</span>
    </div>
  );
}

function BranchCard({ branch, isPrimary }: { branch: Branch; isPrimary: boolean }) {
  return (
    <div className={`rounded-[2rem] border p-6 space-y-4 ${isPrimary ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-100 bg-white'} shadow-sm`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-lg ${isPrimary ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25' : 'bg-slate-100 text-slate-600'}`}>
            {branch.code.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900">{branch.name}</h3>
            <p className="text-[11px] font-mono text-slate-400 uppercase tracking-widest">{branch.code}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {isPrimary && (
            <span className="rounded-full bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1">
              Principale
            </span>
          )}
          <span className={`rounded-full text-[10px] font-black uppercase tracking-widest px-3 py-1 ${branch.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
            {branch.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 px-4 divide-y divide-slate-100">
        <InfoRow label="Ville" value={branch.city} />
        <InfoRow label="Pays" value={branch.country_code} />
        <InfoRow label="Téléphone" value={branch.phone} />
        <InfoRow label="Email" value={branch.email} />
        {branch.users_count !== undefined && (
          <div className="flex justify-between items-center py-3">
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Collaborateurs</span>
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-indigo-100 text-indigo-700 text-xs font-black">{branch.users_count}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export const AgencePage: React.FC = () => {
  const { session } = useAuthSession();
  const userId = String(session?.user.id ?? '');
  const apiReady = !!getApiBase();

  const { data: branchesRes, isLoading: loadingBranches } = useQuery({
    queryKey: ['agence', 'branches'],
    queryFn: () => listBranches(),
    enabled: apiReady,
  });

  const { data: userRes } = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => getUser(userId),
    enabled: apiReady && !!userId,
  });

  const allBranches = branchesRes?.data ?? [];
  const userBranchIds = new Set((userRes?.data.branches ?? []).map(b => b.id));
  const primaryBranchId = userRes?.data.branches?.find(b => b.is_primary)?.id;

  // Show user's own branches first; admins/directors see all
  const role = session?.user.role ?? '';
  const isAdmin = ['ADMIN', 'DIRECTEUR'].includes(role);
  const displayBranches = isAdmin
    ? allBranches
    : allBranches.filter(b => userBranchIds.has(b.id));

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-500">Organisation</p>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Agences</h1>
          <p className="text-slate-500">
            {isAdmin ? 'Toutes les agences de l\'entreprise.' : 'Vos agences assignées.'}
          </p>
        </div>
        {isAdmin && (
          <Link to="/settings/branches" className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-indigo-700 transition shadow-xl shadow-indigo-600/20 whitespace-nowrap">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Gérer les agences
          </Link>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Agences</p>
          <p className="text-3xl font-black text-indigo-600 mt-1">{displayBranches.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Actives</p>
          <p className="text-3xl font-black text-emerald-600 mt-1">{displayBranches.filter(b => b.is_active).length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Collaborateurs</p>
          <p className="text-3xl font-black text-slate-700 mt-1">
            {displayBranches.reduce((s, b) => s + (b.users_count ?? 0), 0)}
          </p>
        </div>
      </div>

      {/* Branch cards */}
      {loadingBranches ? (
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2].map(i => (
            <div key={i} className="rounded-[2rem] border border-slate-100 bg-white shadow-sm p-6 animate-pulse space-y-4">
              <div className="flex gap-4 items-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-100" />
                <div className="space-y-2 flex-1">
                  <div className="h-5 bg-slate-100 rounded-lg w-2/3" />
                  <div className="h-3 bg-slate-100 rounded-lg w-1/3" />
                </div>
              </div>
              <div className="h-32 bg-slate-100 rounded-2xl" />
            </div>
          ))}
        </div>
      ) : displayBranches.length === 0 ? (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <p className="text-slate-500 font-medium">Aucune agence assignée.</p>
          {isAdmin && (
            <Link to="/settings/branches" className="mt-4 inline-flex items-center text-indigo-600 font-bold text-sm hover:underline">
              Créer une agence →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {displayBranches.map(branch => (
            <BranchCard
              key={branch.id}
              branch={branch}
              isPrimary={branch.id === primaryBranchId}
            />
          ))}
        </div>
      )}
    </div>
  );
};
