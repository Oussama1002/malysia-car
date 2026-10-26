import React from 'react';
import { AdminOpsView } from '@/modules/mobileOps/views/AdminOpsView';

/**
 * Console Missions (desktop) — opérations terrain : liste filtrable,
 * détail (check-list, photos, inspections, litiges, signature), création,
 * assignation d'un agent, annulation et preuve de mission.
 *
 * Réutilise AdminOpsView, déjà développé pour le hub mobile, comme page à
 * part entière de la barre latérale Opérations. Accès : ADMIN / DIRECTEUR /
 * Gestionnaire de flotte (aligné sur le gate backend des routes
 * /v1/mobile-ops/admin/missions).
 */
export const MissionsPage: React.FC = () => {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-5">
        <div className="text-xs font-black uppercase tracking-wider text-slate-400">Opérations</div>
        <h1 className="mt-1 text-2xl font-black text-slate-900">Missions</h1>
        <p className="text-sm text-slate-500">
          Opérations terrain — livraisons, récupérations et inspections : suivi en temps réel,
          assignation des agents et preuves de mission.
        </p>
      </div>
      <AdminOpsView />
    </div>
  );
};

export default MissionsPage;
