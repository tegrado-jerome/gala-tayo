import { useMemo } from 'react'
import { CloudRain } from '@phosphor-icons/react/dist/csr/CloudRain'
import HomeDiscover from '../components/home/HomeDiscover'
import NextGalaCard from '../components/home/NextGalaCard'
import SeoHead from '../components/SeoHead'
import { Page } from '../components/ui'
import type { NavigationSource } from '../app/useAppLocationState'
import { useAppUser } from '../context/AppUserContext'
import { R2_PUBLIC_BASE_URL } from '../data/r2Config'
import { useManilaWeather } from '../hooks/useManilaWeather'

function HomePage({ navigationSource }: { navigationSource: NavigationSource }) {
  void navigationSource
  const { currentProfile, currentUser } = useAppUser()
  const weather = useManilaWeather()
  const isRaining = Boolean(weather?.isRaining)
  const greetingName = currentUser?.firstName?.trim() || currentProfile?.displayName?.trim().split(/\s+/)[0] || null
  const seoConfig = useMemo(
    () => ({
      title: 'Home | GalaTayo',
      description: 'Discover Metro Manila places by city, category, budget, and vibe.',
      canonicalPath: '/home',
      preconnectOrigins: [new URL(R2_PUBLIC_BASE_URL).origin],
    }),
    [],
  )

  return (
    <Page>
      <SeoHead {...seoConfig} />
      <h1 className="sr-only">{greetingName ? `Tara, ${greetingName}? Places to go in Metro Manila` : 'Places to go in Metro Manila'}</h1>
      <HomeDiscover
        isRaining={isRaining}
        greeting={
          <span aria-hidden="true">
            Tara{greetingName ? `, ${greetingName}` : ''}, <em>gala</em> tayo?
          </span>
        }
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
