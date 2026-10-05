import { useEffect, useState, type ReactNode } from 'react'
import { ShieldWarning as ShieldAlert } from '@phosphor-icons/react/dist/csr/ShieldWarning'
import { Button, Panel } from '../components/ui'
import { signOut } from '../services/authApi'
import { ADMIN_BASE_PATH } from '../utils/adminRoutes'
import type { AdminMfaStatus } from '../utils/adminMfa'
import { navigateToPath } from '../utils/navigation'
import { resolveAdminRouteGateState } from './adminRouteGateState'

function AdminAccessDenied({ message = 'Your account does not have admin access.' }: { message?: string }) {
  const handleAdminSignIn = async () => {
    await signOut().catch(() => undefined)
    navigateToPath(ADMIN_BASE_PATH)
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Panel as="section" className="w-full max-w-md text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--bad-soft)] text-[var(--bad)]">
          <ShieldAlert className="g-ic" aria-hidden="true" />
        </span>
        <h1 className="g-h2 mt-4">Admin access required</h1>
        <p className="g-sm g-mut mt-2">{message}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => navigateToPath('/home')}>Go home</Button>
          <Button variant="line" onClick={() => void handleAdminSignIn()}>
            Admin sign in
          </Button>
        </div>
      </Panel>
    </main>
  )
}

export function AdminRouteGate({
  pathname,
  adminMfa,
  children,
}: {
  pathname: string
  adminMfa: {
    isLoading: boolean
    status: AdminMfaStatus | null
  }
  children: ReactNode
}) {
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null)

  useEffect(() => {
    setRedirectTarget(resolveAdminRouteGateState({
      isLoading: adminMfa.isLoading,
      status: adminMfa.status,
      pathname,
    }).redirectTarget)
  }, [adminMfa.isLoading, adminMfa.status, pathname])

  useEffect(() => {
    if (!redirectTarget) {
      return
    }

    navigateToPath(redirectTarget)
  }, [redirectTarget])

  if (resolveAdminRouteGateState({
    isLoading: adminMfa.isLoading,
    status: adminMfa.status,
    pathname,
  }).accessDenied) {
    return <AdminAccessDenied message="This signed-in account is not an admin." />
  }

  if (redirectTarget && adminMfa.status) {
    return null
  }

  return <>{children}</>
}
