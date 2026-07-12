import type { ComponentProps, ReactNode } from 'react'
import {
  ArrowRight,
  BedDouble,
  BookOpen,
  Bot,
  Building2,
  Bus,
  CalendarPlus,
  Camera,
  Car,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Clock,
  Coffee,
  Compass,
  CloudRain,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Flag,
  Flame,
  Frown,
  Gamepad2,
  Heart,
  Home,
  Hourglass,
  Image,
  Lightbulb,
  ImageOff,
  ImagePlus,
  Landmark,
  Laugh,
  LayoutGrid,
  Leaf,
  List,
  LocateFixed,
  Lock,
  LogOut,
  Mail,
  Map,
  MapPin,
  MapPinned,
  MessageCircle,
  MessageSquarePlus,
  Meh,
  Moon,
  Navigation,
  PlusCircle,
  RefreshCw,
  Route,
  Search,
  Send,
  Settings,
  Share2,
  ShoppingBag,
  Smile,
  Sparkles,
  Star,
  Trees,
  Trash2,
  TriangleAlert,
  User,
  UserSearch,
  Users,
  Utensils,
  WandSparkles,
  Wallet,
  Wrench,
  X,
} from 'lucide-react'

const iconSizeMap = {
  ui: 20,
  card: 24,
  empty: 32,
  emptyLg: 40,
} as const

type IconComponent = (props: ComponentProps<'svg'> & { size?: number; strokeWidth?: number }) => ReactNode

const CircleStopIcon = (props: ComponentProps<'svg'> & { size?: number; strokeWidth?: number }) => {
  const { fill, ...rest } = props
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <circle cx="12" cy="12" r="10" />
      <rect x="9.75" y="9.75" width="4.5" height="4.5" rx="0.5" fill={fill ?? 'none'} />
    </svg>
  )
}

const appIcons = {
  addToPlan: PlusCircle,
  askAi: Sparkles,
  sparkles: Sparkles,
  arrowRight: ArrowRight,
  back: ChevronLeft,
  bot: Bot,
  cafe: Coffee,
  categoryActivity: Gamepad2,
  categoryCinema: Clapperboard,
  categoryHeritage: Building2,
  categoryKainan: Utensils,
  categoryMall: ShoppingBag,
  categoryMuseum: Landmark,
  categoryNature: Leaf,
  categoryNightlife: Moon,
  categoryParke: Trees,
  categoryStay: BedDouble,
  categoryTourist: Camera,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  clear: X,
  comments: MessageCircle,
  copy: Copy,
  directions: Route,
  email: Mail,
  eye: Eye,
  eyeOff: EyeOff,
  emptyPhoto: ImageOff,
  photo: Image,
  book: BookOpen,
  bus: Bus,
  car: Car,
  fire: Flame,
  hourglass: Hourglass,
  info: Lightbulb,
  rain: CloudRain,
  users: Users,
  warning: TriangleAlert,
  favorites: Heart,
  galaPlan: Route,
  history: Clock,
  home: Home,
  lock: Lock,
  logOut: LogOut,
  nearMe: Navigation,
  newChat: MessageSquarePlus,
  place: MapPin,
  profile: User,
  profileSearch: UserSearch,
  promptBuilder: WandSparkles,
  promptBuilderAlt: FileText,
  refresh: RefreshCw,
  reports: Flag,
  reviews: Star,
  moodFrown: Frown,
  moodLaugh: Laugh,
  moodNeutral: Meh,
  moodSmile: Smile,
  search: Search,
  send: Send,
  settings: Settings,
  share: Share2,
  uploadPhoto: ImagePlus,
  map: Map,
  layoutGrid: LayoutGrid,
  list: List,
  filter: Filter,
  trash: Trash2,
  notice: Flag,
  tourist: MapPinned,
  nearMeFixed: LocateFixed,
  compass: Compass,
  calendarPlan: CalendarPlus,
  check: Check,
  circleStop: CircleStopIcon,
  wallet: Wallet,
  wrench: Wrench,
} satisfies Record<string, IconComponent>

const categoryIconByKey = {
  activity: 'categoryActivity',
  barkada: 'categoryActivity',
  cafe: 'cafe',
  chill: 'categoryParke',
  cinema: 'categoryCinema',
  family: 'categoryActivity',
  heritage: 'categoryHeritage',
  kainan: 'categoryKainan',
  mall: 'categoryMall',
  museum: 'categoryMuseum',
  nature: 'categoryNature',
  nightlife: 'categoryNightlife',
  parke: 'categoryParke',
  stay: 'categoryStay',
  tourist: 'categoryTourist',
} as const satisfies Record<string, keyof typeof appIcons>

export type AppIconName = keyof typeof appIcons
export type AppIconSize = keyof typeof iconSizeMap | number

export type AppIconProps = Omit<ComponentProps<'svg'>, 'color'> & {
  name: AppIconName
  size?: AppIconSize
  strokeWidth?: number
}

export function getCategoryIconName(categoryValue: string | null | undefined): AppIconName {
  const normalizedCategory = (categoryValue ?? '').trim().toLowerCase()

  if (!normalizedCategory) {
    return 'place'
  }

  for (const [key, iconName] of Object.entries(categoryIconByKey)) {
    if (normalizedCategory.includes(key)) {
      return iconName
    }
  }

  if (normalizedCategory.includes('coffee')) {
    return 'cafe'
  }

  if (normalizedCategory.includes('shop')) {
    return 'categoryMall'
  }

  if (normalizedCategory.includes('park')) {
    return 'categoryParke'
  }

  return 'place'
}

function resolveIconSize(size: AppIconSize) {
  return typeof size === 'number' ? size : iconSizeMap[size]
}

export function AppIcon({
  name,
  size = 'ui',
  strokeWidth = 1.75,
  className,
  ...rest
}: AppIconProps) {
  const Icon = appIcons[name]

  return (
    <Icon
      aria-hidden="true"
      className={className}
      size={resolveIconSize(size)}
      strokeWidth={strokeWidth}
      {...rest}
    />
  )
}
