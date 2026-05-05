import React from 'react';
import { useAuthSession } from '@/modules/auth/AuthContext';
import { type AppRole } from '@/domain/appRole';
import { canPerform, type ErpPermission } from '@/domain/erpPermissions';

/**
 * Hides an action (button, menu) when the user role is not allowed for a backend-aligned permission.
 */
export const ActionPermissionGate: React.FC<{
  permission: ErpPermission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ permission, children, fallback = null }) => {
  const { session } = useAuthSession();
  const role = (session?.user.role ?? 'AGENT_COMMERCIAL') as AppRole;
  if (!canPerform(role, permission)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
};
