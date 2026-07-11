import type { ReactNode } from 'react'

export function DetailSection({ children, className }: { children: ReactNode; className?: string }) {
  const baseClass = 'border-t border-[var(--line)] py-3 first:border-t-0 lg:py-4'
  return <section className={className ? `${baseClass} ${className}` : baseClass}>{children}</section>
}

export default DetailSection
