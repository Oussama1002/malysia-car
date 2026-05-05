import React, { useEffect, useState } from 'react';
import { api } from '../services/mockApi';
import { DashboardStats } from '../types';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    api.getStats().then(setStats);
  }, []);

  if (!stats) return <div className="p-8 text-center text-slate-400">Chargement des données...</div>;

  const cards = [
    { title: "Réservations / Jour", value: stats.dailyReservations, icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", color: "bg-blue-600" },
    { title: "Flotte Disponible", value: stats.availableVehicles, icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", color: "bg-emerald-600" },
    { title: "Locations Actives", value: stats.ongoingRentals, icon: "M13 10V3L4 14h7v7l9-11h-7z", color: "bg-amber-600" },
    { title: "Chiffre d'Affaires", value: `${stats.revenueMonthly.toLocaleString('fr-MA')} DH`, icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", color: "bg-indigo-600" },
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
