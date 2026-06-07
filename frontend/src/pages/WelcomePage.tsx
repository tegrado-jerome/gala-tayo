import { navigateToPath } from '../utils/navigation'

const placeholderArt =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 650" role="img" aria-label="Chibi travel placeholder">
      <rect width="900" height="650" fill="white"/>
      <g fill="none" stroke="#222" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M64 430c92-76 198-28 290-70 98-45 106-166 232-186 90-14 154 30 240 8"/>
        <path d="M120 124h82M144 98c18 0 24 14 24 26M182 106c18 0 26 10 26 18"/>
        <path d="M650 96h118M684 66c24 0 36 18 36 30M734 76c24 0 34 14 34 20"/>
        <path d="M638 210c70-44 182-48 220 2 32 44 6 106-52 120H660l-70 38 22-58c-34-36-24-80 26-102Z"/>
        <path d="M704 268h188M724 308h126"/>
        <path d="M340 260c-36-28-28-96 42-112 70-16 120 20 128 70 8 54-28 98-78 106-34 6-66-4-92-24"/>
        <circle cx="392" cy="234" r="12"/>
        <circle cx="466" cy="232" r="12"/>
        <path d="M412 272c22 18 42 18 62 0"/>
        <path d="M336 350c22-42 124-44 154 0l26 118H316l20-118Z"/>
        <path d="M358 468v86M484 468v86M350 560h74M466 560h74"/>
        <path d="M308 360l-62 60M512 358l72 46"/>
        <path d="M584 406l74-34 86 54-78 40-82-60Z"/>
        <path d="M620 450v78h192v-88l-70-48h-96"/>
        <circle cx="672" cy="540" r="26"/>
        <circle cx="786" cy="540" r="26"/>
        <path d="M120 248c0-28 24-50 52-50s52 22 52 50c0 46-52 98-52 98s-52-52-52-98Z"/>
        <circle cx="172" cy="248" r="18"/>
        <path d="M84 520c0-28 24-50 52-50s52 22 52 50c0 46-52 98-52 98s-52-52-52-98Z"/>
        <circle cx="136" cy="520" r="18"/>
      </g>
    </svg>
  `)

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
              onClick={() => navigateToPath('/login')}
              className="mt-4 text-lg font-medium leading-none text-black underline decoration-2 underline-offset-4 transition hover:text-black/70 focus:outline-none focus:ring-4 focus:ring-black/15 sm:text-xl lg:text-xl"
            >
              Log in
            </button>
          </div>
        </div>

        <div className="order-1 flex min-h-[44vh] w-full items-end justify-center pt-0 lg:order-2 lg:min-h-0 lg:items-center">
          <div className="relative w-full max-w-[700px] lg:max-w-[780px] xl:max-w-[840px]">
            <div className="absolute right-[1%] top-[7%] z-10 rounded-[28px] border-[3px] border-black/62 bg-white px-6 py-5 text-center text-[22px] font-black leading-tight shadow-[0_10px_24px_rgba(0,0,0,0.08)] sm:text-[30px] lg:right-[5%] lg:top-[2%] lg:rounded-[38px] lg:px-8 lg:py-6 lg:text-[32px]">
              Saan tayo
              <br />
              gala today?
            </div>
            <img
              src={placeholderArt}
              alt="Placeholder for the GalaTayo chibi travel illustration"
              className="mx-auto block aspect-[900/650] w-full max-w-[700px] object-contain grayscale lg:max-w-[840px]"
            />
          </div>
        </div>
      </section>
    </main>
  )
}

export default WelcomePage
