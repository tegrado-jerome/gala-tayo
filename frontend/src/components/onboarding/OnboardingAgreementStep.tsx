import OnboardingLayout from './OnboardingLayout'
import type { OnboardingErrors, OnboardingFormState } from './types'
import InternalLink from '../InternalLink'
import { AuthNotice } from '../auth/AuthCard'
import { Button } from '../ui'

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
      title="Last na, promise"
      description="Agree to the terms and privacy policy to finish your GalaTayo profile."
      onBack={onBack}
      backDisabled={isSubmitting}
      primary={
        <Button variant="tara" size="lg" onClick={onFinish} disabled={disableNext || !accepted || isSubmitting}>
          {isSubmitting ? 'Finishing...' : 'Finish setup'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="m-choice !min-h-0 cursor-default" aria-pressed={accepted}>
          <input
            id={checkboxId}
            type="checkbox"
            checked={accepted}
            onChange={(event) => onUpdate({ acceptedTerms: event.target.checked, acceptedPrivacy: event.target.checked })}
            className="mt-0.5 h-5 w-5 shrink-0"
            style={{ accentColor: 'var(--ink)' }}
          />
          <span className="leading-6">
            <label htmlFor={checkboxId} className="cursor-pointer">
              I have read and agree to GalaTayo's{' '}
            </label>
            <InternalLink href="/terms" className="font-semibold underline underline-offset-[3px]">
              Terms of Service
            </InternalLink>
            {' '}and{' '}
            <InternalLink href="/privacy" className="font-semibold underline underline-offset-[3px]">
              Privacy Policy
            </InternalLink>
            <label htmlFor={checkboxId} className="cursor-pointer">
              .
            </label>
          </span>
        </div>

        {errors.form ? <AuthNotice tone="bad">{errors.form}</AuthNotice> : null}

        <p className="g-xs g-mut">By creating an account, you confirm that you are at least 13 years old.</p>
      </div>
    </OnboardingLayout>
  )
}

export default OnboardingAgreementStep
