import { useMemo } from 'react'
import { CloudRain } from '@phosphor-icons/react/dist/csr/CloudRain'
import HomeDiscover from '../components/home/HomeDiscover'
import NextGalaCard from '../components/home/NextGalaCard'
import SeoHead from '../components/SeoHead'
import { Page } from '../components/ui'
import type { NavigationSource } from '../app/useAppLocationState'
import { useAppUser } from '../context/AppUserContext'
import { R2_PUBLIC_BASE_URL } from '../data/r2Config'
import { useWeather } from '../hooks/useWeather'

function HomePage({ navigationSource }: { navigationSource: NavigationSource }) {
  void navigationSource
  const { currentProfile, currentUser } = useAppUser()
  const weather = useWeather()
  const isRaining = Boolean(weather?.isRaining)
  const greetingName = currentUser?.firstName?.trim() || currentProfile?.displayName?.trim().split(/\s+/)[0] || null
  const seoConfig = useMemo(
    () => ({
      title: 'Home | GalaTayo',
      description: 'Discover gala-worthy places around the Philippines by city, category, budget, and vibe.',
      canonicalPath: '/',
      preconnectOrigins: [new URL(R2_PUBLIC_BASE_URL).origin],
    }),
    [],
  )

  return (
    <Page>
      <SeoHead {...seoConfig} />
      <HomeDiscover
        isRaining={isRaining}
        headline={<h1 className="g-home-title">{greetingName ? `Tara, ${greetingName} — saan ang gala this weekend?` : 'Saan ang gala this weekend?'}</h1>}
        top={
          <>
            {isRaining && weather ? (
              <p className="mt-4">
                <span className="g-wx">
                  <CloudRain />
                  {weather.label} · indoor picks first
                </span>
              </p>
            ) : null}
            <NextGalaCard />
          </>
        }
      />
    </Page>
  )
}

export default HomePage
