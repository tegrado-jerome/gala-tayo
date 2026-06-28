import type { Session } from '@supabase/supabase-js'
import { AppIcon } from '../components/AppIcon'
import WelcomeBackgroundDecorations from '../components/WelcomeBackgroundDecorations'
import { navigateToPath } from '../utils/navigation'
import welcomeChibi from '../assets/chibis/public/chibi-welcome-page.webp'
import galaTayoLogo from '../assets/brand/galatayo-logo.webp'

type WelcomePageProps = {
  session?: Session | null
}

function getWelcomeCtaLabel(session: Session | null | undefined) {
  return session ? 'Start exploring!' : 'Explore as guest'
}

function WelcomePage({ session = null }: WelcomePageProps) {
  const isLoggedIn = Boolean(session?.user)
  const primaryCtaLabel = getWelcomeCtaLabel(session)
  const primaryCtaIcon = isLoggedIn ? 'place' : 'compass'

  return (
    <main className="gala-page-background relative min-h-screen overflow-hidden text-[var(--text)]">
      <WelcomeBackgroundDecorations />

      <section className="relative z-[2] mx-auto flex min-h-screen w-full max-w-[980px] items-center justify-center px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-6">
        <div className="relative z-[2] w-full max-w-[720px] px-2 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-4">
          <div className="pointer-events-none absolute inset-x-[18%] top-[18%] h-[22rem] rounded-full bg-[var(--accent-wash)] opacity-70 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-40 bg-[var(--primary-soft)] opacity-40 blur-3xl" />

          <div className="relative z-[2] mx-auto flex max-w-[560px] flex-col items-center gap-4 text-center sm:gap-5 lg:gap-4">
            <div className="flex flex-col items-center gap-4 sm:gap-5 lg:gap-4">
          <img
            src={galaTayoLogo}
            alt="GalaTayo"
                className="relative -top-12 h-auto w-[190px] sm:-top-16 sm:w-[220px] lg:-top-20 lg:w-[235px]"
            loading="eager"
          />

              <div className="relative mx-auto w-full max-w-[700px] overflow-visible sm:max-w-[710px] lg:max-w-[620px]">
                <div className="pointer-events-none absolute right-[10%] bottom-[20%] h-8 w-8 text-[var(--accent)] opacity-50 sm:h-9 sm:w-9">
                  <AppIcon name="compass" className="h-full w-full" />
                </div>

                <div className="absolute inset-x-[13%] top-[14%] h-[74%] rounded-full bg-[var(--accent-wash)] opacity-80 blur-3xl" />
            <img
              src={welcomeChibi}
              alt="GalaTayo chibi travel illustration"
                  className="relative mx-auto w-full max-w-[690px] scale-[1.2] object-contain sm:max-w-[710px] sm:scale-[1.14] lg:max-w-[560px] lg:scale-[1]"
            />
          </div>
            </div>

            <div className="mt-10 max-w-[13ch] text-[2.65rem] font-bold leading-[0.94] tracking-[-0.055em] text-[var(--text-main)] sm:mt-12 sm:max-w-none sm:text-[3.75rem] lg:mt-14 lg:text-[3.7rem]">
            <span className="block">Saan tayo</span>
              <span className="block whitespace-nowrap">gagala today?</span>
          </div>

            <p className="max-w-[29rem] text-[1.02rem] leading-7 text-[var(--muted)] sm:text-[1.18rem] sm:leading-8 lg:max-w-[26rem] lg:text-[1.05rem] lg:leading-7">
              Discover cute, chill, and sulit gala spots around Metro Manila.
            </p>

            <div className="flex w-full max-w-[220px] flex-col gap-3 sm:max-w-[360px] sm:gap-4 lg:max-w-[270px]">
            <button
              type="button"
              onClick={() => navigateToPath('/home')}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-base font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--accent-deep)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)] sm:min-h-14 sm:gap-2.5 sm:px-6 sm:text-lg lg:min-h-12 lg:text-base"
            >
                  <span className="h-5 w-5 sm:h-6 sm:w-6">
                    <AppIcon name={primaryCtaIcon} className="h-full w-full" />
              </span>
                  {primaryCtaLabel}
            </button>

              {!isLoggedIn ? (
                <button
                  type="button"
                  onClick={() => navigateToPath('/login')}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-5 text-base font-semibold text-[var(--text-main)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--bg-soft)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)] sm:min-h-14 sm:gap-2.5 sm:px-6 sm:text-lg lg:min-h-12 lg:text-base"
                >
                  <span className="h-5 w-5 sm:h-6 sm:w-6">
                    <AppIcon name="email" className="h-full w-full" />
                  </span>
                  Log in
                </button>
              ) : null}
            </div>

            {!isLoggedIn ? (
              <p className="text-base text-[var(--muted)] sm:text-lg lg:text-base">
                New here?{' '}
                <button
                  type="button"
                  onClick={() => navigateToPath('/signup')}
                  className="font-semibold text-[var(--accent)] transition-colors hover:text-[var(--accent-deep)] focus:outline-none focus:underline"
                >
                  Sign up
                </button>
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}

export default WelcomePage
