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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Missions</h1>
      </div>
      <AdminOpsView />
    </div>
  );
};

export default MissionsPage;
