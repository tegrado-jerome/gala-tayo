import type { AdminMfaStatus } from '../utils/adminMfa'
import { ADMIN_BASE_PATH, ADMIN_MFA_SETUP_PATH, ADMIN_MFA_VERIFY_PATH } from '../utils/adminRoutes'
import { isPath } from '../utils/routes'

export type AdminGateResolution = {
  redirectTarget: string | null
  accessDenied: boolean
}

export function resolveAdminRouteGateState({
  isLoading,
  status,
  pathname,
}: {
  isLoading: boolean
  status: AdminMfaStatus | null
  pathname: string
}): AdminGateResolution {
  const isSetupPath = isPath(pathname, ADMIN_MFA_SETUP_PATH)
  const isVerifyPath = isPath(pathname, ADMIN_MFA_VERIFY_PATH)

  if (isLoading || !status) {
    return {
      redirectTarget: null,
      accessDenied: false,
    }
  }

  if (!status.isAdmin) {
    return {
      redirectTarget: null,
      accessDenied: true,
    }
  }

  if (status.needsSetup) {
    return {
      redirectTarget: isSetupPath ? null : ADMIN_MFA_SETUP_PATH,
      accessDenied: false,
    }
  }

  if (status.needsVerification) {
    return {
      redirectTarget: isVerifyPath ? null : ADMIN_MFA_VERIFY_PATH,
      accessDenied: false,
    }
  }

  if ((isSetupPath || isVerifyPath) && status.isElevated) {
    return {
      redirectTarget: ADMIN_BASE_PATH,
      accessDenied: false,
    }
  }

  return {
    redirectTarget: null,
    accessDenied: false,
  }
}
