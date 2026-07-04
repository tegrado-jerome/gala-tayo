import AppHeader from '../components/AppHeader'
import InternalLink from '../components/InternalLink'
import { AppIcon, type AppIconName } from '../components/AppIcon'
import askAiOverviewChibi from '../assets/chibis/core/ask-ai/chibi-ai-overview.webp'

type ToolCardProps = {
  href: string
  title: string
  description: string
  icon: AppIconName
}

function ToolCard({ href, title, description, icon }: ToolCardProps) {
  return (
    <InternalLink
      href={href}
      className="group relative isolate flex items-center gap-3 overflow-hidden rounded-[20px] bg-[linear-gradient(135deg,#1e3a8a_0%,#2563eb_45%,#06b6d4_100%)] p-[1.25px] shadow-[0_8px_24px_-8px_rgba(30,58,138,0.35)] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_22px_44px_-10px_rgba(30,58,138,0.5)] sm:gap-3.5"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-1 -z-10 rounded-[22px] bg-[linear-gradient(135deg,#1e3a8a_0%,#2563eb_45%,#06b6d4_100%)] opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-60"
      />

      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[20px] opacity-[0.55] [background:conic-gradient(from_0deg,transparent_0deg,rgba(56,189,248,0.55)_30deg,transparent_60deg,rgba(125,211,252,0.6)_120deg,transparent_180deg,rgba(59,130,246,0.5)_240deg,transparent_300deg)] [animation:gala-ai-border-spin_6s_linear_infinite]"
      />

      <div className="relative flex w-full items-center gap-3 overflow-hidden rounded-[18.75px] bg-[linear-gradient(180deg,#ffffff_0%,#f7faff_100%)] px-4 py-3.5 sm:gap-3.5 sm:px-5 sm:py-4">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(30,58,138,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(30,58,138,0.6)_1px,transparent_1px)] [background-size:18px_18px]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
        />

        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 [background:linear-gradient(100deg,transparent_0%,rgba(255,255,255,0)_30%,rgba(255,255,255,0.85)_50%,rgba(255,255,255,0)_70%,transparent_100%)] [animation:gala-ai-shine-sweep_5.5s_ease-in-out_infinite] group-hover:[animation-duration:1.8s]"
        />

        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-[18%] top-[28%] h-1 w-1 rounded-full bg-sky-300 [filter:drop-shadow(0_0_4px_rgba(125,211,252,0.9))] [animation:gala-ai-sparkle-twinkle_3.2s_ease-in-out_infinite]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-[8%] top-[58%] h-0.5 w-0.5 rounded-full bg-cyan-300 [filter:drop-shadow(0_0_3px_rgba(103,232,249,0.9))] [animation:gala-ai-sparkle-twinkle_2.4s_ease-in-out_infinite_0.6s]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-[34%] bottom-[22%] h-0.5 w-0.5 rounded-full bg-blue-300 [filter:drop-shadow(0_0_3px_rgba(147,197,253,0.9))] [animation:gala-ai-sparkle-twinkle_2.8s_ease-in-out_infinite_1.2s]"
        />

        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center sm:h-12 sm:w-12">
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-2xl bg-[linear-gradient(135deg,#1e3a8a_0%,#2563eb_55%,#06b6d4_100%)] shadow-[0_8px_20px_-6px_rgba(37,99,235,0.55)] transition-transform duration-300 ease-out group-hover:scale-[1.06] group-hover:shadow-[0_12px_28px_-6px_rgba(37,99,235,0.7)]"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 overflow-hidden rounded-2xl"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 -left-1/2 w-[200%] [background:linear-gradient(100deg,transparent_0%,rgba(255,255,255,0)_35%,rgba(255,255,255,0.6)_50%,rgba(255,255,255,0)_65%,transparent_100%)] [animation:gala-ai-icon-shine_3.5s_ease-in-out_infinite]"
            />
          </span>
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_28%_22%,rgba(255,255,255,0.5),transparent_55%)]"
          />
          <span className="absolute right-1 top-1 z-20 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)] ring-2 ring-white/80" />
          <AppIcon
            name={icon}
            className="relative z-10 h-5 w-5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)] sm:h-6 sm:w-6"
          />
        </span>

        <div className="relative z-10 flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5">
            <p className="text-[15px] font-black tracking-[-0.01em] text-slate-900 sm:text-base">
              {title}
            </p>
            <span className="inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-[#1e3a8a]/10 to-[#06b6d4]/15 px-1.5 py-px text-[9px] font-black uppercase tracking-[0.08em] text-[#1e3a8a] ring-1 ring-inset ring-[#1e3a8a]/15">
              <AppIcon name="sparkles" className="h-2.5 w-2.5" />
              AI
            </span>
          </div>
          <p className="mt-0.5 text-[11.5px] leading-[1.5] text-slate-500 sm:text-[12.5px]">
            {description}
          </p>
        </div>

        <span className="relative z-10 hidden shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-slate-50 to-slate-100/80 px-2.5 py-1.5 text-[10.5px] font-bold tracking-wide text-[#1e3a8a] ring-1 ring-inset ring-slate-200/80 transition-all duration-300 ease-out group-hover:from-[#1e3a8a] group-hover:to-[#2563eb] group-hover:text-white group-hover:ring-transparent group-hover:shadow-[0_6px_14px_-2px_rgba(30,58,138,0.45)] sm:inline-flex">
          <span>Open</span>
          <AppIcon
            name="chevronRight"
            className="h-3.5 w-3.5 transition-transform duration-300 ease-out group-hover:translate-x-0.5"
          />
        </span>

        <span className="relative z-10 flex shrink-0 text-slate-300 transition-colors duration-300 group-hover:text-[#1e3a8a] sm:hidden">
          <AppIcon name="chevronRight" className="h-4 w-4" />
        </span>
      </div>
    </InternalLink>
  )
}

function AskAiOverviewPage() {
  return (
    <div className="gala-page-background flex min-h-[100dvh] flex-col text-[var(--text)]">
      <div className="shrink-0">
        <AppHeader minimal />
      </div>

      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col px-4 pt-4 sm:px-6 sm:pt-5 md:max-w-[1140px] md:pt-7 lg:px-8 lg:pt-9 xl:max-w-[1200px] xl:px-10">
        <section className="shrink-0">
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
        </section>

        <div className="mt-4 shrink-0 border-t border-[var(--line)] pt-4 sm:mt-5">
          <p className="inline-flex items-center gap-1.5 text-sm font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">
            <AppIcon name="wrench" className="h-4 w-4" />
            <span>Choose a tool</span>
          </p>
        </div>

        <div className="mt-2 shrink-0 grid grid-cols-1 gap-2 sm:mt-3 sm:grid-cols-2 sm:gap-3 lg:mt-4 lg:gap-5">
          <ToolCard
            href="/ask-ai/chatbot"
            title="Chatbot AI"
            description="Ask questions, plan ideas, and get quick help."
            icon="bot"
          />

          <ToolCard
            href="/ask-ai/maps"
            title="Maps AI"
            description="Find places with an AI-powered map."
            icon="map"
          />
        </div>

        <div className="mt-4 flex flex-col items-center justify-center pb-4 text-center sm:mt-5">
          <div className="flex w-full max-w-[360px] items-start justify-center">
            <img
              src={askAiOverviewChibi}
              alt=""
              className="max-h-[36dvh] w-auto max-w-full object-contain md:max-h-[44dvh] lg:max-h-[48dvh]"
              loading="eager"
              onError={(e) => {
                const el = e.currentTarget
                el.style.display = 'none'
              }}
            />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-deep)]">
            Quick tip
          </p>
          <p className="mt-1 max-w-[22rem] text-[13px] leading-6 text-[var(--muted)]">
            Use <span className="font-semibold text-[var(--text-main)]">Chatbot AI</span> to plan your Gala, otherwise use{' '}
            <span className="font-semibold text-[var(--text-main)]">Maps AI</span> to look for specific places in a Map interface.
          </p>
        </div>
      </main>
    </div>
  )
}

export default AskAiOverviewPage
