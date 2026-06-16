import { navigateToPath } from '../utils/navigation'
import welcomeChibi from '../assets/chibis/public/chibi-welcome-page.webp'

function WelcomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-white text-black">
      <section className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-7 pb-9 pt-3 sm:px-10 lg:grid lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-14 lg:px-24 lg:py-16">
        <div className="order-2 mx-auto flex w-full max-w-[660px] flex-col items-center text-center lg:order-1 lg:mx-0 lg:items-start lg:text-left">
          <h1 className="hidden max-w-[690px] text-[86px] font-black leading-[0.98] tracking-normal xl:text-[96px] lg:block">
            Saan tayo gagala today?
          </h1>

          <p className="mt-8 max-w-[560px] text-2xl font-semibold leading-[1.35] text-black/72 sm:text-[28px] lg:mt-10 lg:text-[34px] lg:font-medium">
            Discover cute, chill, and sulit places around Metro Manila.
          </p>

          <div className="mt-8 flex w-full max-w-[420px] flex-col items-center lg:mt-12">
            <button
              type="button"
              onClick={() => navigateToPath('/search')}
              className="h-16 w-[82%] max-w-[320px] rounded-[20px] bg-black px-6 text-[20px] font-extrabold leading-none text-white shadow-[0_18px_36px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:bg-black/86 focus:outline-none focus:ring-4 focus:ring-black/20 active:translate-y-0 sm:h-[72px] sm:max-w-[360px] sm:text-[24px] lg:h-[72px] lg:w-[360px] lg:rounded-[14px] lg:text-[24px]"
            >
              Start exploring
            </button>
            <p className="mt-7 text-base font-medium text-black/62 sm:text-xl lg:text-lg">
              Already have an account?
            </p>
            <button
              type="button"
              onClick={() => navigateToPath('/auth')}
              className="mt-4 text-lg font-medium leading-none text-black underline decoration-2 underline-offset-4 transition hover:text-black/70 focus:outline-none focus:ring-4 focus:ring-black/15 sm:text-xl lg:text-xl"
            >
              Log in
            </button>
            <p className="mt-7 text-base font-medium text-black/62 sm:text-xl lg:text-lg">
              Don&apos;t have an account?
            </p>
            <button
              type="button"
              onClick={() => navigateToPath('/signup')}
              className="mt-4 text-lg font-medium leading-none text-black underline decoration-2 underline-offset-4 transition hover:text-black/70 focus:outline-none focus:ring-4 focus:ring-black/15 sm:text-xl lg:text-xl"
            >
              Sign up
            </button>
          </div>
        </div>

        <div className="order-1 flex min-h-[44vh] w-full items-end justify-center pt-0 lg:order-2 lg:min-h-0 lg:items-center">
          <div className="relative w-full max-w-[700px] lg:max-w-[780px] xl:max-w-[840px]">
            <img
              src={welcomeChibi}
              alt="GalaTayo chibi travel illustration"
              className="mx-auto block aspect-[900/650] w-full max-w-[700px] object-contain lg:max-w-[840px]"
            />
          </div>
        </div>
      </section>
    </main>
  )
}

export default WelcomePage
