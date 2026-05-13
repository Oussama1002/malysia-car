/**
 * Central env-driven flags for UI behaviour (Vite: prefix with `VITE_`).
 */
export type FeatureFlag = 'experimental';

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  if (flag === 'experimental') {
    return import.meta.env.VITE_SHOW_EXPERIMENTAL === 'true';
  }
  return false;
}

/**
 * Executive cockpit KPIs & charts. Default off so clients never see untrusted figures.
 * Set `VITE_ENABLE_REAL_DASHBOARD=true` when backend metrics are validated.
 */
export function isRealDashboardEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_REAL_DASHBOARD !== 'false';
}
