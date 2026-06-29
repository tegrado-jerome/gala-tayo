import AppHeader from '../components/AppHeader'
import InternalLink from '../components/InternalLink'
import { AppIcon } from '../components/AppIcon'
import askAiOverviewChibi from '../assets/chibis/core/ask-ai/chibi-ai-overview.webp'

function AskAiOverviewPage() {
  return (
    <div className="gala-page-background flex h-[100dvh] flex-col overflow-hidden overscroll-none text-[var(--text)]">
      <AppHeader minimal />

      <main className="mx-auto w-full max-w-[1080px] px-4 pb-10 pt-4 sm:px-6 sm:pt-5 lg:px-8">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">
              <AppIcon name="askAi" className="h-3.5 w-3.5" />
              <span>Ask AI</span>
            </div>

            <h1 className="mt-1 text-[2rem] font-black leading-[1.05] tracking-[-0.04em] text-slate-950 sm:text-[2.35rem]">
              How can GalaTayo AI help?
            </h1>

            <p className="mt-2 max-w-[30rem] text-[15px] leading-7 text-[#6b7280]">
              Chat with AI or discover places around you.
            </p>
          </div>

          <div
            className="flex shrink-0 justify-center sm:justify-end"
            aria-hidden="true"
          >
            <img
              src={askAiOverviewChibi}
              alt=""
              className="h-[260px] w-auto object-contain sm:h-[340px]"
              loading="eager"
              onError={(e) => {
                const el = e.currentTarget
                el.style.display = 'none'
              }}
            />
          </div>
        </section>

        <div className="mt-7 border-t border-[var(--line)] pt-5 sm:mt-8">
          <p className="inline-flex items-center gap-1.5 text-sm font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">
            <AppIcon name="wrench" className="h-4 w-4" />
            <span>Choose a tool</span>
          </p>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <InternalLink
            href="/ask-ai/chatbot"
            className="group flex items-center gap-3 rounded-[18px] border border-slate-200/90 bg-[linear-gradient(180deg,#ffffff,#f9fbff)] px-4 py-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5 hover:border-[rgba(47,116,232,0.18)] hover:shadow-[0_10px_22px_rgba(30,58,138,0.08)] sm:gap-3.5 sm:px-5 sm:py-4"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent-deep)] transition group-hover:bg-[var(--accent-soft)] sm:h-10 sm:w-10">
              <AppIcon name="bot" className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>

            <div className="flex min-w-0 flex-1 flex-col">
              <p className="text-sm font-black text-slate-900 sm:text-base">
                Chatbot AI
              </p>
              <p className="mt-0.5 text-[11.5px] leading-[1.5] text-slate-500 sm:text-[12.5px]">
                Ask questions, plan ideas, and get quick help.
              </p>
            </div>

            <span className="hidden items-center gap-1 shrink-0 text-[11px] font-semibold text-slate-300 transition group-hover:text-[var(--accent)] sm:flex">
              Open
              <AppIcon name="chevronRight" className="h-3.5 w-3.5" />
            </span>

            <span className="flex shrink-0 text-slate-300 transition group-hover:text-[var(--accent)] sm:hidden">
              <AppIcon name="chevronRight" className="h-4 w-4" />
            </span>
          </InternalLink>

          <InternalLink
            href="/ask-ai/maps"
            className="group flex items-center gap-3 rounded-[18px] border border-slate-200/90 bg-[linear-gradient(180deg,#ffffff,#f9fbff)] px-4 py-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5 hover:border-[rgba(47,116,232,0.18)] hover:shadow-[0_10px_22px_rgba(30,58,138,0.08)] sm:gap-3.5 sm:px-5 sm:py-4"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent-deep)] transition group-hover:bg-[var(--accent-soft)] sm:h-10 sm:w-10">
              <AppIcon name="map" className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>

            <div className="flex min-w-0 flex-1 flex-col">
              <p className="text-sm font-black text-slate-900 sm:text-base">
                Maps AI
              </p>
              <p className="mt-0.5 text-[11.5px] leading-[1.5] text-slate-500 sm:text-[12.5px]">
                Find places with an AI-powered map.
              </p>
            </div>

            <span className="hidden items-center gap-1 shrink-0 text-[11px] font-semibold text-slate-300 transition group-hover:text-[var(--accent)] sm:flex">
              Open
              <AppIcon name="chevronRight" className="h-3.5 w-3.5" />
            </span>

            <span className="flex shrink-0 text-slate-300 transition group-hover:text-[var(--accent)] sm:hidden">
              <AppIcon name="chevronRight" className="h-4 w-4" />
            </span>
          </InternalLink>
        </div>
      </main>
    </div>
  )
}

export default AskAiOverviewPage
