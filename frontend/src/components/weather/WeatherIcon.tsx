import type { IconWeight } from '@phosphor-icons/react'
import { Cloud } from '@phosphor-icons/react/dist/csr/Cloud'
import { CloudFog } from '@phosphor-icons/react/dist/csr/CloudFog'
import { CloudLightning } from '@phosphor-icons/react/dist/csr/CloudLightning'
import { CloudMoon } from '@phosphor-icons/react/dist/csr/CloudMoon'
import { CloudRain } from '@phosphor-icons/react/dist/csr/CloudRain'
import { CloudSun } from '@phosphor-icons/react/dist/csr/CloudSun'
import { Moon } from '@phosphor-icons/react/dist/csr/Moon'
import { Sun } from '@phosphor-icons/react/dist/csr/Sun'
import { isRainCode, isStormCode } from '../../utils/weather'

function pickIcon(code: number, night: boolean) {
  if (isStormCode(code)) return CloudLightning
  if (isRainCode(code)) return CloudRain
  if (code >= 45) return CloudFog
  if (code === 3) return Cloud
  if (code >= 1) return night ? CloudMoon : CloudSun
  return night ? Moon : Sun
}

export default function WeatherIcon({ code, night = false, weight = 'light', className }: { code: number; night?: boolean; weight?: IconWeight; className?: string }) {
  const Icon = pickIcon(code, night)
  return <Icon weight={weight} aria-hidden="true" className={className} />
}
