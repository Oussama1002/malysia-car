import React, { useEffect, useState } from 'react';
import { apiClient, getApiBase } from '@/services/apiClient';

interface KpiData {
  totalVehicles: number;
  availableVehicles: number;
  activeRentals: number;
  revenueMonthly: number;
}

const Dashboard: React.FC = () => {
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getApiBase()) {
      setError("API non configurée (VITE_API_BASE manquant).");
      return;
    }

    Promise.all([
      apiClient<{ data: unknown[]; meta: { total: number } }>('/v1/vehicles?per_page=1'),
      apiClient<{ data: unknown[]; meta: { total: number } }>('/v1/vehicles?status=AVAILABLE&per_page=1'),
      apiClient<{ data: unknown[]; meta: { total: number } }>('/v1/vehicles?status=RENTED&per_page=1'),
      apiClient<{ data: { revenueMonthly?: number; monthlyRevenue?: number } }>('/v1/dashboard/executive').catch(() => ({ data: {} })),
    ]).then(([all, avail, rented, dash]) => {
      const revenue = (dash as any)?.data?.revenueMonthly
        ?? (dash as any)?.data?.monthlyRevenue
        ?? (dash as any)?.data?.revenue_monthly
        ?? 0;
      setKpi({
        totalVehicles: all.meta?.total ?? 0,
        availableVehicles: avail.meta?.total ?? 0,
        activeRentals: rented.meta?.total ?? 0,
        revenueMonthly: Number(revenue),
      });
    }).catch(err => setError(err?.message ?? 'Erreur de chargement'));
  }, []);

  if (error) return (
    <div className="p-8 text-center text-rose-400 font-semibold">{error}</div>
  );

  if (!kpi) return (
    <div className="p-8 text-center text-slate-400">Chargement des données...</div>
  );

  const cards = [
    { title: "Total Flotte", value: kpi.totalVehicles, icon: "M4 14v4h3m13-4v4h-3M4 14l1.8-5.2A2 2 0 017.7 7.4h8.6a2 2 0 011.9 1.4L20 14M4 14h16", color: "bg-blue-600" },
    { title: "Flotte Disponible", value: kpi.availableVehicles, icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", color: "bg-emerald-600" },
    { title: "Locations Actives", value: kpi.activeRentals, icon: "M13 10V3L4 14h7v7l9-11h-7z", color: "bg-amber-600" },
    { title: "C.A. du mois (DH)", value: kpi.revenueMonthly > 0 ? kpi.revenueMonthly.toLocaleString('fr-MA') : '—', icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", color: "bg-indigo-600" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800">DriveFlow Maroc</h1>
        <p className="text-slate-500">Tableau de bord de gestion de location de voitures.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-5">
            <div className={`${card.color} w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg`}>
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={card.icon} />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{card.title}</p>
              <p className="text-xl font-black text-slate-900">{card.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
