import React from 'react';
import { Navigate } from 'react-router-dom';
import { canAccessModule, type ModuleKey } from '@/domain/appRole';
import { useAuthSession } from '@/modules/auth/AuthContext';
import { isModuleHiddenInDemo } from '@/config/runtimeFlags';

export const ModuleGate: React.FC<{ module: ModuleKey; children: React.ReactNode }> = ({ module, children }) => {
  const { session } = useAuthSession();
  if (!session) return <Navigate to="/login" replace />;
  if (isModuleHiddenInDemo(module)) return <Navigate to="/dashboard" replace />;
  if (!canAccessModule(session.user.role, module)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};
