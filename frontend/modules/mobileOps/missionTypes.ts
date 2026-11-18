/**
 * Mission type labels — shared by every web mission surface (AdminOpsView /
 * MissionsPage, AgentMobileView) so the wording never diverges between them.
 *
 * The backend `mission_type` stays an English code (API contract); these are
 * the self-explanatory French labels shown to users. Some types read
 * differently depending on where the mission came from — a sub-rental pickup
 * collects the car *from the supplier*, and a sub-rental transfer brings it
 * *back to the supplier* — so prefer `missionTypeLabel(mission)` over a raw
 * map lookup wherever the mission object is available.
 */
export const MISSION_TYPE_LABEL: Record<string, string> = {
  delivery: 'Livraison au client',
  pickup: 'Récupération véhicule',
  transfer: 'Transfert véhicule',
  convoy: 'Convoyage',
  check_in: 'État des lieux (entrée)',
  check_out: 'État des lieux (sortie)',
  inspection: 'Inspection véhicule',
  cleaning: 'Nettoyage véhicule',
  workshop: 'Atelier / réparation',
  fuel: 'Carburant / plein',
  assistance: 'Assistance / dépannage',
  other: 'Autre',
};

function labelizeType(raw?: string | null): string {
  if (!raw) return '—';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Context-aware label: a sub-rental mission's pickup/transfer describe the
 * supplier leg, not a customer leg, so they read differently.
 */
export function missionTypeLabel(
  mission: { mission_type: string; auto_source_type?: string | null },
): string {
  if (mission.auto_source_type === 'sub_rental') {
    if (mission.mission_type === 'pickup') return 'Récupération chez le fournisseur';
    if (mission.mission_type === 'transfer') return 'Retour fournisseur';
  }
  return MISSION_TYPE_LABEL[mission.mission_type] ?? labelizeType(mission.mission_type);
}
