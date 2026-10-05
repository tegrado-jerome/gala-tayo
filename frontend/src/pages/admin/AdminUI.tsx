import type { ReactNode } from 'react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { ArrowUpRight } from '@phosphor-icons/react/dist/csr/ArrowUpRight'
import { Flag } from '@phosphor-icons/react/dist/csr/Flag'
import { Image } from '@phosphor-icons/react/dist/csr/Image'
import { SquaresFour as LayoutDashboard } from '@phosphor-icons/react/dist/csr/SquaresFour'
import { MapPinPlus } from '@phosphor-icons/react/dist/csr/MapPinPlus'
import { ChatCenteredText as MessageSquare } from '@phosphor-icons/react/dist/csr/ChatCenteredText'
import { ArrowClockwise as RotateCw } from '@phosphor-icons/react/dist/csr/ArrowClockwise'
import { User as UserRound } from '@phosphor-icons/react/dist/csr/User'
import { Avatar, Button, Chip, Chips, Panel, Skeleton, Tag, cx } from '../../components/ui'
import { useAvatarImageSrc } from '../../utils/avatarImageCache'
import { navigateToPath } from '../../utils/navigation'
import { ADMIN_BASE_PATH, getAdminPath } from '../../utils/adminRoutes'
import './admin.css'

type AdminNavItem = {
  label: string
  path: string
  icon: PhosphorIcon
}

const adminNavItems: AdminNavItem[] = [
  { label: 'Dashboard', path: ADMIN_BASE_PATH, icon: LayoutDashboard },
  { label: 'Submissions', path: getAdminPath('place-submissions'), icon: MapPinPlus },
  { label: 'Photos', path: getAdminPath('place-images'), icon: Image },
  { label: 'Places', path: getAdminPath('place-reports'), icon: Flag },
  { label: 'Comments', path: getAdminPath('comment-reports'), icon: MessageSquare },
  { label: 'Users', path: getAdminPath('user-reports'), icon: UserRound },
]

function AdminBrand() {
  return (
    <div className="ga-brand">
      <span className="g-logo">
        <i />
        GalaTayo
      </span>
      <Tag>Admin</Tag>
    </div>
  )
}

export function AdminShell({
  title,
  description,
  activePath,
  actions,
  children,
}: {
  title: string
  description: string
  activePath?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="ga-shell">
      <aside className="ga-side">
        <AdminBrand />
        <nav aria-label="Admin sections" className="flex flex-col gap-1">
          {adminNavItems.map(({ label, path, icon: Icon }) => (
            <button
              key={path}
              type="button"
              onClick={() => navigateToPath(path)}
              className="ga-nav-item"
              aria-current={activePath === path ? 'page' : undefined}
            >
              <Icon aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <div className="ga-side-foot">
          <button type="button" onClick={() => navigateToPath('/home')} className="ga-nav-item">
            <ArrowUpRight aria-hidden="true" />
            View public site
          </button>
        </div>
      </aside>

      <div className="ga-main">
        <div className="ga-top flex flex-col gap-3">
          <AdminBrand />
          <Chips aria-label="Admin sections" role="navigation">
            {adminNavItems.map(({ label, path, icon: Icon }) => (
              <Chip key={path} on={activePath === path} onClick={() => navigateToPath(path)} aria-current={activePath === path ? 'page' : undefined}>
                <Icon aria-hidden="true" />
                {label}
              </Chip>
            ))}
          </Chips>
        </div>

        <header className="ga-head">
          <div className="min-w-0">
            <h1 className="g-h1">{title}</h1>
            <p className="g-sm g-mut mt-1">{description}</p>
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </header>

        {children}
      </div>
    </main>
  )
}

export function AdminRefreshButton({ isLoading, onRefresh }: { isLoading: boolean; onRefresh: () => void }) {
  return (
    <Button variant="line" size="sm" onClick={onRefresh} disabled={isLoading}>
      <RotateCw aria-hidden="true" />
      {isLoading ? 'Refreshing' : 'Refresh'}
    </Button>
  )
}

export function AdminAccessCheck() {
  return (
    <main className="ga-center" aria-busy="true" aria-live="polite">
      <span className="sr-only">Checking admin access</span>
      <div className="grid w-full max-w-md gap-3">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </main>
  )
}

export function AdminAccessRequired({ message }: { message: string }) {
  return (
    <main className="ga-center">
      <Panel className="w-full max-w-md text-center">
        <h1 className="g-h2">Admin access required</h1>
        <p className="g-sm g-mut mt-2">{message}</p>
        <div className="mt-5 flex justify-center">
          <Button variant="line" onClick={() => navigateToPath('/home')}>
            Go home
          </Button>
        </div>
      </Panel>
    </main>
  )
}

export function AdminContentSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <Panel key={index} className="grid gap-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-16" />
        </Panel>
      ))}
    </div>
  )
}

export function AdminStatusFilters<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T
  options: readonly T[]
  labels: Record<string, string>
  onChange: (value: T) => void
}) {
  return (
    <Chips aria-label="Status filter" role="group">
      {options.map((option) => (
        <Chip key={option} on={value === option} onClick={() => onChange(option)}>
          {labels[option] || option}
        </Chip>
      ))}
    </Chips>
  )
}

export function AdminError({ message }: { message: string }) {
  if (!message) return null
  return (
    <p role="alert" className="ga-msg is-bad">
      {message}
    </p>
  )
}

export function statusTone(status: string): 'ok' | 'warn' | 'neutral' {
  if (status === 'resolved' || status === 'action_taken') return 'ok'
  if (status === 'pending' || status === 'reviewing') return 'warn'
  return 'neutral'
}

export function AdminField({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('ga-box', className)}>
      <p className="g-eyebrow">{label}</p>
      <div className="g-sm mt-2">{children}</div>
    </div>
  )
}

export function AdminTextArea({
  label,
  optional,
  value,
  onChange,
  rows = 3,
}: {
  label: string
  optional?: boolean
  value: string
  onChange: (value: string) => void
  rows?: number
}) {
  return (
    <label className="g-field">
      <span className="g-label">
        {label}
        {optional ? <span className="g-fnt ml-2 font-normal">Optional</span> : null}
      </span>
      <textarea value={value} onChange={(event) => onChange(event.target.value.slice(0, 1000))} rows={rows} className="g-input" style={{ minHeight: 0 }} />
    </label>
  )
}

export function AdminPerson({
  username,
  avatarUrl,
  name,
  sub,
}: {
  username: string | null
  avatarUrl: string | null
  name: string
  sub?: string
}) {
  const src = useAvatarImageSrc(avatarUrl)
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar src={src} name={username || name} size={36} />
      <div className="min-w-0">
        <p className="g-sm truncate font-semibold">{name}</p>
        {sub ? <p className="g-xs g-mut truncate">{sub}</p> : null}
      </div>
    </div>
  )
}

export function formatAdminDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
