import { House } from 'lucide-react'
import InternalLink from '../components/InternalLink'
import Breadcrumb from '../components/Breadcrumb'
import { PageContainer, PageShell } from '../components/layout/ResponsiveLayouts'
import { AppIcon, type AppIconName } from '../components/AppIcon'

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
      className="group flex items-center gap-3 rounded-[22px] border border-[var(--line)] bg-white px-4 py-4 text-left shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_30px_rgba(15,23,42,0.06)] sm:gap-3.5 sm:px-5 sm:py-4"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-[var(--accent-deep)] ring-1 ring-inset ring-slate-200/80 transition-colors duration-300 group-hover:bg-[var(--accent-wash)] group-hover:ring-[rgba(47,116,232,0.16)]">
        <AppIcon
          name={icon}
          className="h-5 w-5 sm:h-[1.15rem] sm:w-[1.15rem]"
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[0.96rem] font-bold tracking-[-0.02em] text-slate-950 sm:text-[1.02rem]">
            {title}
          </p>
          <span className="inline-flex items-center rounded-full bg-[var(--accent-wash)] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-[var(--accent-deep)]">
            AI
          </span>
        </div>
        <p className="mt-1 text-[12.5px] leading-5 text-slate-500 sm:text-[13px]">
          {description}
        </p>
      </div>

      <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold tracking-wide text-slate-400 transition-colors duration-300 group-hover:text-[var(--accent-deep)]">
        <span className="hidden sm:inline">Open</span>
        <AppIcon
          name="chevronRight"
          className="h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-0.5"
        />
      </span>
    </InternalLink>
  )
}

function AskAiOverviewPage() {
  return (
    <PageShell>
      <main className="flex w-full flex-1 items-start justify-start pt-10 pb-4 sm:py-6 lg:py-8">
        <PageContainer
          size="full"
          className="px-4 sm:px-6 lg:px-8 xl:px-10"
        >
          <div className="flex w-full flex-col items-start text-left">
            <div className="mb-5 hidden w-full text-left sm:mb-6 lg:block">
              <Breadcrumb
                showBack
                items={[
                  { label: 'Home', href: '/home', icon: <House className="h-3.5 w-3.5" /> },
                  { label: 'Ask AI', icon: <AppIcon name="askAi" className="h-3.5 w-3.5" /> },
                ]}
              />
            </div>

            <section className="flex w-full max-w-[40rem] flex-col items-start md:max-w-[48rem] lg:max-w-[56rem]">
              <div className="inline-flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-[0.16em] text-[var(--accent-deep)] sm:text-[11px]">
                <AppIcon name="askAi" className="h-3.5 w-3.5" />
                <span>Ask AI</span>
              </div>

              <h1 className="mt-2 text-[2rem] font-black leading-[1.02] tracking-[-0.05em] text-slate-950 sm:text-[2.35rem] lg:text-[2.55rem]">
                How can GalaTayo AI help?
              </h1>

              <p className="mt-3 max-w-[32rem] text-[14.5px] leading-7 text-[var(--muted)] sm:text-[15px]">
                Chat with AI or discover places around you.
              </p>

              <div className="mt-5 flex w-full items-center gap-2 sm:mt-6">
                <span className="inline-flex items-center rounded-full bg-[var(--accent-wash)] px-2.5 py-1 text-[10.5px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">
                  Choose a tool
                </span>
                <span className="h-px flex-1 bg-[var(--line)]" aria-hidden="true" />
              </div>
            </section>

            <div className="mt-4 grid w-full gap-3 text-left sm:mt-5 sm:gap-3.5 md:grid-cols-2 md:gap-4 lg:mt-6 lg:gap-5 xl:gap-6">
              <ToolCard
                href="/ask-ai/chatbot"
                title="Chatbot AI"
                description="Ask gala questions and plan ideas."
                icon="bot"
              />

              <ToolCard
                href="/ask-ai/maps"
                title="Maps AI"
                description="Find places with an AI-powered map."
                icon="map"
              />
            </div>
          </div>
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default AskAiOverviewPage
