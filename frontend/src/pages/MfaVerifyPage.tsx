import type { Session } from '@supabase/supabase-js'
import MfaVerification from '../components/MfaVerification'

function MfaVerifyPage({ session, onMfaVerified }: { session: Session; onMfaVerified?: () => void }) {
  return <MfaVerification session={session} onSuccess={onMfaVerified} />
}

export default MfaVerifyPage
