import React from 'react';
import { Link } from 'react-router-dom';

export const SettingsPage: React.FC = () => (
  <div className="space-y-6">
    <header>
      <h1 className="text-2xl font-black text-slate-900">Paramètres</h1>
      <p className="text-slate-500">Administration de la plateforme, utilisateurs, véhicules et agences.</p>
    </header>

    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <AdminCard
        title="Utilisateurs"
        subtitle="Comptes staff, rôles, affectations"
        href="/settings/users"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
        }
      />
      <AdminCard
        title="Rôles & permissions"
        subtitle="Matrice de droits par module"
        href="/settings/roles"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        }
      />
      <AdminCard
        title="Véhicules"
        subtitle="Marques & modèles du parc"
        href="/settings/vehicles"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 14v4h3m13-4v4h-3M4 14l1.8-5.2A2 2 0 0 1 7.7 7.4h8.6a2 2 0 0 1 1.9 1.4L20 14M4 14h16M7.5 17.5h.01m9 0h.01" />
          </svg>
        }
      />
      <AdminCard
        title="Agences"
        subtitle="Points de vente & structure"
        href="/settings/branches"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 22V12h6v10" />
          </svg>
        }
      />
    </div>
  </div>
);

const AdminCard: React.FC<{ title: string; subtitle: string; href: string; icon?: React.ReactNode }> = ({ title, subtitle, href, icon }) => (
  <Link
    to={href}
    className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
  >
    {icon && (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors">
        {icon}
      </div>
    )}
    <div className="flex-1 min-w-0">
      <div className="text-[15px] font-black text-slate-900 group-hover:text-indigo-700 transition-colors">{title}</div>
      <div className="text-sm text-slate-500 mt-0.5">{subtitle}</div>
    </div>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-indigo-400 transition-colors mt-1">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
    </svg>
  </Link>
);
