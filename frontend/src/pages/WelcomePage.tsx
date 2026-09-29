import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRight } from '@fortawesome/free-solid-svg-icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import SeoHead from '../components/SeoHead'
import { navigateToPath } from '../utils/navigation'
import type { NavigationSource } from '../utils/navigationLoading'
import { getPublicSiteOrigin } from '../utils/site'
import { BRAND_NAME, PRODUCT_NAME } from '../utils/seoLandingPages'

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

let initialWelcomeStartConsumed = false

function consumeInitialWelcomeStart(): number {
  const w = window as unknown as Record<string, unknown>
  if (!initialWelcomeStartConsumed && w.__galatayoWelcomeStart && w.__galatayoWelcomeStartUsed === false) {
    initialWelcomeStartConsumed = true
    w.__galatayoWelcomeStartUsed = true
    return w.__galatayoWelcomeStart as number
  }
  return Date.now()
}

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
  const [isReady, setIsReady] = useState(false)
  const [timeReady, setTimeReady] = useState(false)
  const [imageReady, setImageReady] = useState(false)
  const hasRevealedRef = useRef(false)
  const heroImgRef = useRef<HTMLImageElement>(null)
  const activeSources = useMemo(() => getSources(useWebp), [useWebp])
  const startTimeRef = useRef(consumeInitialWelcomeStart())

  useEffect(() => {
    if (!isReady) return
    const w = window as unknown as Record<string, (() => void) | undefined>
    if (typeof w.__galatayoSetWelcomeReady === 'function') {
      w.__galatayoSetWelcomeReady()
    }
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
    if (hasRevealedRef.current) {
      return
    }

    setIsReady(false)
    setTimeReady(false)

    const elapsedMs = Date.now() - startTimeRef.current
    const remainingMs = Math.max(0, WELCOME_LOADING_MIN_MS - elapsedMs)
    const timeoutId = window.setTimeout(() => {
      setTimeReady(true)
    }, remainingMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [startTimeRef])

  useEffect(() => {
    if (hasRevealedRef.current) {
      return
    }

    setImageReady(false)
  }, [heroSrc])

  useEffect(() => {
    if (hasRevealedRef.current) {
      return
    }

    const img = heroImgRef.current
    if (!img) {
      return
    }

    if (img.complete) {
      if (typeof img.decode === 'function') {
        img.decode().then(() => setImageReady(true)).catch(() => setImageReady(true))
      } else {
        setImageReady(true)
      }
    }
  }, [heroSrc])

  useEffect(() => {
    if (!timeReady || !imageReady || hasRevealedRef.current) {
      return
    }

    hasRevealedRef.current = true
    setIsReady(true)
  }, [timeReady, imageReady])

  const handleStartExploring = () => {
    navigateToPath('/home')
  }

  return (
    <>
      <SeoHead
        title={`Discover Metro Manila Places and Gala Ideas | ${BRAND_NAME}`}
        description={`${BRAND_NAME} helps you discover Metro Manila places by city, category, budget, and vibe, with AI help to plan your next gala.`}
        robots="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
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
            name: PRODUCT_NAME,
            url: `${getPublicSiteOrigin()}/`,
            potentialAction: {
              '@type': 'SearchAction',
              target: `${getPublicSiteOrigin()}/search?q={search_term_string}`,
              'query-input': 'required name=search_term_string',
            },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: BRAND_NAME,
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
            ref={heroImgRef}
            src={heroSrc}
            alt="Two people looking over the city skyline at sunset."
            className="welcome-page__image"
            width={1440}
            height={2560}
            loading="eager"
            fetchPriority="high"
            sizes="100vw"
            onLoad={() => {
              const img = heroImgRef.current
              if (img && typeof img.decode === 'function') {
                img.decode().then(() => setImageReady(true)).catch(() => setImageReady(true))
              } else {
                setImageReady(true)
              }
            }}
            onError={() => setImageReady(true)}
          />
        </picture>

        <div className="welcome-page__overlay" />
        <section className="welcome-page__content" aria-hidden={!isReady}>
          <div className="welcome-page__copy">
            <h1 className="welcome-page__title">
              <span className="welcome-page__title-line">Your next</span>
              <span className="welcome-page__title-line">Metro Manila</span>
              <span className="welcome-page__title-line">gala starts here.</span>
            </h1>
            <p className="welcome-page__description">
              Discover places, date spots, cafes, and local ideas with GalaTayo.
            </p>
          </div>
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
