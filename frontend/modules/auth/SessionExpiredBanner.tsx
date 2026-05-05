import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthSession } from '@/modules/auth/AuthContext';

export const SessionExpiredBanner: React.FC = () => {
  const { expired, clearExpired } = useAuthSession();
  const navigate = useNavigate();
  if (!expired) return null;
  return (
    <div className="fixed inset-x-0 top-4 z-[100] px-4">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm font-semibold text-amber-950 shadow-lg backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-950 text-white">!</div>
          <div>
            <div className="font-black">Session expirée</div>
            <div className="text-xs text-amber-900/70">Veuillez vous reconnecter pour continuer.</div>
          </div>
        </div>
      <button
        type="button"
        className="df-btn df-btn--ghost border-amber-300/60 text-amber-950"
        onClick={() => {
          clearExpired();
          navigate('/login', { replace: true });
        }}
      >
        OK
      </button>
      </div>
    </div>
  );
};
