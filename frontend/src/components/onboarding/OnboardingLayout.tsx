import type { ReactNode } from 'react'
import OnboardingProgress from './OnboardingProgress'
import type { OnboardingStep } from './types'
import '../../design/misc.css'

type OnboardingLayoutProps = {
  step: OnboardingStep
  title: string
  description: string
  children: ReactNode
  /** The main action on the right of the sticky bar. */
  primary: ReactNode
  onBack?: () => void
  backDisabled?: boolean
}

/** One question per screen with a big title, and a sticky footer: progress bar on top, Back on the left, Next on the right. */
function OnboardingLayout({ step, title, description, children, primary, onBack, backDisabled }: OnboardingLayoutProps) {
  return (
    <>
      <main className="m-onb">
        <header>
          <p className="m-onb-step">Step {step} of 4</p>
          <h1 className="m-onb-title">{title}</h1>
          <p className="g-mut mt-3 text-[16px] leading-relaxed">{description}</p>
        </header>

        <div className="mt-8">{children}</div>
      </main>

      <div className="m-onb-foot">
        <OnboardingProgress step={step} />
        <div className="m-onb-actions">
          {onBack ? (
            <button type="button" className="m-onb-back" onClick={onBack} disabled={backDisabled}>
              Back
            </button>
          ) : (
            <span />
          )}
          {primary}
        </div>
      </div>
    </>
  )
}

export default OnboardingLayout
