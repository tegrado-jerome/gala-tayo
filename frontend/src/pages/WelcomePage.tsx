import { ArrowRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import SeoHead from '../components/SeoHead'
import { navigateToPath } from '../utils/navigation'
import type { NavigationSource } from '../utils/navigationLoading'
import { getPublicSiteOrigin } from '../utils/site'
import { preloadHomePageImages } from '../utils/homePreloader'
import galaTayoLogo from '../assets/brand/galatayo-logo.svg'

type WelcomeAsset = {
  src: string
  media?: string
  type?: string
}

function supportsWebp(): boolean {
  if (typeof document === 'undefined') return false
  const canvas = document.createElement('canvas')
  if (canvas.getContext?.('2d')) {
    return canvas.toDataURL('image/webp').startsWith('data:image/webp')
  }
  return false
}

function getSources(useWebp: boolean): WelcomeAsset[] {
  const sources: WelcomeAsset[] = []
  if (useWebp) {
    sources.push(
      { src: '/images/welcome/mobile.webp', media: '(max-width: 639px)', type: 'image/webp' },
      { src: '/images/welcome/tablet.webp', media: '(max-width: 1023px)', type: 'image/webp' },
      { src: '/images/welcome/laptop-desktop.webp', type: 'image/webp' },
    )
  }
  sources.push(
    { src: '/images/welcome/mobile.png', media: '(max-width: 639px)' },
    { src: '/images/welcome/tablet.png', media: '(max-width: 1023px)' },
    { src: '/images/welcome/laptop-desktop.png' },
  )
  return sources
}

const WELCOME_LOADING_MIN_MS = 2000
const WELCOME_LOADING_MAX_MS = 5000
const WELCOME_LOADING_BACK_NAV_MIN_MS = 500

function getWelcomeHeroSrc() {
  if (typeof window === 'undefined') {
    return '/images/welcome/laptop-desktop.png'
  }

  if (window.innerWidth <= 639) {
    return '/images/welcome/mobile.png'
  }

  if (window.innerWidth <= 1023) {
    return '/images/welcome/tablet.png'
  }

  return '/images/welcome/laptop-desktop.png'
}

function getPreloadSrc(useWebp: boolean) {
  const ext = useWebp ? 'webp' : 'png'
  if (typeof window === 'undefined') return `/images/welcome/laptop-desktop.${ext}`
  if (window.innerWidth <= 639) return `/images/welcome/mobile.${ext}`
  if (window.innerWidth <= 1023) return `/images/welcome/tablet.${ext}`
  return `/images/welcome/laptop-desktop.${ext}`
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

type WelcomePageProps = {
  navigationSource?: NavigationSource
}

function WelcomePage({ navigationSource = 'push' }: WelcomePageProps) {
  const [useWebp] = useState(() => supportsWebp())
  const [heroSrc, setHeroSrc] = useState(() => getWelcomeHeroSrc())
  const [preloadSrc, setPreloadSrc] = useState(() => getPreloadSrc(useWebp))
  const [isReady, setIsReady] = useState(false)
  const hasRevealedRef = useRef(false)
  const activeSources = useMemo(() => getSources(useWebp), [useWebp])

  const loadingMinMs = useMemo(() => {
    if (navigationSource === 'pop') return WELCOME_LOADING_BACK_NAV_MIN_MS
    return WELCOME_LOADING_MIN_MS
  }, [navigationSource])

  useEffect(() => {
    let animationFrameId = 0

    const updateHeroSrc = () => {
      if (hasRevealedRef.current) {
        return
      }

      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = window.requestAnimationFrame(() => {
        const next = getWelcomeHeroSrc()
        setHeroSrc((prev) => (prev === next ? prev : next))
        setPreloadSrc(getPreloadSrc(useWebp))
      })
    }

    window.addEventListener('resize', updateHeroSrc)
    window.addEventListener('orientationchange', updateHeroSrc)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', updateHeroSrc)
      window.removeEventListener('orientationchange', updateHeroSrc)
    }
  }, [useWebp])

  useEffect(() => {
    let isCancelled = false
    const timeoutIds: number[] = []
    const image = new Image()
    image.src = preloadSrc

    setIsReady(false)

    const revealWhenAllowed = () => {
      if (!isCancelled) {
        hasRevealedRef.current = true
        setIsReady(true)
      }
    }

    const imageReadyPromise = waitForImageReady(image).catch(
      () => waitForDuration(500)
    )
    const minimumDelayPromise = waitForDuration(loadingMinMs, timeoutIds)
    const readyAfterMinimumPromise = Promise.all([imageReadyPromise, minimumDelayPromise])

    void Promise.race([
      readyAfterMinimumPromise,
      waitForDuration(WELCOME_LOADING_MAX_MS, timeoutIds),
    ]).then(revealWhenAllowed)

    return () => {
      isCancelled = true
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
    }
  }, [preloadSrc, loadingMinMs])

  const handleStartExploring = () => {
    navigateToPath('/home')
    window.setTimeout(preloadHomePageImages, 0)
  }

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
            url: 'https://galatayo.app/',
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'GalaTayo',
            url: `${getPublicSiteOrigin()}/`,
            logo: `${getPublicSiteOrigin()}/favicon.png`,
          },
        ]}
      />
      <main
        className={`welcome-page${isReady ? ' is-ready' : ' is-loading'}`}
        aria-busy={!isReady}
        data-navigation-source={navigationSource}
      >
        <picture className="welcome-page__media" aria-hidden="true">
          {activeSources.map((asset) => (
            <source key={asset.src} srcSet={asset.src} media={asset.media} type={asset.type} />
          ))}
          <img
            src={heroSrc}
            alt="Two people looking over the city skyline at sunset."
            className="welcome-page__image"
            width={1440}
            height={2560}
            loading="eager"
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
            onClick={handleStartExploring}
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
