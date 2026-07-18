import { ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import galaTayoLogo from '../assets/brand/galatayo-logo.svg'
import SeoHead from '../components/SeoHead'
import { navigateToPath } from '../utils/navigation'
import type { NavigationSource } from '../utils/navigationLoading'
import { getPublicSiteOrigin } from '../utils/site'

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

function waitForDuration(durationMs: number, timeoutIds?: number[]) {
  return new Promise<void>((resolve) => {
    const timeoutId = window.setTimeout(resolve, durationMs)
    timeoutIds?.push(timeoutId)
  })
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve())
    })
  })
}

function WelcomeLoader() {
  return (
    <div className="welcome-loader" aria-label="Loading welcome screen" aria-live="polite">
      <div className="welcome-loader__content">
        <img
          src={galaTayoLogo}
          alt="GalaTayo logo"
          className="welcome-loader__logo"
          width={180}
          height={58}
        />
      </div>
    </div>
  )
}

async function waitForImageReady(image: HTMLImageElement) {
  if (!image.complete || image.naturalWidth === 0) {
    await new Promise<void>((resolve, reject) => {
      const handleLoad = () => resolve()
      const handleError = () => reject(new Error('Welcome image failed to load.'))

      image.addEventListener('load', handleLoad, { once: true })
      image.addEventListener('error', handleError, { once: true })
    })
  }

  if (typeof image.decode === 'function') {
    try {
      await image.decode()
    } catch {
      // Fall back to revealing the page if decode fails after load.
    }
  }

  await waitForNextPaint()
}

type WelcomePageProps = {
  navigationSource?: NavigationSource
}

function WelcomePage({ navigationSource = 'push' }: WelcomePageProps) {
  const imageRef = useRef<HTMLImageElement | null>(null)
  const hasRevealedRef = useRef(false)
  const [heroSrc, setHeroSrc] = useState(() => getWelcomeHeroSrc())
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let animationFrameId = 0

    const updateHeroSrc = () => {
      if (hasRevealedRef.current) {
        return
      }

      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = window.requestAnimationFrame(() => {
        setHeroSrc(getWelcomeHeroSrc())
      })
    }

    window.addEventListener('resize', updateHeroSrc)
    window.addEventListener('orientationchange', updateHeroSrc)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', updateHeroSrc)
      window.removeEventListener('orientationchange', updateHeroSrc)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false
    const timeoutIds: number[] = []
    const image = imageRef.current

    if (!image) {
      return
    }

    setIsReady(false)

    const revealWhenAllowed = () => {
      if (!isCancelled) {
        hasRevealedRef.current = true
        setIsReady(true)
      }
    }

    const imageReadyPromise = waitForImageReady(image).catch(
      () => new Promise<never>(() => {})
    )
    const minimumDelayPromise = waitForDuration(WELCOME_LOADING_MIN_MS, timeoutIds)
    const readyAfterMinimumPromise = Promise.all([imageReadyPromise, minimumDelayPromise])

    void Promise.race([
      readyAfterMinimumPromise,
      waitForDuration(WELCOME_LOADING_MAX_MS, timeoutIds),
    ]).then(revealWhenAllowed)

    return () => {
      isCancelled = true
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
    }
  }, [heroSrc])

  return (
    <>
      <SeoHead
        title="GalaTayo - Discover places in Metro Manila"
        description="Discover places across Metro Manila by city, category, budget, and vibe. Get AI-powered recommendations and plan your next gala."
        robots="index,follow,max-image-preview:none,max-snippet:-1,max-video-preview:-1"
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
            url: `${getPublicSiteOrigin()}/`,
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'GalaTayo',
            url: `${getPublicSiteOrigin()}/`,
            logo: `${getPublicSiteOrigin()}/favicon.svg`,
          },
        ]}
      />
      <main
        className={`welcome-page${isReady ? ' is-ready' : ' is-loading'}`}
        aria-busy={!isReady}
        data-navigation-source={navigationSource}
      >
        <picture className="welcome-page__media">
          {welcomeAssets.map((asset) => (
            <source key={asset.src} srcSet={asset.src} media={asset.media} type="image/webp" />
          ))}
          <img
            ref={imageRef}
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
        <section className="welcome-page__content" aria-hidden={!isReady}>
          <h1 className="welcome-page__title">Your next gala starts here.</h1>
          <p className="welcome-page__description">
            Discover places and build your next plan with ease.
          </p>
          <button
            type="button"
            onClick={() => navigateToPath('/home')}
            className="welcome-page__button"
            disabled={!isReady}
          >
            <span className="welcome-page__button-label">Start exploring</span>
            <ArrowRight className="welcome-page__button-icon" aria-hidden="true" strokeWidth={2.6} />
          </button>
        </section>
        {!isReady && <WelcomeLoader />}
      </main>
    </>
  )
}

export default WelcomePage
