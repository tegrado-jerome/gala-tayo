import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { Bank } from '@phosphor-icons/react/dist/csr/Bank'
import { BowlFood } from '@phosphor-icons/react/dist/csr/BowlFood'
import { Coffee } from '@phosphor-icons/react/dist/csr/Coffee'
import { Mountains } from '@phosphor-icons/react/dist/csr/Mountains'
import { Martini } from '@phosphor-icons/react/dist/csr/Martini'
import { Tree } from '@phosphor-icons/react/dist/csr/Tree'
import OnboardingLayout from './OnboardingLayout'
import { Button } from '../ui'
import type { OnboardingFormState } from './types'

type OnboardingInterestsStepProps = {
  values: Pick<OnboardingFormState, 'interests'>
  onUpdate: (updates: Partial<OnboardingFormState>) => void
  onBack: () => void
  onNext: () => void
}

const ONBOARDING_INTERESTS: Array<{ value: string; label: string; icon: PhosphorIcon }> = [
  { value: 'food', label: 'Food trips', icon: BowlFood },
  { value: 'cafe', label: 'Cafes', icon: Coffee },
  { value: 'nature', label: 'Nature', icon: Tree },
  { value: 'nightlife', label: 'Nightlife', icon: Martini },
  { value: 'museum', label: 'Museums', icon: Bank },
  { value: 'adventure', label: 'Adventure', icon: Mountains },
]

function OnboardingInterestsStep({ values, onUpdate, onBack, onNext }: OnboardingInterestsStepProps) {
  const toggle = (value: string) => {
    const next = values.interests.includes(value) ? values.interests.filter((item) => item !== value) : [...values.interests, value]
    onUpdate({ interests: next })
  }

  return (
    <OnboardingLayout
      step={2}
      title="Anong trip mo?"
      description="Pick what you're into and we'll lead with those spots. Optional, change it anytime."
      onBack={onBack}
      primary={
        <Button variant="tara" size="lg" onClick={onNext}>
          {values.interests.length > 0 ? 'Next' : 'Skip for now'}
          <ArrowRight aria-hidden="true" />
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3" role="group" aria-label="Interests">
        {ONBOARDING_INTERESTS.map(({ value, label, icon: Icon }) => {
          const isOn = values.interests.includes(value)
          return (
            <button key={value} type="button" className="m-choice !min-h-[88px] flex-col !gap-3 !p-4" aria-pressed={isOn} onClick={() => toggle(value)}>
              <Icon weight={isOn ? 'fill' : 'light'} aria-hidden="true" />
              <span className="font-semibold">{label}</span>
            </button>
          )
        })}
      </div>
    </OnboardingLayout>
  )
}

export default OnboardingInterestsStep
