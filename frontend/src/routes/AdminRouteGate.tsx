import { useEffect, useState, type ReactNode } from 'react'
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
    <main className="gala-page-background flex min-h-screen items-center justify-center px-4 py-10 text-center text-[var(--text)]">
      <section className="w-full max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] border border-[rgba(220,38,38,0.16)] bg-red-50 text-red-600">
          <span className="text-lg font-black">!</span>
        </div>
        <h1 className="mt-5 text-2xl font-black text-slate-950">Admin access required</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{message}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => navigateToPath('/home')}
            className="app-button app-button-primary app-button-md"
          >
            Go home
          </button>
          <button
            type="button"
            onClick={() => void handleAdminSignIn()}
            className="app-button app-button-secondary app-button-md"
          >
            Admin sign in
          </button>
        </div>
      </section>
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
