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
            <span key={label} className="onboarding-stepper-item">
              <span
                className={`onboarding-stepper-dot ${
                  isComplete ? 'is-complete' : isActive ? 'is-active' : 'is-upcoming'
                }`}
              >
                {itemStep}
              </span>
              <span className={`onboarding-stepper-label ${isActive ? 'is-active' : ''}`}>{label}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default OnboardingProgress
