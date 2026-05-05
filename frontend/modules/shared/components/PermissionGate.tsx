import React from 'react';
import type { AppRole } from '@/domain/appRole';
import { canAccessModule, type ModuleKey } from '@/domain/appRole';

export const PermissionGate: React.FC<{
  role: AppRole;
  module: ModuleKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ role, module, children, fallback }) => {
  if (!canAccessModule(role, module)) return <>{fallback ?? null}</>;
  return <>{children}</>;
};
