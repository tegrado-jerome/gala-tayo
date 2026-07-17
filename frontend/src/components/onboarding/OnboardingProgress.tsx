import type { OnboardingStep } from './types'

type OnboardingProgressProps = {
  step: OnboardingStep
}

const stepLabels = ['Welcome', 'Personal', 'Profile', 'Privacy', 'Finish']

function OnboardingProgress({ step }: OnboardingProgressProps) {
  return (
    <div className="onboarding-stepper" aria-label={`Step ${step} of 5`}>
      <div className="onboarding-stepper-track">
        {stepLabels.map((label, index) => {
          const itemStep = index + 1
          const isComplete = itemStep < step
          const isActive = itemStep === step

          return (
            <span key={label} className="onboarding-stepper-item" aria-hidden="true">
              <span
                className={`onboarding-stepper-segment ${
                  isComplete ? 'is-complete' : isActive ? 'is-active' : 'is-upcoming'
                }`}
              />
            </span>
          )
        })}
      </div>
      <span className="sr-only">{stepLabels[step - 1]}</span>
    </div>
  )
}

export default OnboardingProgress
