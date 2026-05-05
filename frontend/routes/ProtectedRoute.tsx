import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { AppRole } from '@/domain/appRole';
import { canAccessModule, type ModuleKey } from '@/domain/appRole';
import { useAuthSession } from '@/modules/auth/AuthContext';
import type { FeatureFlag } from '@/config/featureFlags';
import { isFeatureEnabled } from '@/config/featureFlags';

export const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  module?: ModuleKey;
  roles?: AppRole[];
  feature?: FeatureFlag;
}> = ({ children, module, roles, feature }) => {
  const { session, loading } = useAuthSession();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm font-semibold text-slate-500">
        Chargement…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (session.expiresAt < Date.now()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (feature && !isFeatureEnabled(feature)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (module && !canAccessModule(session.user.role, module)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (roles && !roles.includes(session.user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
