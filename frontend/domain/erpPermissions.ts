import { type AppRole } from '@/domain/appRole';

/**
 * Aligned with `api/config/erp.php` `permission_roles`. Extend in lockstep with backend.
 */
const PERMISSION_ROLES: Record<string, AppRole[]> = {
  view_fleet: [
    'ADMIN',
    'DIRECTEUR',
    'GESTIONNAIRE_FLOTTE',
    'AGENT_COMMERCIAL',
    'AGENT',
    'AGENT_LIVRAISON',
  ],
  view_customers: [
    'ADMIN',
    'DIRECTEUR',
    'AGENT_COMMERCIAL',
    'ANALYSTE_CREDIT',
    'CONTENTIEUX',
    'AGENT',
  ],
  view_contracts: [
    'ADMIN',
    'DIRECTEUR',
    'AGENT_COMMERCIAL',
    'COMPTABLE',
    'CONTENTIEUX',
    'CLIENT_PORTAL',
    'AGENT',
  ],
  view_finance: ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
  view_credit: ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT'],
};

export type ErpPermission = keyof typeof PERMISSION_ROLES;

export function canPerform(role: AppRole, permission: ErpPermission): boolean {
  if (role === 'ADMIN' || role === 'DIRECTEUR') {
    return true;
  }
  return (PERMISSION_ROLES[permission] ?? []).includes(role);
}
