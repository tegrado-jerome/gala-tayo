import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGlobe, faShield } from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import OnboardingLayout from './OnboardingLayout'
import type { OnboardingErrors, OnboardingFormState, ProfileVisibility } from './types'

type OnboardingPrivacyStepProps = {
  values: Pick<OnboardingFormState, 'profileVisibility'>
  errors: OnboardingErrors
  disableNext: boolean
  onUpdate: (updates: Partial<OnboardingFormState>) => void
  onBack: () => void
  onNext: () => void
}

const options: Array<{ value: ProfileVisibility; title: string; description: string; icon: IconDefinition }> = [
  {
    value: 'public',
    title: 'Public profile',
    description: 'Let other users view your public profile, shared activity, and community presence.',
    icon: faGlobe,
  },
  {
    value: 'private',
    title: 'Private profile',
    description: 'Keep your profile hidden while your private gala plans and account details stay protected.',
    icon: faShield,
  },
]

function OnboardingPrivacyStep({ values, errors, disableNext, onUpdate, onBack, onNext }: OnboardingPrivacyStepProps) {
  return (
    <OnboardingLayout
      step={3}
      eyebrow="Privacy"
      title="Choose your privacy"
      description="Decide whether your profile is visible to everyone or kept private."
      actions={
        <>
          <button type="button" onClick={onBack} className="onboarding-button onboarding-button-secondary">
            Back
          </button>
          <button type="button" onClick={onNext} disabled={disableNext} className="onboarding-button onboarding-button-primary disabled:cursor-not-allowed disabled:opacity-60">
            Continue
          </button>
        </>
      }
    >
      <div className="onboarding-form-grid">
        {options.map((option) => {
          const selected = values.profileVisibility === option.value
          const Icon = option.icon

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onUpdate({ profileVisibility: option.value })}
              className={`onboarding-choice ${selected ? 'is-selected' : ''}`}
            >
              <span className="onboarding-choice-icon" aria-hidden="true">
                <FontAwesomeIcon icon={Icon} className="h-5 w-5" />
              </span>
              <span className="block text-sm font-black text-[var(--text-main)] sm:text-base">{option.title}</span>
              <span className="mt-1.5 block text-xs font-semibold leading-5 text-[var(--muted)] sm:mt-2 sm:text-sm sm:leading-6">{option.description}</span>
            </button>
          )
        })}
        {errors.profileVisibility ? <span className="onboarding-error">{errors.profileVisibility}</span> : null}
      </div>
    </OnboardingLayout>
  )
}

export default OnboardingPrivacyStep
