import type { ModuleKey } from '@/domain/appRole';

export function isDemoModeEnabled(): boolean {
  const v = (import.meta as ImportMeta & { env?: { VITE_DEMO_MODE?: string } }).env?.VITE_DEMO_MODE;
  return String(v ?? '').toLowerCase() === 'true';
}

export function isMockFallbackAllowed(): boolean {
  const env = (import.meta as ImportMeta & { env?: { VITE_ALLOW_MOCK_FALLBACK?: string } }).env;
  return isDemoModeEnabled() && String(env?.VITE_ALLOW_MOCK_FALLBACK ?? '').toLowerCase() === 'true';
}

export function isExperimentalEnabled(): boolean {
  const v = (import.meta as ImportMeta & { env?: { VITE_SHOW_EXPERIMENTAL?: string } }).env?.VITE_SHOW_EXPERIMENTAL;
  return String(v ?? '').toLowerCase() === 'true';
}

/**
 * Modules hidden when VITE_DEMO_MODE=true — kept out of the sidebar to keep the
 * demo focused on the core rental flow.
 *  - ai         : experimental, still stubbed on the backend
 *  - mobileOps  : field-agent workflow, not relevant to demo audiences
 *  - audit      : internal traceability, noisy for a demo tour
 *  - settings   : admin surface (users/roles/branches)
 */
const DEMO_HIDDEN_MODULES: ReadonlySet<ModuleKey> = new Set<ModuleKey>([
  'ai',
  'mobileOps',
  'audit',
  'settings',
]);

export function isModuleHiddenInDemo(module: ModuleKey): boolean {
  if (!isDemoModeEnabled()) return false;
  return DEMO_HIDDEN_MODULES.has(module);
}

/**
 * Returns true when destructive / admin-only / financial-override actions
 * must be disabled (delete buttons, force-close, manual journal entries override, etc.).
 * Single source of truth so individual screens don't reinvent the gate.
 */
export function isDangerousActionDisabled(): boolean {
  return isDemoModeEnabled();
}
