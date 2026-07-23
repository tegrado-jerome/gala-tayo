import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { FontAwesomeIconProps } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import type { ComponentProps, ReactNode } from 'react'
import {
  faArrowRight,
  faBagShopping,
  faBed,
  faBookOpen,
  faBuilding,
  faBus,
  faCalendarDays,
  faCalendarPlus,
  faCamera,
  faCar,
  faCheck,
  faCircleInfo,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faCirclePlus,
  faClock,
  faCloudShowersHeavy,
  faComment,
  faCommentDots,
  faCompass,
  faCopy,
  faCrosshairs,
  faEnvelope,
  faEye,
  faEyeSlash,
  faFaceFrown,
  faFaceLaugh,
  faFaceMeh,
  faFaceSmile,
  faFileLines,
  faFilter,
  faFire,
  faFlag,
  faGear,
  faGamepad,
  faRightFromBracket,
  faRotate,
  faHeart,
  faHourglass,
  faHouse,
  faImage,
  faLandmark,
  faLeaf,
  faLightbulb,
  faList,
  faLocationArrow,
  faLocationDot,
  faLock,
  faHandSparkles,
  faMagnifyingGlass,
  faMap,
  faMapPin,
  faMugHot,
  faMoon,
  faPaperPlane,
  faRobot,
  faRoute,
  faShareNodes,
  faStar,
  faTableCellsLarge,
  faTrash,
  faTree,
  faTriangleExclamation,
  faUser,
  faUsers,
  faUtensils,
  faVideo,
  faWallet,
  faWrench,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'


const iconSizeMap = {
  ui: 20,
  card: 24,
  empty: 32,
  emptyLg: 40,
} as const

type IconComponent = IconDefinition | ((props: ComponentProps<'svg'> & { size?: number; strokeWidth?: number }) => ReactNode)

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
  addToPlan: faCirclePlus,
  askAi: faHandSparkles,
  sparkles: faHandSparkles,
  arrowRight: faArrowRight,
  back: faChevronLeft,
  bot: faRobot,
  cafe: faMugHot,
  categoryActivity: faGamepad,
  categoryCinema: faVideo,
  categoryHeritage: faBuilding,
  categoryKainan: faUtensils,
  categoryMall: faBagShopping,
  categoryMuseum: faLandmark,
  categoryNature: faLeaf,
  categoryNightlife: faMoon,
  categoryParke: faTree,
  categoryStay: faBed,
  categoryTourist: faCamera,
  chevronRight: faChevronRight,
  chevronDown: faChevronDown,
  clear: faXmark,
  comments: faComment,
  copy: faCopy,
  directions: faRoute,
  email: faEnvelope,
  eye: faEye,
  eyeOff: faEyeSlash,
  emptyPhoto: faImage,
  photo: faImage,
  book: faBookOpen,
  bus: faBus,
  car: faCar,
  fire: faFire,
  hourglass: faHourglass,
  info: faLightbulb,
  rain: faCloudShowersHeavy,
  users: faUsers,
  warning: faTriangleExclamation,
  favorites: faHeart,
  galaPlan: faRoute,
  history: faClock,
  home: faHouse,
  lock: faLock,
  logOut: faRightFromBracket,
  nearMe: faLocationArrow,
  newChat: faCommentDots,
  place: faLocationDot,
  profile: faUser,
  profileSearch: faUser,
  promptBuilder: faHandSparkles,
  promptBuilderAlt: faFileLines,
  refresh: faRotate,
  reports: faFlag,
  reviews: faStar,
  moodFrown: faFaceFrown,
  moodLaugh: faFaceLaugh,
  moodNeutral: faFaceMeh,
  moodSmile: faFaceSmile,
  search: faMagnifyingGlass,
  send: faPaperPlane,
  settings: faGear,
  share: faShareNodes,
  uploadPhoto: faCamera,
  map: faMap,
  layoutGrid: faTableCellsLarge,
  list: faList,
  filter: faFilter,
  trash: faTrash,
  notice: faFlag,
  tourist: faMapPin,
  nearMeFixed: faCrosshairs,
  compass: faCompass,
  calendarDays: faCalendarDays,
  calendarPlan: faCalendarPlus,
  check: faCheck,
  circleInfo: faCircleInfo,
  circleStop: CircleStopIcon,
  wallet: faWallet,
  wrench: faWrench,
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
  hotel: 'categoryStay',
  food: 'categoryKainan',
  tourist: 'categoryTourist',
} as const satisfies Record<string, keyof typeof appIcons>

export type AppIconName = keyof typeof appIcons
export type AppIconSize = keyof typeof iconSizeMap | number

export type AppIconProps = {
  name: AppIconName
  size?: AppIconSize
  className?: string
  style?: FontAwesomeIconProps['style']
  'aria-hidden'?: boolean | 'true' | 'false'
  'aria-label'?: string
  onClick?: () => void
  [key: string]: unknown
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
  ...rest
}: AppIconProps) {
  const iconEntry = appIcons[name]
  const s = resolveIconSize(size)

  if (typeof iconEntry === 'function') {
    const IconComponent = iconEntry
    return (
      <IconComponent
        aria-hidden="true"
        className={rest.className}
        size={s}
        strokeWidth={1.75}
        {...rest}
      />
    )
  }

  return (
    <FontAwesomeIcon icon={iconEntry} {...rest} />
  )
}
