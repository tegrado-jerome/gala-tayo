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
          <button type="button" onClick={onBack} disabled={isSubmitting} className="onboarding-button onboarding-button-secondary" >
            Back
          </button>
          <button type="button" onClick={onFinish} disabled={!accepted || isSubmitting} className="onboarding-button onboarding-button-primary disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting ? 'Finishing...' : 'Finish Setup'}
          </button>
        </>
      }
    >
      <div className="onboarding-form-grid">
        <label className={`onboarding-choice onboarding-choice-checkbox ${accepted ? 'is-selected' : ''}`}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => onUpdate({ acceptedTerms: event.target.checked, acceptedPrivacy: event.target.checked })}
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-sm font-bold leading-6 sm:text-[15px]">
            I have read and agree to GalaTayo's{' '}
            <a href="/terms" className="font-black text-[var(--accent-deep)] underline underline-offset-4">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" className="font-black text-[var(--accent-deep)] underline underline-offset-4">Privacy Policy</a>.
          </span>
        </label>

        {errors.form ? <p className="onboarding-error-panel">{errors.form}</p> : null}
      </div>
    </OnboardingLayout>
  )
}

export default OnboardingAgreementStep
