import type { CSSProperties } from 'react'
import type { OnboardingStep } from './types'

const stepLabels = ['Personal', 'Profile', 'Privacy', 'Finish']

/** Segmented bar across the top of the sticky footer. The current step fills halfway, done steps fill fully. */
function OnboardingProgress({ step }: { step: OnboardingStep }) {
  return (
    <div
      className="m-onb-prog"
      role="progressbar"
      aria-label="Profile setup progress"
      aria-valuemin={1}
      aria-valuemax={stepLabels.length}
      aria-valuenow={step}
      aria-valuetext={`Step ${step} of ${stepLabels.length}: ${stepLabels[step - 1]}`}
    >
      {stepLabels.map((label, index) => (
        <i key={label} style={{ '--w': index < step - 1 ? '100%' : index === step - 1 ? '50%' : '0%' } as CSSProperties} />
      ))}
    </div>
  )
}

export default OnboardingProgress
