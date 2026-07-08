import { AppIcon, type AppIconName } from '../AppIcon'
import MinimalBackNav from '../MinimalBackNav'

type IconProps = {
  className?: string
}

export function PinIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="place" className={className} />
}

export function ChevronRightIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="chevronRight" className={className} />
}

export function ChevronLeftIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="back" className={className} />
}

export function FilterIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="filter" className={className} />
}

export function BudgetIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return <AppIcon name="wallet" className={`${className} text-[var(--accent-deep)]`} />
}

export function SparkIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return <AppIcon name="askAi" className={className} />
}

export function HeartOutlineIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="favorites" className={className} />
}

export function CafeIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="cafe" className={className} />
}

export function MuseumIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="categoryMuseum" className={className} />
}

export function BuildingIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="categoryHeritage" className={className} />
}

export function BackToHomeButton({
  className = '',
}: {
  className?: string
}) {
  return (
    <MinimalBackNav to="/search" className={className} />
  )
}
