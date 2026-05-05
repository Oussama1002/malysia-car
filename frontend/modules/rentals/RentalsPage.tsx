import React from 'react';
import { ReservationsOpsPage } from '@/modules/rentals/ReservationsOpsPage';
import { getApiBase } from '@/services/apiClient';

export const RentalsPage: React.FC = () => {
  const hasBackend = !!getApiBase();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-black text-slate-900">Rental Operations</h1>
        <p className="text-slate-500">Production workflow: availability, handover, return, damage, extension, billing.</p>
      </header>
      {hasBackend ? <ReservationsOpsPage /> : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Backend non configuré. Renseignez <span className="font-mono">VITE_API_BASE</span> pour activer la page
          rentals.
        </div>
      )}
    </div>
  );
};
