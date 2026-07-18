import type { ReactNode } from 'react'
import OnboardingProgress from './OnboardingProgress'
import type { OnboardingStep } from './types'

const onboardingStepCount = 4

type OnboardingLayoutProps = {
  step: OnboardingStep
  title: string
  description: string
  eyebrow?: string
  children: ReactNode
  actions: ReactNode
}

function OnboardingLayout({ step, title, description, eyebrow, children, actions }: OnboardingLayoutProps) {
  return (
    <main className="gala-page-background flex min-h-[100dvh] items-start justify-center overflow-x-hidden px-3 py-[max(20px,env(safe-area-inset-top))] text-[var(--text)] sm:px-4 sm:py-8 md:px-6 md:py-10">
      <section className="onboarding-frame">
        <div className="onboarding-shell">
          <div className="onboarding-header">
            <div className="onboarding-header-top">
              <OnboardingProgress step={step} />
              <p className="onboarding-step-caption">Step {step} of {onboardingStepCount}</p>
            </div>
          </div>

          <div className="onboarding-stage">
            <div className="onboarding-main">
              <div className="onboarding-title-group">
                {eyebrow ? <p className="onboarding-eyebrow">{eyebrow}</p> : null}
                <h1 className="onboarding-title">{title}</h1>
                <p className="onboarding-description">{description}</p>
              </div>
              <div className="onboarding-content">{children}</div>
              <div className="onboarding-actions">{actions}</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default OnboardingLayout
