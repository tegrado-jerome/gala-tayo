import type { ReactNode } from 'react'

// Airbnb-style content block: generous vertical rhythm separated by a hairline rule.
export function DetailSection({ children, className }: { children: ReactNode; className?: string }) {
  const baseClass = 'border-t border-[var(--line)] py-8 first:border-t-0 first:pt-0'
  return <section className={className ? `${baseClass} ${className}` : baseClass}>{children}</section>
}

export default DetailSection
