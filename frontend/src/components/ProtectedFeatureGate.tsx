import { AppIcon, type AppIconName } from './AppIcon'
import { GuestAuthPrompt, type GuestAuthVariant } from './GuestAuthPrompt'
import AskAiOverviewPage from '../pages/AskAiOverviewPage'

type ProtectedFeatureGateProps = {
  pathname: string
  search?: string
}

type FeaturePreview = {
  icon: AppIconName
  eyebrow: string
  title: string
  description: string
  chips: string[]
  stat: string
  statLabel: string
  cards: Array<{
    title: string
    meta: string
    body: string
  }>
}

const featurePreviews: Array<{
  matches: (pathname: string) => boolean
  preview: FeaturePreview
}> = [
  {
    matches: (pathname) => pathname === '/favorites' || pathname === '/favorites/',
    preview: {
      icon: 'favorites',
      eyebrow: 'Saved places',
      title: 'Your favorites stay with your account',
      description: 'Sign in to keep every saved gala spot synced across devices and easy to revisit.',
      chips: ['Private list', 'Synced', 'Quick revisit'],
      stat: '18',
      statLabel: 'saved spots',
      cards: [
        { title: 'Binondo food crawl', meta: 'Kainan / Manila', body: 'Saved for your next barkada gala.' },
        { title: 'Sunset baywalk', meta: 'Chill / Pasay', body: 'Ready when you want a quick unwind.' },
      ],
    },
  },
  {
    matches: (pathname) => pathname === '/history' || pathname === '/history/',
    preview: {
      icon: 'history',
      eyebrow: 'Recent activity',
      title: 'Your history is tied to your account',
      description: 'Log in to reopen recently viewed places, prompts, and planning trails without starting over.',
      chips: ['Recent views', 'Smart recall', 'Private'],
      stat: '42',
      statLabel: 'recent entries',
      cards: [
        { title: 'Escolta coffee spots', meta: 'Viewed 2 hours ago', body: 'Pick up where your discovery session left off.' },
        { title: 'Date night shortlist', meta: 'Viewed yesterday', body: 'Your last planning flow stays available.' },
      ],
    },
  },
  {
    matches: (pathname) => pathname.startsWith('/gala-plan') || pathname.startsWith('/gala-plans'),
    preview: {
      icon: 'galaPlan',
      eyebrow: 'Gala plans',
      title: 'Build and save plans with an account',
      description: 'Create itineraries, favorite plans, and keep your gala ideas organized in one place.',
      chips: ['Private drafts', 'Shareable', 'Editable'],
      stat: '6',
      statLabel: 'active plans',
      cards: [
        { title: 'Saturday museum route', meta: '3 stops / Shared draft', body: 'A clean board for your next day out.' },
        { title: 'Rainy day cafe list', meta: '5 saves / Personal', body: 'Keep every option in one planning flow.' },
      ],
    },
  },
  {
    matches: (pathname) => pathname === '/profile' || pathname === '/profile/' || pathname === '/me' || pathname === '/me/' || pathname.startsWith('/settings'),
    preview: {
      icon: 'profile',
      eyebrow: 'Your account',
      title: 'Manage your profile after signing in',
      description: 'Your public profile, account settings, and security tools are available once you log in.',
      chips: ['Profile', 'Privacy', 'Security'],
      stat: '1',
      statLabel: 'account hub',
      cards: [
        { title: 'Public profile', meta: 'Display name / Username', body: 'Choose how other people see you on GalaTayo.' },
        { title: 'Account settings', meta: 'Password / Preferences', body: 'Control your account details in one place.' },
      ],
    },
  },
  {
    matches: (pathname) => pathname === '/submit-place' || pathname === '/submit-place/' || pathname === '/submissions' || pathname === '/submissions/' || pathname.startsWith('/admin/place-'),
    preview: {
      icon: 'uploadPhoto',
      eyebrow: 'Community places',
      title: 'Submit and track places with an account',
      description: 'Sign in to send place suggestions, upload details, and monitor your submission status.',
      chips: ['Submit', 'Track', 'Review'],
      stat: '3',
      statLabel: 'open submissions',
      cards: [
        { title: 'Hidden courtyard cafe', meta: 'Pending review', body: 'Check review status and updates from the team.' },
        { title: 'Weekend art market', meta: 'Approved', body: 'Follow your contribution from draft to publish.' },
      ],
    },
  },
  {
    matches: (pathname) => pathname === '/feedback' || pathname === '/feedback/' || pathname === '/reports' || pathname === '/reports/' || pathname === '/comment-notices' || pathname === '/comment-notices/',
    preview: {
      icon: 'reports',
      eyebrow: 'Support and reports',
      title: 'Account access is required here',
      description: 'This area connects to your personal reports, moderation notices, and feedback history.',
      chips: ['Reports', 'Replies', 'Account-linked'],
      stat: '5',
      statLabel: 'tracked items',
      cards: [
        { title: 'Feedback thread', meta: 'In review', body: 'Keep updates tied to the right account.' },
        { title: 'Notice center', meta: 'Personal activity', body: 'Only you should be able to view this info.' },
      ],
    },
  },
  {
    matches: (pathname) =>
      pathname === '/ask-ai' ||
      pathname === '/ask-ai/' ||
      pathname === '/ask-ai/chatbot' ||
      pathname === '/ask-ai/chatbot/' ||
      pathname === '/ask-ai/text' ||
      pathname === '/ask-ai/text/' ||
      pathname === '/ask-ai/map' ||
      pathname === '/ask-ai/map/' ||
      pathname === '/ask-ai/maps' ||
      pathname === '/ask-ai/maps/' ||
      pathname === '/ask-ai/prompt-builder' ||
      pathname === '/ask-ai/prompt-builder/' ||
      pathname === '/prompt-builder' ||
      pathname === '/prompt-builder/',
    preview: {
      icon: 'askAi',
      eyebrow: 'AI planning',
      title: 'Log in to use account-based AI tools',
      description: 'Your AI planning activity, preferences, and map results work best when tied to your account.',
      chips: ['AI prompts', 'Map grounded', 'Session-based'],
      stat: '12',
      statLabel: 'AI requests',
      cards: [
        { title: 'Near-me date ideas', meta: 'Map mode', body: 'Location-aware outputs stay connected to your session.' },
        { title: 'Barkada weekend shortlist', meta: 'Saved thread', body: 'Resume your planning without losing context.' },
      ],
    },
  },
]

function getAuthVariant(pathname: string): GuestAuthVariant {
  if (pathname.startsWith('/ask-ai') || pathname === '/prompt-builder' || pathname === '/prompt-builder/') return 'ask-ai'
  if (pathname === '/favorites' || pathname === '/favorites/') return 'favorite'
  if (pathname.startsWith('/gala-plan') || pathname.startsWith('/gala-plans')) return 'add-plan'
  return 'community'
}

function getFeaturePreview(pathname: string): FeaturePreview {
  return (
    featurePreviews.find((entry) => entry.matches(pathname))?.preview ?? {
      icon: 'lock',
      eyebrow: 'Protected feature',
      title: 'This feature needs an account first',
      description: 'Create an account or log in to continue with this part of GalaTayo.',
      chips: ['Protected', 'Account required', 'Minimal access'],
      stat: '1',
      statLabel: 'secure space',
      cards: [
        { title: 'Personal access', meta: 'Private feature', body: 'This screen is available after account sign-in.' },
        { title: 'Continue later', meta: 'Seamless return', body: 'We can bring you back here after you log in.' },
      ],
    }
  )
}

function isAskAiPath(pathname: string): boolean {
  return (
    pathname.startsWith('/ask-ai') ||
    pathname === '/prompt-builder' ||
    pathname === '/prompt-builder/'
  )
}

function ProtectedFeatureGate({ pathname }: ProtectedFeatureGateProps) {
  const preview = getFeaturePreview(pathname)
  const authVariant = getAuthVariant(pathname)

  if (isAskAiPath(pathname)) {
    return (
      <div className="gala-page-background relative h-[100dvh] overflow-hidden overscroll-none text-[var(--text)]">
        <div className="pointer-events-none absolute inset-0 select-none overflow-hidden blur-[3px] opacity-40">
          <AskAiOverviewPage />
        </div>

        <div className="absolute inset-0 flex items-center justify-center overflow-hidden px-4 py-6">
          <div className="w-full max-w-[420px]">
            <GuestAuthPrompt variant={authVariant} mode="inline-card" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <main className="gala-page-background relative min-h-screen overflow-hidden px-4 py-5 text-[var(--text)] sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[var(--accent-wash)] opacity-80 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-24 h-52 w-52 -translate-x-1/2 rounded-full bg-[var(--primary-soft)] opacity-70 blur-3xl" />

      <section className="relative mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between rounded-[24px] border border-[var(--line)] bg-white/88 px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[var(--accent-soft)] text-[var(--accent-deep)]">
              <AppIcon name={preview.icon} className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">{preview.eyebrow}</p>
              <p className="text-sm font-semibold text-[var(--muted)]">Account access required</p>
            </div>
          </div>
          <span className="hidden rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-xs font-bold text-[var(--muted)] sm:inline-flex">
            Preview only
          </span>
        </div>

        <div className="relative overflow-hidden rounded-[32px] border border-[var(--line)] bg-white/92 shadow-[0_28px_90px_rgba(15,23,42,0.1)]">
          <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(248,247,244,0.1),rgba(248,247,244,0.72))]" />
          <div className="gala-protected-preview-frost pointer-events-none absolute inset-0 z-10" />

          <div className="grid gap-5 p-5 blur-[2px] saturate-[0.88] sm:p-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:items-start">
            <section className="rounded-[28px] border border-[var(--line)] bg-[linear-gradient(180deg,#ffffff,rgba(248,250,252,0.94))] p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
              <div className="flex flex-wrap items-center gap-2">
                {preview.chips.map((chip) => (
                  <span key={chip} className="rounded-full border border-[var(--line)] bg-[var(--chip)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent-deep)]">
                    {chip}
                  </span>
                ))}
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1 className="text-[clamp(2rem,4vw,3rem)] font-black leading-[0.94] tracking-[-0.05em] text-[var(--text-main)]">
                    {preview.title}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)] sm:text-[15px]">
                    {preview.description}
                  </p>
                </div>
                <div className="rounded-[24px] border border-[rgba(30,58,138,0.14)] bg-[var(--primary-soft)] px-5 py-4">
                  <p className="text-3xl font-black text-[var(--accent-deep)]">{preview.stat}</p>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">{preview.statLabel}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {preview.cards.map((card) => (
                  <article key={card.title} className="rounded-[22px] border border-[var(--line)] bg-white px-4 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                    <div className="h-28 rounded-[18px] bg-[linear-gradient(135deg,rgba(219,234,254,0.85),rgba(255,255,255,0.95))]" />
                    <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">{card.meta}</p>
                    <h2 className="mt-2 text-base font-black text-[var(--text-main)]">{card.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{card.body}</p>
                  </article>
                ))}
              </div>
            </section>

            <aside className="grid gap-4">
              <section className="rounded-[28px] border border-[var(--line)] bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--chip)] text-[var(--accent-deep)]">
                      <AppIcon name="list" className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-black text-[var(--text-main)]">Current feature</p>
                      <p className="text-xs font-semibold text-[var(--muted)]">Locked preview</p>
                    </div>
                  </div>
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                </div>

                <div className="mt-5 grid gap-3">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-alt)] p-4">
                      <div className="h-3 w-20 rounded-full bg-[var(--line)]" />
                      <div className="mt-3 h-5 w-3/4 rounded-full bg-[rgba(30,58,138,0.14)]" />
                      <div className="mt-3 h-3 w-full rounded-full bg-[var(--line)]" />
                      <div className="mt-2 h-3 w-2/3 rounded-full bg-[var(--line)]" />
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </div>

          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 sm:p-6">
            <div className="w-full max-w-[420px]">
              <GuestAuthPrompt variant={authVariant} mode="inline-card" />
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default ProtectedFeatureGate
