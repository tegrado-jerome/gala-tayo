import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRight } from '@fortawesome/free-solid-svg-icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import SeoHead from '../components/SeoHead'
import { navigateToPath } from '../utils/navigation'
import type { NavigationSource } from '../utils/navigationLoading'
import { getPublicSiteOrigin } from '../utils/site'

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
const WELCOME_LOADING_BACK_NAV_MIN_MS = 500

function getWelcomeHeroSrc(useWebp: boolean) {
  const ext = useWebp ? 'webp' : 'png'
  if (typeof window === 'undefined') {
    return `/images/welcome/laptop-desktop.${ext}`
  }

  if (window.innerWidth <= 639) {
    return `/images/welcome/mobile.${ext}`
  }

  if (window.innerWidth <= 1023) {
    return `/images/welcome/tablet.${ext}`
  }

  return `/images/welcome/laptop-desktop.${ext}`
}

function getPreloadSrc(useWebp: boolean) {
  const ext = useWebp ? 'webp' : 'png'
  if (typeof window === 'undefined') return `/images/welcome/laptop-desktop.${ext}`
  if (window.innerWidth <= 639) return `/images/welcome/mobile.${ext}`
  if (window.innerWidth <= 1023) return `/images/welcome/tablet.${ext}`
  return `/images/welcome/laptop-desktop.${ext}`
}

function getPngFallbackSrc(src: string) {
  return src.endsWith('.webp') ? src.replace(/\.webp$/, '.png') : src
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

async function waitForWelcomeHeroReady(src: string) {
  const image = new Image()
  image.src = src

  try {
    await waitForImageReady(image)
    return
  } catch (error) {
    const fallbackSrc = getPngFallbackSrc(src)
    if (fallbackSrc === src) {
      throw error
    }

    const fallbackImage = new Image()
    fallbackImage.src = fallbackSrc
    await waitForImageReady(fallbackImage)
  }
}

function WelcomeLoader() {
  return (
    <div className="welcome-loader" aria-label="Loading welcome screen" aria-live="polite">
      <span className="sr-only">Loading welcome screen</span>
      <div className="welcome-loader__content" aria-hidden="true">
        <picture>
          <source srcSet="/images/brand/galatayo-logo-loader.webp" type="image/webp" />
          <img
            src="/images/brand/galatayo-logo-loader.png"
            alt=""
            className="welcome-loader__logo"
            width={420}
            height={180}
            fetchPriority="high"
            decoding="async"
          />
        </picture>
      </div>
    </div>
  )
}

type WelcomePageProps = {
  navigationSource?: NavigationSource
}

function WelcomePage({ navigationSource = 'push' }: WelcomePageProps) {
  const [useWebp] = useState(() => supportsWebp())
  const [heroSrc, setHeroSrc] = useState(() => getWelcomeHeroSrc(useWebp))
  const [preloadSrc, setPreloadSrc] = useState(() => getPreloadSrc(useWebp))
  const [isReady, setIsReady] = useState(false)
  const hasRevealedRef = useRef(false)
  const activeSources = useMemo(() => getSources(useWebp), [useWebp])

  const loadingMinMs = useMemo(() => {
    if (navigationSource === 'pop') return WELCOME_LOADING_BACK_NAV_MIN_MS
    return WELCOME_LOADING_MIN_MS
  }, [navigationSource])

  useEffect(() => {
    const criticalLoader = document.getElementById('critical-welcome-loader')
    if (!criticalLoader) {
      return
    }

    criticalLoader.classList.toggle('is-hidden', isReady)
  }, [isReady])

  useEffect(() => {
    let animationFrameId = 0

    const updateHeroSrc = () => {
      if (hasRevealedRef.current) {
        return
      }

      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = window.requestAnimationFrame(() => {
        const next = getWelcomeHeroSrc(useWebp)
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

    setIsReady(false)

    const revealWhenAllowed = () => {
      if (!isCancelled) {
        hasRevealedRef.current = true
        setIsReady(true)
      }
    }

    const imageReadyPromise = waitForWelcomeHeroReady(preloadSrc)
    const minimumDelayPromise = waitForDuration(loadingMinMs, timeoutIds)

    void Promise.all([imageReadyPromise, minimumDelayPromise])
      .then(revealWhenAllowed)
      .catch(() => {})

    return () => {
      isCancelled = true
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
    }
  }, [preloadSrc, loadingMinMs])

  const handleStartExploring = () => {
    navigateToPath('/home')
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
            <FontAwesomeIcon icon={faArrowRight} className="welcome-page__button-icon" aria-hidden="true" />
          </button>
        </section>
        {!isReady && <WelcomeLoader />}
      </main>
    </>
  )
}

export default WelcomePage
