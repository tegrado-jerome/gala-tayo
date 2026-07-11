import OnboardingLayout from './OnboardingLayout'
import type { OnboardingFormState, ProfileVisibility } from './types'

type OnboardingPrivacyStepProps = {
  values: Pick<OnboardingFormState, 'profileVisibility'>
  onUpdate: (updates: Partial<OnboardingFormState>) => void
  onBack: () => void
  onNext: () => void
}

const options: Array<{ value: ProfileVisibility; title: string; description: string }> = [
  {
    value: 'public',
    title: 'Public',
    description: 'Other users can view your public profile, public gala plans, comments, reviews, and other public activity.',
  },
  {
    value: 'private',
    title: 'Private',
    description: 'Only limited public information is shown. Your private gala plans and private profile details stay hidden.',
  },
]

function OnboardingPrivacyStep({ values, onUpdate, onBack, onNext }: OnboardingPrivacyStepProps) {
  return (
    <OnboardingLayout
      step={4}
      title="Profile privacy"
      description="Choose how your GalaTayo profile appears to the community."
      actions={
        <>
          <button type="button" onClick={onBack} className="onboarding-button onboarding-button-secondary">
            Back
          </button>
          <button type="button" onClick={onNext} className="onboarding-button onboarding-button-primary">
            Next
          </button>
        </>
      }
    >
      <div className="onboarding-form-grid">
        {options.map((option) => {
          const selected = values.profileVisibility === option.value

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onUpdate({ profileVisibility: option.value })}
              className={`onboarding-choice ${selected ? 'is-selected' : ''}`}
            >
              <span className="block text-sm font-black text-slate-950 sm:text-base">{option.title}</span>
              <span className="mt-1.5 block text-xs font-semibold leading-5 text-[var(--muted)] sm:mt-2 sm:text-sm sm:leading-6">{option.description}</span>
            </button>
          )
        })}
      </div>
    </OnboardingLayout>
  )
}

export default OnboardingPrivacyStep
