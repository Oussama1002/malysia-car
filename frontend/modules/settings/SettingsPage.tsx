import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Paramètres landing — direct entry to each admin surface AND to each
 * Configuration section (Réservations, Contrats, Facturation, Paiements,
 * Notifications, Entreprise, GPS) via query-string tabs on the shared
 * ParametersPage.
 */
export const SettingsPage: React.FC = () => (
  <div className="space-y-8">
    <header>
      <h1 className="text-2xl font-black text-slate-900">Paramètres</h1>
      <p className="text-slate-500">Administration de la plateforme, configuration métier, utilisateurs, véhicules et agences.</p>
    </header>

    {/* ── Administration ─────────────────────────────────────────── */}
    <section className="space-y-3">
      <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Administration</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AdminCard
          title="Utilisateurs"
          subtitle="Comptes staff, rôles, affectations"
          href="/settings/users"
          tone="indigo"
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
          tone="indigo"
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
          tone="indigo"
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
          tone="indigo"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 22V12h6v10" />
            </svg>
          }
        />
      </div>
    </section>

    {/* ── Configuration métier ───────────────────────────────────── */}
    <section className="space-y-3">
      <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Configuration métier</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AdminCard
          title="Réservations"
          subtitle="Auto-annulation, rappels, type par défaut, caution"
          href="/settings/parameters?tab=reservations"
        />
        <AdminCard
          title="Contrats"
          subtitle="Km inclus, caution, jour de prélèvement, seuil approbation"
          href="/settings/parameters?tab=contracts"
        />
        <AdminCard
          title="Facturation"
          subtitle="Préfixes, TVA, jours nets, source d'échéance, mentions"
          href="/settings/parameters?tab=invoicing"
        />
        <AdminCard
          title="Paiements"
          subtitle="Devise, grâce chèque, paiements partiels"
          href="/settings/parameters?tab=payments"
        />
        <AdminCard
          title="Notifications"
          subtitle="Fenêtres d'alerte assurance, visite, vignette, contrat"
          href="/settings/parameters?tab=notifications"
        />
        <AdminCard
          title="Entreprise"
          subtitle="Identité légale, ICE, RC, IF, CNSS, langue, fuseau"
          href="/settings/parameters?tab=branding"
        />
        <AdminCard
          title="GPS"
          subtitle="Fournisseur, endpoint API, clé, intervalle, alertes"
          href="/settings/parameters?tab=gps"
        />
      </div>
    </section>
  </div>
);

const TONE_CLASSES: Record<string, { bg: string; text: string; hover: string }> = {
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-600',  hover: 'group-hover:bg-indigo-100' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   hover: 'group-hover:bg-amber-100' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  hover: 'group-hover:bg-violet-100' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', hover: 'group-hover:bg-emerald-100' },
  green:   { bg: 'bg-green-50',   text: 'text-green-700',   hover: 'group-hover:bg-green-100' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    hover: 'group-hover:bg-rose-100' },
  sky:     { bg: 'bg-sky-50',     text: 'text-sky-700',     hover: 'group-hover:bg-sky-100' },
  cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-700',    hover: 'group-hover:bg-cyan-100' },
};

const AdminCard: React.FC<{
  title: string;
  subtitle: string;
  href: string;
  icon?: React.ReactNode;
  emoji?: string;
  tone?: keyof typeof TONE_CLASSES;
}> = ({ title, subtitle, href, icon, emoji, tone = 'indigo' }) => {
  const t = TONE_CLASSES[tone];
  return (
    <Link
      to={href}
      className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
    >
      {(icon || emoji) && (
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${t.bg} ${t.text} ${t.hover}`}>
          {emoji ? <span className="text-xl leading-none">{emoji}</span> : icon}
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
};
