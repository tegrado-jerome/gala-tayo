import { GuestAuthPrompt, type GuestAuthVariant } from './GuestAuthPrompt'
import { Page } from './ui'
import AskAiOverviewPage from '../pages/AskAiOverviewPage'
import { navigateToPath } from '../utils/navigation'

type ProtectedFeatureGateProps = {
  pathname: string
  search?: string
}

const sampleTints = ['tara', 'sea', 'warn'] as const

function getAuthVariant(pathname: string): GuestAuthVariant {
  if (pathname.startsWith('/ask-ai')) return 'ask-ai'
  if (pathname.startsWith('/favorites') || pathname.startsWith('/history')) return 'saved-page'
  if (pathname.startsWith('/gala-plan') || pathname.startsWith('/plan-with-ai')) return 'plans-page'
  if (pathname.startsWith('/passport')) return 'passport-page'
  if (/^\/(profile|account-settings|settings|privacy-center|my-submissions|reports|feedback|submit-place)/.test(pathname)) return 'account-page'
  return 'community'
}

function ProtectedFeatureGate({ pathname }: ProtectedFeatureGateProps) {
  const authVariant = getAuthVariant(pathname)
  const leaveGate = () => navigateToPath('/home')

  return (
    <>
      <div className="pointer-events-none select-none opacity-40 blur-[3px]" aria-hidden="true" inert>
        {pathname.startsWith('/ask-ai') ? (
          <AskAiOverviewPage />
        ) : (
          <Page>
            <div className="g-grid">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index}>
                  <div className="rounded-[var(--r-3)]" style={{ aspectRatio: '1 / 1', background: `var(--${sampleTints[index % 3]}-soft)` }} />
                  <div className="mt-3 h-3.5 w-3/4 rounded-[var(--r-1)] bg-[var(--fill-2)]" />
                  <div className="mt-2 h-3 w-1/2 rounded-[var(--r-1)] bg-[var(--fill)]" />
                </div>
              ))}
            </div>
          </Page>
        )}
      </div>
      {/* A new guest session re-renders the route, so continuing needs no extra step. */}
      <GuestAuthPrompt variant={authVariant} mode="modal" isOpen onClose={leaveGate} onContinue={() => undefined} />
    </>
  )
}

export default ProtectedFeatureGate
