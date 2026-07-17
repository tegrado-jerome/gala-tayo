import { useEffect, useMemo, useState } from 'react'
import galaTayoLogo from '../assets/brand/galatayo-logo.svg'
import SeoHead from '../components/SeoHead'
import { navigateToPath } from '../utils/navigation'
import { shouldBlockOnNavigationEntry, type NavigationSource } from '../utils/navigationLoading'

type WelcomeAsset = {
  src: string
  media?: string
}

const welcomeAssets: WelcomeAsset[] = [
  {
    src: '/images/welcome/mobile.webp',
    media: '(max-width: 639px)',
  },
  {
    src: '/images/welcome/tablet.webp',
    media: '(max-width: 1023px)',
  },
  {
    src: '/images/welcome/laptop-desktop.webp',
  },
]

const WELCOME_LOADING_MIN_MS = 2000
const WELCOME_LOADING_MAX_MS = 8000

function getWelcomeHeroSrc() {
  if (typeof window === 'undefined') {
    return '/images/welcome/laptop-desktop.webp'
  }

  if (window.innerWidth <= 639) {
    return '/images/welcome/mobile.webp'
  }

  if (window.innerWidth <= 1023) {
    return '/images/welcome/tablet.webp'
  }

  return '/images/welcome/laptop-desktop.webp'
}

function WelcomeLoader() {
  return (
    <main className="welcome-loader">
      <div className="welcome-loader__content">
        <img
          src={galaTayoLogo}
          alt="GalaTayo logo"
          className="welcome-loader__logo"
          width={180}
          height={58}
        />
      </div>
    </main>
  )
}

async function waitForImageReady(image: HTMLImageElement) {
  if (!image.complete) {
    await new Promise<void>((resolve) => {
      image.onload = () => resolve()
      image.onerror = () => resolve()
    })
  }

  if (typeof image.decode === 'function') {
    try {
      await image.decode()
    } catch {
      // Fall back to revealing the page if decode fails after load.
    }
  }
}

type WelcomePageProps = {
  navigationSource?: NavigationSource
}

function WelcomePage({ navigationSource = 'push' }: WelcomePageProps) {
  const shouldBlockOnEntry = shouldBlockOnNavigationEntry(navigationSource)
  const [isReady, setIsReady] = useState(() => !shouldBlockOnEntry)
  const heroSrc = useMemo(() => getWelcomeHeroSrc(), [])

  useEffect(() => {
    if (!shouldBlockOnEntry) {
      setIsReady(true)
      return
    }

    let isCancelled = false
    const startedAt = window.performance.now()
    const preloadImage = new Image()
    let hasCompleted = false

    const revealWhenAllowed = () => {
      if (isCancelled || hasCompleted) {
        return
      }

      hasCompleted = true
      setIsReady(true)
    }

    const completeWhenReady = () => {
      const elapsed = window.performance.now() - startedAt
      const remainingDelay = Math.max(WELCOME_LOADING_MIN_MS - elapsed, 0)

      window.setTimeout(revealWhenAllowed, remainingDelay)
    }

    const maxDelayTimeoutId = window.setTimeout(revealWhenAllowed, WELCOME_LOADING_MAX_MS)

    preloadImage.src = heroSrc
    void waitForImageReady(preloadImage).then(() => {
      completeWhenReady()
    })

    return () => {
      isCancelled = true
      window.clearTimeout(maxDelayTimeoutId)
      preloadImage.onload = null
      preloadImage.onerror = null
    }
  }, [heroSrc, shouldBlockOnEntry])

  if (!isReady) {
    return (
      <>
        <SeoHead
          title="GalaTayo | Discover Metro Manila places"
          description="GalaTayo helps you discover Metro Manila places, browse city pages, and plan your next gala."
          canonicalPath="/"
          openGraphType="website"
        />
        <WelcomeLoader />
      </>
    )
  }

  return (
    <>
      <SeoHead
        title="GalaTayo | Discover Metro Manila places"
        description="GalaTayo helps you discover Metro Manila places, browse city pages, and plan your next gala."
        canonicalPath="/"
        openGraphType="website"
        image={{
          url: '/images/welcome/laptop-desktop.webp',
          alt: 'Metro Manila welcome scene on GalaTayo',
        }}
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'GalaTayo',
            url: `${window.location.origin}/`,
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'GalaTayo',
            url: `${window.location.origin}/`,
            logo: `${window.location.origin}/favicon.svg`,
          },
        ]}
      />
      <main className="welcome-page">
        <picture className="welcome-page__media">
          {welcomeAssets.map((asset) => (
            <source key={asset.src} srcSet={asset.src} media={asset.media} type="image/webp" />
          ))}
          <img
            src={heroSrc}
            alt="Two people looking over the city skyline at sunset."
            className="welcome-page__image"
            width={1440}
            height={2560}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            sizes="100vw"
          />
        </picture>

        <div className="welcome-page__overlay" />
        <section className="welcome-page__content">
          <h1 className="welcome-page__title">Plan your next gala.</h1>
          <p className="welcome-page__description">
            Browse spots and build a plan fast.
          </p>
          <button
            type="button"
            onClick={() => navigateToPath('/home')}
            className="welcome-page__button"
          >
            Tara na!
          </button>
        </section>
      </main>
    </>
  )
}

export default WelcomePage
