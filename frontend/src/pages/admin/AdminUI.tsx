import type { ReactNode } from 'react'
import {
  Flag,
  Home,
  Image,
  LayoutDashboard,
  MessageSquare,
  RefreshCw,
  Shield,
  UserRound,
} from 'lucide-react'
import { cn } from '../../components/AppUI'
import { navigateToPath } from '../../utils/navigation'

type AdminNavItem = {
  label: string
  path: string
  icon: ReactNode
}

export const adminNavItems: AdminNavItem[] = [
  { label: 'Dashboard', path: '/admin', icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: 'Submissions', path: '/admin/place-submissions', icon: <Home className="h-4 w-4" /> },
  { label: 'Photos', path: '/admin/place-images', icon: <Image className="h-4 w-4" /> },
  { label: 'Places', path: '/admin/place-reports', icon: <Flag className="h-4 w-4" /> },
  { label: 'Comments', path: '/admin/comment-reports', icon: <MessageSquare className="h-4 w-4" /> },
  { label: 'Users', path: '/admin/user-reports', icon: <UserRound className="h-4 w-4" /> },
]

type AdminPageHeaderProps = {
  title: string
  description: string
  activePath?: string
  actions?: ReactNode
}

export function AdminPageHeader({ title, description, activePath, actions }: AdminPageHeaderProps) {
  return (
    <div className="admin-page-header">
      <div className="min-w-0">
        <p className="admin-eyebrow">
          <Shield className="h-3.5 w-3.5" />
          Admin
        </p>
        <h1 className="admin-title">{title}</h1>
        <p className="admin-description">{description}</p>
      </div>
      {actions ? <div className="admin-header-actions">{actions}</div> : null}
      <AdminNav activePath={activePath} />
    </div>
  )
}

export function AdminNav({ activePath }: { activePath?: string }) {
  return (
    <nav className="admin-nav" aria-label="Admin sections">
      {adminNavItems.map((item) => (
        <button
          key={item.path}
          type="button"
          onClick={() => navigateToPath(item.path)}
          className={cn('admin-nav-button', activePath === item.path && 'is-active')}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

export function AdminRefreshButton({
  isLoading,
  onRefresh,
}: {
  isLoading: boolean
  onRefresh: () => void
}) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isLoading}
      className="admin-icon-button"
    >
      <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
      <span>{isLoading ? 'Refreshing' : 'Refresh'}</span>
    </button>
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
    <div className="admin-filter-bar" role="tablist" aria-label="Status filter">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn('admin-filter-chip', value === option && 'is-active')}
          role="tab"
          aria-selected={value === option}
        >
          {labels[option] || option}
        </button>
      ))}
    </div>
  )
}
