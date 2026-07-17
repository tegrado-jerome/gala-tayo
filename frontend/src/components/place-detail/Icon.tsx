import { AppIcon, type AppIconName } from '../AppIcon'
import type { IconName } from './types'

export function Icon({
  name,
  className = 'h-5 w-5',
  size,
  strokeWidth = 2,
}: {
  name: IconName
  className?: string
  size?: number
  strokeWidth?: number
}) {
  const iconMap: Record<IconName, AppIconName> = {
    back: 'back',
    photo: 'photo',
    share: 'share',
    chevronDown: 'chevronDown',
    save: 'favorites',
    directions: 'directions',
    location: 'place',
    category: 'categoryHeritage',
    budget: 'wallet',
    clock: 'history',
    hourglass: 'hourglass',
    home: 'home',
    crowd: 'users',
    rain: 'rain',
    eye: 'eye',
    fire: 'fire',
    utensils: 'categoryKainan',
    heart: 'favorites',
    users: 'users',
    book: 'book',
    bus: 'bus',
    car: 'car',
    globe: 'tourist',
    warning: 'warning',
    sparkle: 'askAi',
  }

  return <AppIcon name={iconMap[name]} className={className} size={size} strokeWidth={strokeWidth} />
}

export default Icon
