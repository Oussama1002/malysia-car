import React from 'react';
import type { FeatureFlag } from '@/config/featureFlags';
import { isFeatureEnabled } from '@/config/featureFlags';

export const FeatureGate: React.FC<{ flag: FeatureFlag; children: React.ReactNode; fallback?: React.ReactNode }> = ({
  flag,
  children,
  fallback,
}) => {
  if (!isFeatureEnabled(flag)) return <>{fallback ?? null}</>;
  return <>{children}</>;
};
