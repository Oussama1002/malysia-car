import { useAuthSession } from '@/modules/auth/AuthContext';
import { type AppRole } from '@/domain/appRole';
import { canPerform, type ErpPermission } from '@/domain/erpPermissions';

export function useErpPermission(): (permission: ErpPermission) => boolean {
  const { session } = useAuthSession();
  const role = (session?.user.role ?? 'AGENT_COMMERCIAL') as AppRole;

  return (permission) => canPerform(role, permission);
}
