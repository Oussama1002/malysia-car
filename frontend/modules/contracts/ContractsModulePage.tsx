import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ContractsPage } from '@/modules/contracts/ContractsPage';
import { RentalsPage } from '@/modules/rentals/RentalsPage';

/**
 * Réservations module shell.
 *
 * The former standalone "Réservations / Locations" page (/rentals) is now a tab
 * inside the contracts module so the sidebar stays short and everything around
 * client bookings + contracts lives in one place. The module is labelled
 * "Réservations" in the sidebar; this shell exposes two tabs:
 *   - Contrats                 → ContractsPage  (LLD/LOA/crédit/VO list)
 *   - Réservations / Locations → RentalsPage    (rental ops workflow)
 *
 * Active tab is kept in the URL (`?tab=locations`) so it's shareable and the
 * old /rentals route can redirect straight into the Locations tab.
 */
const TABS = [
  { key: 'contrats', label: 'Contrats' },
  { key: 'locations', label: 'Réservations / Locations' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export const ContractsModulePage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const active: TabKey = params.get('tab') === 'contrats' ? 'contrats' : 'locations';

  const setTab = (k: TabKey) => {
    const next = new URLSearchParams(params);
    if (k === 'locations') next.delete('tab');
    else next.set('tab', k);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 -mx-4 bg-white/80 backdrop-blur-md px-4 py-3 border-b border-slate-100 flex justify-center">
        <div className="df-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active === t.key}
              onClick={() => setTab(t.key)}
              className={`df-tab ${active === t.key ? 'df-tab--active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {active === 'contrats' ? <ContractsPage /> : <RentalsPage />}
    </div>
  );
};
