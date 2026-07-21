import OnboardingLayout from './OnboardingLayout'
import type { OnboardingErrors, OnboardingFormState } from './types'
import InternalLink from '../InternalLink'

type OnboardingAgreementStepProps = {
  values: Pick<OnboardingFormState, 'acceptedTerms' | 'acceptedPrivacy'>
  errors: OnboardingErrors
  isSubmitting: boolean
  disableNext: boolean
  onUpdate: (updates: Partial<OnboardingFormState>) => void
  onBack: () => void
  onFinish: () => void
}

function OnboardingAgreementStep({ values, errors, isSubmitting, disableNext, onUpdate, onBack, onFinish }: OnboardingAgreementStepProps) {
  const accepted = values.acceptedTerms && values.acceptedPrivacy
  const checkboxId = 'onboarding-accept-legal'

  return (
    <OnboardingLayout
      step={4}
      eyebrow="Final step"
      title="You're almost done"
      description="Agree to the terms and privacy policy to finish creating your GalaTayo profile."
      actions={
        <>
          <button type="button" onClick={onBack} disabled={isSubmitting} className="onboarding-button onboarding-button-secondary" >
            Back
          </button>
          <button type="button" onClick={onFinish} disabled={disableNext || !accepted || isSubmitting} className="onboarding-button onboarding-button-primary disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting ? 'Finishing...' : 'Finish Setup'}
          </button>
        </>
      }
    >
      <div className="onboarding-form-grid">
        <div className={`onboarding-choice onboarding-choice-checkbox onboarding-field-wide ${accepted ? 'is-selected' : ''}`}>
          <input
            id={checkboxId}
            type="checkbox"
            checked={accepted}
            onChange={(event) => onUpdate({ acceptedTerms: event.target.checked, acceptedPrivacy: event.target.checked })}
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-sm font-bold leading-6 sm:text-[15px]">
            <label htmlFor={checkboxId} className="cursor-pointer">
              I have read and agree to GalaTayo's{' '}
            </label>
            <InternalLink
              href="/terms"
              className="font-black text-[var(--onboarding-link)] underline underline-offset-4 transition hover:text-[var(--onboarding-link-hover)]"
            >
              Terms of Service
            </InternalLink>
            {' '}and{' '}
            <InternalLink
              href="/privacy"
              className="font-black text-[var(--onboarding-link)] underline underline-offset-4 transition hover:text-[var(--onboarding-link-hover)]"
            >
              Privacy Policy
            </InternalLink>
            <label htmlFor={checkboxId} className="cursor-pointer">
              .
            </label>
          </span>
        </div>

        {errors.form ? <p className="onboarding-error-panel">{errors.form}</p> : null}

        <p className="onboarding-age-note">
          By creating an account, you confirm that you are at least 13 years old.
        </p>
      </div>
    </OnboardingLayout>
  )
}

export default OnboardingAgreementStep
