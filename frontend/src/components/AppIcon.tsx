import type { CSSProperties } from 'react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { Bed as BedDouble } from '@phosphor-icons/react/dist/csr/Bed'
import { BookOpen } from '@phosphor-icons/react/dist/csr/BookOpen'
import { Robot as Bot } from '@phosphor-icons/react/dist/csr/Robot'
import { Buildings as Building2 } from '@phosphor-icons/react/dist/csr/Buildings'
import { Bus } from '@phosphor-icons/react/dist/csr/Bus'
import { CalendarBlank as CalendarDays } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { CalendarPlus } from '@phosphor-icons/react/dist/csr/CalendarPlus'
import { Camera } from '@phosphor-icons/react/dist/csr/Camera'
import { Car } from '@phosphor-icons/react/dist/csr/Car'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { CaretDown as ChevronDown } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CaretLeft as ChevronLeft } from '@phosphor-icons/react/dist/csr/CaretLeft'
import { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { StopCircle as CircleStop } from '@phosphor-icons/react/dist/csr/StopCircle'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { CloudRain } from '@phosphor-icons/react/dist/csr/CloudRain'
import { Compass } from '@phosphor-icons/react/dist/csr/Compass'
import { Copy } from '@phosphor-icons/react/dist/csr/Copy'
import { Crosshair } from '@phosphor-icons/react/dist/csr/Crosshair'
import { Eye } from '@phosphor-icons/react/dist/csr/Eye'
import { EyeSlash as EyeOff } from '@phosphor-icons/react/dist/csr/EyeSlash'
import { FileText } from '@phosphor-icons/react/dist/csr/FileText'
import { Funnel as Filter } from '@phosphor-icons/react/dist/csr/Funnel'
import { Flag } from '@phosphor-icons/react/dist/csr/Flag'
import { Flame } from '@phosphor-icons/react/dist/csr/Flame'
import { SmileySad as Frown } from '@phosphor-icons/react/dist/csr/SmileySad'
import { GameController as Gamepad2 } from '@phosphor-icons/react/dist/csr/GameController'
import { Hourglass } from '@phosphor-icons/react/dist/csr/Hourglass'
import { House } from '@phosphor-icons/react/dist/csr/House'
import { Image } from '@phosphor-icons/react/dist/csr/Image'
import { Info } from '@phosphor-icons/react/dist/csr/Info'
import { Bank as Landmark } from '@phosphor-icons/react/dist/csr/Bank'
import { SquaresFour as LayoutGrid } from '@phosphor-icons/react/dist/csr/SquaresFour'
import { Leaf } from '@phosphor-icons/react/dist/csr/Leaf'
import { Lightbulb } from '@phosphor-icons/react/dist/csr/Lightbulb'
import { List } from '@phosphor-icons/react/dist/csr/List'
import { Lock } from '@phosphor-icons/react/dist/csr/Lock'
import { SignOut as LogOut } from '@phosphor-icons/react/dist/csr/SignOut'
import { EnvelopeSimple as Mail } from '@phosphor-icons/react/dist/csr/EnvelopeSimple'
import { MapTrifold as Map } from '@phosphor-icons/react/dist/csr/MapTrifold'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import { SmileyMeh as Meh } from '@phosphor-icons/react/dist/csr/SmileyMeh'
import { ChatCircle as MessageCircle } from '@phosphor-icons/react/dist/csr/ChatCircle'
import { ChatTeardropDots as MessageSquarePlus } from '@phosphor-icons/react/dist/csr/ChatTeardropDots'
import { Moon } from '@phosphor-icons/react/dist/csr/Moon'
import { NavigationArrow as Navigation } from '@phosphor-icons/react/dist/csr/NavigationArrow'
import { Coffee } from '@phosphor-icons/react/dist/csr/Coffee'
import { PlusCircle } from '@phosphor-icons/react/dist/csr/PlusCircle'
import { ArrowsClockwise as RefreshCw } from '@phosphor-icons/react/dist/csr/ArrowsClockwise'
import { Path as Route } from '@phosphor-icons/react/dist/csr/Path'
import { MagnifyingGlass as Search } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { PaperPlaneTilt as Send } from '@phosphor-icons/react/dist/csr/PaperPlaneTilt'
import { GearSix as Settings } from '@phosphor-icons/react/dist/csr/GearSix'
import { ShareNetwork as Share2 } from '@phosphor-icons/react/dist/csr/ShareNetwork'
import { ShoppingBag } from '@phosphor-icons/react/dist/csr/ShoppingBag'
import { Smiley as Smile } from '@phosphor-icons/react/dist/csr/Smiley'
import { SmileyWink as Laugh } from '@phosphor-icons/react/dist/csr/SmileyWink'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { Star } from '@phosphor-icons/react/dist/csr/Star'
import { Trash as Trash2 } from '@phosphor-icons/react/dist/csr/Trash'
import { Tree as TreePine } from '@phosphor-icons/react/dist/csr/Tree'
import { Warning as TriangleAlert } from '@phosphor-icons/react/dist/csr/Warning'
import { User } from '@phosphor-icons/react/dist/csr/User'
import { UsersThree as Users } from '@phosphor-icons/react/dist/csr/UsersThree'
import { ForkKnife as UtensilsCrossed } from '@phosphor-icons/react/dist/csr/ForkKnife'
import { VideoCamera as Video } from '@phosphor-icons/react/dist/csr/VideoCamera'
import { Wallet } from '@phosphor-icons/react/dist/csr/Wallet'
import { Wrench } from '@phosphor-icons/react/dist/csr/Wrench'
import { X } from '@phosphor-icons/react/dist/csr/X'

const appIcons = {
  addToPlan: PlusCircle,
  askAi: Sparkles,
  sparkles: Sparkles,
  arrowRight: ArrowRight,
  back: ChevronLeft,
  bot: Bot,
  cafe: Coffee,
  categoryActivity: Gamepad2,
  categoryCinema: Video,
  categoryHeritage: Building2,
  categoryKainan: UtensilsCrossed,
  categoryMall: ShoppingBag,
  categoryMuseum: Landmark,
  categoryNature: Leaf,
  categoryNightlife: Moon,
  categoryParke: TreePine,
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
  emptyPhoto: Image,
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
  galaPlan: Route,
  history: Clock,
  home: House,
  lock: Lock,
  logOut: LogOut,
  nearMe: Navigation,
  newChat: MessageSquarePlus,
  place: MapPin,
  profile: User,
  profileSearch: User,
  promptBuilder: Sparkles,
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
  uploadPhoto: Camera,
  map: Map,
  layoutGrid: LayoutGrid,
  list: List,
  filter: Filter,
  trash: Trash2,
  notice: Flag,
  tourist: MapPin,
  nearMeFixed: Crosshair,
  compass: Compass,
  calendarDays: CalendarDays,
  calendarPlan: CalendarPlus,
  check: Check,
  circleInfo: Info,
  circleStop: CircleStop,
  wallet: Wallet,
  wrench: Wrench,
} satisfies Record<string, PhosphorIcon>

export type AppIconName = keyof typeof appIcons

export type AppIconProps = {
  name: AppIconName
  size?: number
  className?: string
  style?: CSSProperties
  strokeWidth?: number
  'aria-label'?: string
}

/** Named Phosphor icons kept for older call sites; new code imports icons directly from @phosphor-icons/react. */
export function AppIcon({ name, size = 20, strokeWidth = 1.8, 'aria-label': ariaLabel, ...rest }: AppIconProps) {
  const Icon = appIcons[name]
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden={ariaLabel ? undefined : true} aria-label={ariaLabel} {...rest} />
}
