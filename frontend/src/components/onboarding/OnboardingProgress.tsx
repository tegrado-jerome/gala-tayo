import type { OnboardingStep } from './types'

const stepLabels = ['Personal', 'Profile', 'Privacy', 'Finish']

function OnboardingProgress({ step }: { step: OnboardingStep }) {
  return (
    <div>
      <p className="g-xs g-mut font-semibold">
        Step {step} of {stepLabels.length}
        <span className="g-fnt"> · {stepLabels[step - 1]}</span>
      </p>
      <div
        className="mt-3 flex gap-2"
        role="progressbar"
        aria-label="Profile setup progress"
        aria-valuemin={1}
        aria-valuemax={stepLabels.length}
        aria-valuenow={step}
        aria-valuetext={`Step ${step} of ${stepLabels.length}: ${stepLabels[step - 1]}`}
      >
        {stepLabels.map((label, index) => (
          <span
            key={label}
            className="h-1 flex-1 rounded-full"
            style={{ background: index < step ? 'var(--ink)' : 'var(--fill-2)', transition: 'background var(--t) var(--ease-g)' }}
          />
        ))}
      </div>
    </div>
  )
}

export default OnboardingProgress
