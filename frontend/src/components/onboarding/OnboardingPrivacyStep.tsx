import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { CheckCircle } from '@phosphor-icons/react/dist/csr/CheckCircle'
import { Globe } from '@phosphor-icons/react/dist/csr/Globe'
import { Lock } from '@phosphor-icons/react/dist/csr/Lock'
import OnboardingLayout from './OnboardingLayout'
import { Button } from '../ui'
import type { OnboardingErrors, OnboardingFormState, ProfileVisibility } from './types'

type OnboardingPrivacyStepProps = {
  values: Pick<OnboardingFormState, 'profileVisibility'>
  errors: OnboardingErrors
  disableNext: boolean
  onUpdate: (updates: Partial<OnboardingFormState>) => void
  onBack: () => void
  onNext: () => void
}

const options: Array<{ value: ProfileVisibility; title: string; description: string; icon: PhosphorIcon }> = [
  {
    value: 'public',
    title: 'Public profile',
    description: 'Others can see your profile, shared activity, and who you follow.',
    icon: Globe,
  },
  {
    value: 'private',
    title: 'Private profile',
    description: 'Your profile stays hidden. Your plans and account details stay private either way.',
    icon: Lock,
  },
]

function OnboardingPrivacyStep({ values, errors, disableNext, onUpdate, onBack, onNext }: OnboardingPrivacyStepProps) {
  return (
    <OnboardingLayout
      step={3}
      title="Who can see your profile?"
      description="You can change this anytime in settings."
      onBack={onBack}
      primary={
        <Button variant="tara" size="lg" onClick={onNext} disabled={disableNext}>
          Next
          <ArrowRight aria-hidden="true" />
        </Button>
      }
    >
      <div className="grid gap-3">
        {options.map((option) => {
          const selected = values.profileVisibility === option.value
          const Icon = option.icon

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onUpdate({ profileVisibility: option.value })}
              className="m-choice"
            >
              <Icon weight="duotone" aria-hidden="true" />
              <span className="min-w-0 pr-8">
                <span className="g-h3 block">{option.title}</span>
                <span className="g-sm g-mut mt-1 block leading-5">{option.description}</span>
              </span>
              {selected ? <CheckCircle weight="fill" className="g-ic absolute right-4 top-4" aria-hidden="true" /> : null}
            </button>
          )
        })}
      </div>
      {errors.profileVisibility ? <p className="g-hint is-error mt-3">{errors.profileVisibility}</p> : null}
    </OnboardingLayout>
  )
}

export default OnboardingPrivacyStep
