import type { IconName } from './types'

// Plain section title in the Airbnb style; the icon props are kept so existing callers still compile.
export function SectionHeading({
  title,
  preserveCase = false,
  titleClassName = '',
}: {
  icon?: IconName
  title: string
  preserveCase?: boolean
  badgeClassName?: string
  iconClassName?: string
  titleClassName?: string
}) {
  const text = preserveCase ? title.charAt(0) + title.slice(1).toLowerCase() : title
  return <h2 className={`text-[22px] font-medium leading-[26px] text-[var(--text-main)] ${titleClassName}`.trim()}>{text}</h2>
}

export default SectionHeading
