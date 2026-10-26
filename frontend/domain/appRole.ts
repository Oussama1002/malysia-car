/** CDC-aligned roles (front permission keys). */
export const APP_ROLES = [
  'ADMIN',
  'ASSISTANT', // power user: tout sauf admin utilisateurs / rôles / paramètres
  'MISSIONNAIRE', // agent terrain : missions uniquement
  'DIRECTEUR',
  'ANALYSTE_CREDIT',
  'AGENT_COMMERCIAL',
  'GESTIONNAIRE_FLOTTE',
  'COMPTABLE',
  'CONTENTIEUX',
  'AGENT_LIVRAISON',
  'CLIENT_PORTAL',
  'AGENT', // legacy rental agent
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type ModuleKey =
  | 'dashboard'
  | 'fleet'
  | 'customers'
  | 'contracts'
  | 'credit'
  | 'finance'
  | 'accounting'
  | 'arrears'
  | 'signatures'
  | 'usedCars'
  | 'gps'
  | 'ai'
  | 'mobileOps'
  | 'notifications'
  | 'settings'
  | 'audit'
  | 'documents'
  | 'rentals'
  | 'subRentals'
  | 'missions';

/** Which modules each role may access (baseline; ADMIN = all). */
export const ROLE_MODULE_ACCESS: Record<AppRole, ModuleKey[]> = {
  ADMIN: [
    'dashboard', 'fleet', 'customers', 'contracts', 'credit', 'finance', 'accounting',
    'arrears', 'signatures', 'usedCars', 'gps', 'ai', 'mobileOps', 'missions', 'notifications',
    'settings', 'audit', 'documents', 'rentals', 'subRentals',
  ],
  DIRECTEUR: [
    'dashboard', 'fleet', 'customers', 'contracts', 'credit', 'finance', 'accounting',
    'arrears', 'signatures', 'usedCars', 'gps', 'ai', 'mobileOps', 'missions', 'notifications',
    'settings', 'audit', 'documents', 'rentals', 'subRentals',
  ],
  // Assistant(e) : accès opérationnel complet SAUF les paramètres système
  // (gestion utilisateurs / rôles). Tous les autres modules sont ouverts.
  ASSISTANT: [
    'dashboard', 'fleet', 'customers', 'contracts', 'credit', 'finance', 'accounting',
    'arrears', 'signatures', 'usedCars', 'gps', 'ai', 'mobileOps', 'notifications',
    'audit', 'documents', 'rentals', 'subRentals',
  ],
  // Missionnaire : agent terrain, missions uniquement — rien d'autre.
  MISSIONNAIRE: ['mobileOps'],
  ANALYSTE_CREDIT: ['dashboard', 'customers', 'credit', 'contracts', 'ai', 'notifications', 'documents'],
  AGENT_COMMERCIAL: ['dashboard', 'customers', 'contracts', 'usedCars', 'rentals', 'signatures', 'notifications', 'documents'],
  GESTIONNAIRE_FLOTTE: ['dashboard', 'fleet', 'gps', 'ai', 'mobileOps', 'missions', 'notifications', 'documents', 'subRentals'],
  COMPTABLE: ['dashboard', 'finance', 'accounting', 'contracts', 'arrears', 'ai', 'signatures', 'notifications', 'documents', 'subRentals'],
  CONTENTIEUX: ['dashboard', 'arrears', 'customers', 'contracts', 'ai', 'signatures', 'notifications', 'documents', 'subRentals'],
  AGENT_LIVRAISON: ['dashboard', 'mobileOps', 'fleet', 'gps', 'notifications', 'documents'],
  CLIENT_PORTAL: ['dashboard', 'contracts', 'signatures', 'mobileOps', 'notifications'],
  AGENT: ['dashboard', 'fleet', 'customers', 'contracts', 'rentals', 'notifications', 'documents'],
};
export function modulesForRole(role: AppRole): ModuleKey[] {
  return ROLE_MODULE_ACCESS[role] ?? [];
}

export function canAccessModule(role: AppRole, module: ModuleKey): boolean {
  if (role === 'ADMIN' || role === 'DIRECTEUR') return true;
  return modulesForRole(role).includes(module);
}
