import OnboardingLayout from './OnboardingLayout'
import type { OnboardingErrors, OnboardingFormState } from './types'

type OnboardingAgreementStepProps = {
  values: Pick<OnboardingFormState, 'acceptedTerms' | 'acceptedPrivacy'>
  errors: OnboardingErrors
  isSubmitting: boolean
  onUpdate: (updates: Partial<OnboardingFormState>) => void
  onBack: () => void
  onFinish: () => void
}

function OnboardingAgreementStep({ values, errors, isSubmitting, onUpdate, onBack, onFinish }: OnboardingAgreementStepProps) {
  const accepted = values.acceptedTerms && values.acceptedPrivacy

  return (
    <OnboardingLayout
      step={5}
      title="Terms, privacy, and finish"
      description="Review the essentials and finish your GalaTayo setup."
      actions={
        <>
          <button type="button" onClick={onBack} disabled={isSubmitting} className="h-12 rounded-lg border border-[var(--line-strong)] bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
            Back
          </button>
          <button type="button" onClick={onFinish} disabled={!accepted || isSubmitting} className="h-12 rounded-lg bg-[var(--accent)] px-5 text-sm font-black text-white transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:bg-slate-300">
            {isSubmitting ? 'Finishing...' : 'Finish Setup'}
          </button>
        </>
      }
    >
      <div className="grid gap-5">
        <label className={`flex items-start gap-3 rounded-lg border p-4 text-sm font-bold leading-6 ${accepted ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-[var(--line)] bg-[var(--chip)] text-slate-800'}`}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => onUpdate({ acceptedTerms: event.target.checked, acceptedPrivacy: event.target.checked })}
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
          />
          <span>
            I have read and agree to GalaTayo's{' '}
            <a href="/terms" className="font-black text-[var(--accent-deep)] underline underline-offset-4">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" className="font-black text-[var(--accent-deep)] underline underline-offset-4">Privacy Policy</a>.
          </span>
        </label>

        <p className="rounded-lg bg-white px-4 py-3 text-sm font-semibold leading-6 text-[var(--muted)] ring-1 ring-[var(--line)]">
          GalaTayo may send necessary account and service emails, such as login, security, password reset, account updates, and important policy notices.
        </p>

        {errors.form ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{errors.form}</p> : null}
      </div>
    </OnboardingLayout>
  )
}

export default OnboardingAgreementStep
