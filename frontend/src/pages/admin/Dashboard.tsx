import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Flag, Home, Image, MessageSquare, UserRound } from 'lucide-react'
import AppHeader from '../../components/AppHeader'
import { PageContainer, PageShell, StateContainer } from '../../components/layout/ResponsiveLayouts'
import { useAdminAccess } from '../../hooks/useAdminAccess'
import { navigateToPath } from '../../utils/navigation'
import { ADMIN_BASE_PATH, getAdminPath } from '../../utils/adminRoutes'
import { AdminAccessSkeleton, AdminPageHeader } from './AdminUI'

type DashboardSection = {
  title: string
  description: string
  path: string
  icon: ReactNode
  color: string
}

const sections: DashboardSection[] = [
  {
    title: 'Place submissions',
    description: 'Review pending user-submitted places',
    path: getAdminPath('place-submissions'),
    icon: <Home className="h-5 w-5" />,
    color: 'border-l-[#1E3A8A]',
  },
  {
    title: 'Photo review',
    description: 'Approve or reject contributed place photos',
    path: getAdminPath('place-images'),
    icon: <Image className="h-5 w-5" />,
    color: 'border-l-[#059669]',
  },
  {
    title: 'Place reports',
    description: 'Review reports against place listings',
    path: getAdminPath('place-reports'),
    icon: <Flag className="h-5 w-5" />,
    color: 'border-l-[#D97706]',
  },
  {
    title: 'Comment reports',
    description: 'Review reports against comments',
    path: getAdminPath('comment-reports'),
    icon: <MessageSquare className="h-5 w-5" />,
    color: 'border-l-[#7C3AED]',
  },
  {
    title: 'User reports',
    description: 'Review reports against user accounts',
    path: getAdminPath('user-reports'),
    icon: <UserRound className="h-5 w-5" />,
    color: 'border-l-[#DC2626]',
  },
]

function AdminDashboard({ session }: { session: Session }) {
  const { isAdmin, isCheckingAccess } = useAdminAccess(session)

  if (isCheckingAccess) {
    return (
      <PageShell>
        <AppHeader />
        <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-10">
          <StateContainer>
            <AdminAccessSkeleton />
          </StateContainer>
        </main>
      </PageShell>
    )
  }

  if (!isAdmin) {
    return (
      <PageShell>
        <AppHeader />
        <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-10">
          <StateContainer>
            <h1 className="text-2xl font-black text-slate-950">Admin access required</h1>
            <p className="mt-2 text-sm font-semibold text-slate-700">Only admins can access this dashboard.</p>
          </StateContainer>
        </main>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <AppHeader />
      <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-10">
        <PageContainer size="wide">
          <AdminPageHeader
            title="GalaTayo Admin"
            description="Moderate content, manage reports, and keep the community safe."
            activePath={ADMIN_BASE_PATH}
          />

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((section) => (
              <button
                key={section.path}
                type="button"
                onClick={() => navigateToPath(section.path)}
                className={`admin-card group border-l-4 p-4 text-left transition sm:p-5 ${section.color}`}
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                  {section.icon}
                </span>
                <h2 className="mt-3 text-base font-black text-slate-950 group-hover:text-[var(--accent)] sm:text-lg">
                  {section.title}
                </h2>
                <p className="mt-1 text-sm font-medium leading-5 text-slate-600">
                  {section.description}
                </p>
              </button>
            ))}
          </div>

          <div className="admin-card mt-8 p-4 sm:p-5">
            <h2 className="text-lg font-black text-slate-950">Quick links</h2>
            <div className="admin-action-row mt-4">
              <button
                type="button"
                onClick={() => navigateToPath('/home')}
                className="app-button app-button-ghost app-button-md admin-action-button"
              >
                View public site
              </button>
              <button
                type="button"
                onClick={() => navigateToPath('/places')}
                className="app-button app-button-ghost app-button-md admin-action-button"
              >
                Browse places
              </button>
              <button
                type="button"
                onClick={() => navigateToPath('/profile')}
                className="app-button app-button-ghost app-button-md admin-action-button"
              >
                My profile
              </button>
            </div>
          </div>
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default AdminDashboard
