import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHouse } from '@fortawesome/free-solid-svg-icons'
import InternalLink from '../components/InternalLink'
import Breadcrumb from '../components/navigation/Breadcrumb'
import { PageContainer, PageShell } from '../components/layout/ResponsiveLayouts'
import { AppIcon, type AppIconName } from '../components/AppIcon'
import { useTheme } from '../context/ThemeContext'

type ToolCardProps = {
  href: string
  title: string
  description: string
  icon: AppIconName
  isDarkMode: boolean
}

function ToolCard({ href, title, description, icon, isDarkMode }: ToolCardProps) {
  const cardClassName = isDarkMode
    ? 'group flex items-center gap-3 rounded-[22px] border border-[rgba(148,163,184,0.16)] bg-[rgba(27, 26, 23, 0.8)] px-4 py-4 text-left shadow-[0_10px_24px_rgba(0, 0, 0, 0.28)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-[rgba(var(--accent-rgb), 0.28)] hover:shadow-[0_16px_30px_rgba(0, 0, 0, 0.34)] sm:gap-3.5 sm:px-5 sm:py-4 md:gap-3 md:px-4 md:py-3.5'
    : 'group flex items-center gap-3 rounded-[22px] border border-[var(--line)] bg-white px-4 py-4 text-left shadow-[0_10px_24px_rgba(27, 26, 23, 0.04)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_30px_rgba(27, 26, 23, 0.06)] sm:gap-3.5 sm:px-5 sm:py-4 md:gap-3 md:px-4 md:py-3.5'
  const iconWrapClassName = isDarkMode
    ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgba(var(--accent-rgb), 0.18)] text-[var(--primary-dark)] ring-1 ring-inset ring-[rgba(var(--accent-rgb), 0.14)] transition-colors duration-300 group-hover:bg-[rgba(var(--accent-rgb), 0.28)] group-hover:ring-[rgba(var(--accent-rgb), 0.22)] md:h-10 md:w-10'
    : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-[var(--accent-deep)] ring-1 ring-inset ring-slate-200/80 transition-colors duration-300 group-hover:bg-[var(--accent-wash)] group-hover:ring-[rgba(47,116,232,0.16)] md:h-10 md:w-10'
  const titleClassName = isDarkMode
    ? 'truncate text-[0.96rem] font-bold tracking-[-0.02em] text-[#f3f7ff] sm:text-[1.02rem] md:text-[0.96rem]'
    : 'truncate text-[0.96rem] font-bold tracking-[-0.02em] text-slate-950 sm:text-[1.02rem] md:text-[0.96rem]'
  const descriptionClassName = isDarkMode
    ? 'mt-1 text-[12.5px] leading-5 text-[#9fb4cf] sm:text-[13px] md:text-[12.5px]'
    : 'mt-1 text-[12.5px] leading-5 text-slate-500 sm:text-[13px] md:text-[12.5px]'
  const openClassName = isDarkMode
    ? 'flex shrink-0 items-center gap-1 text-[11px] font-semibold tracking-wide text-[#7f94b1] transition-colors duration-300 group-hover:text-[var(--primary-dark)]'
    : 'flex shrink-0 items-center gap-1 text-[11px] font-semibold tracking-wide text-slate-400 transition-colors duration-300 group-hover:text-[var(--accent-deep)]'

  return (
    <InternalLink
      href={href}
      className={cardClassName}
    >
      <span className={iconWrapClassName}>
        <AppIcon
          name={icon}
          className="h-5 w-5 sm:h-[1.15rem] sm:w-[1.15rem] md:h-5 md:w-5"
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className={titleClassName}>
            {title}
          </p>
          <span className={isDarkMode ? 'inline-flex items-center rounded-full bg-[rgba(var(--accent-rgb), 0.22)] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-[var(--primary-dark)]' : 'inline-flex items-center rounded-full bg-[var(--accent-wash)] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-[var(--accent-deep)]'}>
            AI
          </span>
        </div>
        <p className={descriptionClassName}>
          {description}
        </p>
      </div>

      <span className={openClassName}>
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
  const { resolvedTheme } = useTheme()
  const isDarkMode = resolvedTheme === 'dark'
  const pageShellClassName = isDarkMode
    ? 'bg-[linear-gradient(180deg,#141311_0%,#1a1916_100%)] text-[#eef4ff]'
    : 'bg-[var(--bg)] text-[var(--text)]'
  const eyebrowClassName = isDarkMode
    ? 'inline-flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-[0.16em] text-[var(--primary-dark)] sm:text-[11px]'
    : 'inline-flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-[0.16em] text-[var(--accent-deep)] sm:text-[11px]'
  const headingClassName = isDarkMode
    ? 'mt-2 text-[2rem] font-black leading-[1.02] tracking-[-0.05em] text-[#f3f7ff] sm:text-[2.35rem] lg:text-[2.55rem]'
    : 'mt-2 text-[2rem] font-black leading-[1.02] tracking-[-0.05em] text-slate-950 sm:text-[2.35rem] lg:text-[2.55rem]'
  const descriptionClassName = isDarkMode
    ? 'mt-3 max-w-[32rem] text-[14.5px] leading-7 text-[#9cb0c9] sm:text-[15px]'
    : 'mt-3 max-w-[32rem] text-[14.5px] leading-7 text-[var(--muted)] sm:text-[15px]'
  const pillClassName = isDarkMode
    ? 'inline-flex items-center rounded-full bg-[rgba(var(--accent-rgb), 0.22)] px-2.5 py-1 text-[10.5px] font-black uppercase tracking-[0.14em] text-[var(--primary-dark)]'
    : 'inline-flex items-center rounded-full bg-[var(--accent-wash)] px-2.5 py-1 text-[10.5px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]'
  const dividerClassName = isDarkMode ? 'h-px flex-1 bg-[rgba(148,163,184,0.16)]' : 'h-px flex-1 bg-[var(--line)]'

  return (
    <PageShell>
      <main className="flex w-full flex-1 items-start justify-start pt-10 pb-4 sm:py-6 lg:py-8">
        <PageContainer
          size="full"
          className="px-4 sm:px-6 lg:px-8 xl:px-10"
        >
          <div className={`flex w-full flex-col items-start text-left ${pageShellClassName}`}>
            <div className="mb-5 hidden w-full text-left sm:mb-6 lg:block">
              <Breadcrumb
                showBack
                items={[
                  { label: 'Home', href: '/home', icon: <FontAwesomeIcon icon={faHouse} className="h-3.5 w-3.5" /> },
                  { label: 'GalaTayo AI', icon: <AppIcon name="askAi" className="h-3.5 w-3.5" /> },
                ]}
              />
            </div>

            <section className="flex w-full max-w-[40rem] flex-col items-start md:max-w-[48rem] lg:max-w-[56rem]">
              <div className={eyebrowClassName}>
                <AppIcon name="askAi" className="h-3.5 w-3.5" />
                <span>GalaTayo AI</span>
              </div>

              <h1 className={headingClassName}>
                How can GalaTayo AI help?
              </h1>

              <p className={descriptionClassName}>
                Chat with AI or discover places around you.
              </p>

              <div className="mt-5 flex w-full items-center gap-2 sm:mt-6">
                <span className={pillClassName}>
                  Choose a tool
                </span>
                <span className={dividerClassName} aria-hidden="true" />
              </div>
            </section>

            <div className="mt-4 grid w-full gap-3 text-left sm:mt-5 sm:gap-3.5 md:grid-cols-2 md:gap-4 lg:mt-6 lg:gap-5 xl:gap-6">
              <ToolCard
                href="/ask-ai/chatbot"
                title="Chatbot AI"
                description="Ask gala questions and plan ideas."
                icon="bot"
                isDarkMode={isDarkMode}
              />

              <ToolCard
                href="/ask-ai/maps"
                title="Maps AI"
                description="Find places with an AI-powered map."
                icon="map"
                isDarkMode={isDarkMode}
              />
            </div>
          </div>
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default AskAiOverviewPage
