import type { Session } from '@supabase/supabase-js'
import AppHeader from '../components/AppHeader'
import { PageContainer, PageShell } from '../components/layout/ResponsiveLayouts'
import MfaVerification from '../components/MfaVerification'

function MfaVerifyPage({ session, onMfaVerified }: { session: Session; onMfaVerified?: () => void }) {
  return (
    <PageShell>
      <AppHeader />
      <main className="flex flex-1 w-full items-center justify-center px-4 sm:px-6">
        <PageContainer size="narrow">
          <MfaVerification session={session} onSuccess={onMfaVerified} />
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default MfaVerifyPage
