import type { OnboardingStep } from './types'

type OnboardingProgressProps = {
  step: OnboardingStep
}

const stepLabels = ['Welcome', 'Personal', 'Profile', 'Privacy', 'Finish']

function OnboardingProgress({ step }: OnboardingProgressProps) {
  return (
    <div className="grid gap-3">
      <p className="text-xs font-black uppercase text-[var(--accent-deep)]">Step {step} of 5</p>
      <div className="grid grid-cols-5 gap-2" aria-label={`Step ${step} of 5`}>
        {stepLabels.map((label, index) => {
          const itemStep = index + 1
          const isActive = itemStep <= step

          return (
            <span key={label} className="grid gap-1">
              <span className={`h-2 rounded-full ${isActive ? 'bg-[var(--accent)]' : 'bg-slate-200'}`} />
              <span className="hidden text-[10px] font-bold text-[var(--muted)] sm:block">{label}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default OnboardingProgress
