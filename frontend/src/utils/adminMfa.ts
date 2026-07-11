import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { getCurrentUser, isAdminRole } from './profileApi'

type AdminMfaStatus = {
  role: string | null
  isAdmin: boolean
  hasVerifiedTotpFactor: boolean
  verifiedTotpFactorId: string | null
  currentLevel: string | null
  nextLevel: string | null
  needsSetup: boolean
  needsVerification: boolean
  isElevated: boolean
}

export async function getAdminMfaStatus(session?: Session | null): Promise<AdminMfaStatus> {
  const currentUser = await getCurrentUser(session)
  const role = currentUser.user.role ?? null

  if (!isAdminRole(role)) {
    return {
      role,
      isAdmin: false,
      hasVerifiedTotpFactor: false,
      verifiedTotpFactorId: null,
      currentLevel: null,
      nextLevel: null,
      needsSetup: false,
      needsVerification: false,
      isElevated: false,
    }
  }

  const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors()

  if (factorsError) {
    throw factorsError
  }

  const verifiedTotpFactor =
    factorsData?.totp.find((factor) => factor.status === 'verified') ?? null

  if (!verifiedTotpFactor) {
    return {
      role,
      isAdmin: true,
      hasVerifiedTotpFactor: false,
      verifiedTotpFactorId: null,
      currentLevel: null,
      nextLevel: 'aal2',
      needsSetup: true,
      needsVerification: false,
      isElevated: false,
    }
  }

  const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

  if (aalError) {
    throw aalError
  }

  const currentLevel = aalData?.currentLevel ?? null
  const nextLevel = aalData?.nextLevel ?? null
  const isElevated = currentLevel === 'aal2'

  return {
    role,
    isAdmin: true,
    hasVerifiedTotpFactor: true,
    verifiedTotpFactorId: verifiedTotpFactor.id,
    currentLevel,
    nextLevel,
    needsSetup: false,
    needsVerification: !isElevated,
    isElevated,
  }
}

export async function refreshAdminMfaSession() {
  const { data, error } = await supabase.auth.refreshSession()

  if (error) {
    throw error
  }

  return data.session
}

export type { AdminMfaStatus }
