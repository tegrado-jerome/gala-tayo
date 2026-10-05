import type { Session } from '@supabase/supabase-js'
import { ArrowUpRight, Flag, Image, MapPinPlus, MessageSquare, UserRound, type LucideIcon } from 'lucide-react'
import { Button } from '../../components/ui'
import { useAdminAccess } from '../../hooks/useAdminAccess'
import { navigateToPath } from '../../utils/navigation'
import { ADMIN_BASE_PATH, getAdminPath } from '../../utils/adminRoutes'
import { AdminAccessCheck, AdminAccessRequired, AdminShell } from './AdminUI'

type DashboardSection = {
  title: string
  description: string
  path: string
  icon: LucideIcon
}

const sections: DashboardSection[] = [
  { title: 'Place submissions', description: 'Review pending user-submitted places', path: getAdminPath('place-submissions'), icon: MapPinPlus },
  { title: 'Photo review', description: 'Approve or reject contributed place photos', path: getAdminPath('place-images'), icon: Image },
  { title: 'Place reports', description: 'Review reports against place listings', path: getAdminPath('place-reports'), icon: Flag },
  { title: 'Comment reports', description: 'Review reports against comments', path: getAdminPath('comment-reports'), icon: MessageSquare },
  { title: 'User reports', description: 'Review reports against user accounts', path: getAdminPath('user-reports'), icon: UserRound },
]

function AdminDashboard({ session }: { session: Session }) {
  const { isAdmin, isCheckingAccess } = useAdminAccess(session)

  if (isCheckingAccess) return <AdminAccessCheck />
  if (!isAdmin) return <AdminAccessRequired message="Only admins can access this dashboard." />

  return (
    <AdminShell
      title="GalaTayo admin"
      description="Moderate content, manage reports, and keep the community safe."
      activePath={ADMIN_BASE_PATH}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map(({ title, description, path, icon: Icon }) => (
          <button
            key={path}
            type="button"
            onClick={() => navigateToPath(path)}
            className="g-panel flex min-w-0 items-start gap-3 text-left"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-2)] bg-[var(--fill)]">
              <Icon className="g-ic" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="g-h3 block">{title}</span>
              <span className="g-sm g-mut mt-1 block">{description}</span>
            </span>
          </button>
        ))}
      </div>

      <section>
        <h2 className="g-h3">Quick links</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="line" size="sm" onClick={() => navigateToPath('/home')}>
            View public site
            <ArrowUpRight aria-hidden="true" />
          </Button>
          <Button variant="line" size="sm" onClick={() => navigateToPath('/places')}>
            Browse places
          </Button>
          <Button variant="line" size="sm" onClick={() => navigateToPath('/profile')}>
            My profile
          </Button>
        </div>
      </section>
    </AdminShell>
  )
}

export default AdminDashboard
