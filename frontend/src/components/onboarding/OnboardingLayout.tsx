import type { ReactNode } from 'react'
import OnboardingProgress from './OnboardingProgress'
import type { OnboardingStep } from './types'

type OnboardingLayoutProps = {
  step: OnboardingStep
  title: string
  description: string
  children: ReactNode
  actions: ReactNode
}

function OnboardingLayout({ step, title, description, children, actions }: OnboardingLayoutProps) {
  return (
    <main className="gala-page-background flex min-h-[100dvh] items-center justify-center overflow-x-hidden px-3 py-4 text-[var(--text)] sm:px-4 sm:py-5 md:px-6 md:py-6">
      <section className="onboarding-frame">
        <div className="onboarding-header">
          <div className="onboarding-header-top">
            <OnboardingProgress step={step} />
            <p className="onboarding-step-caption">Step {step} of 5</p>
          </div>
          <div className="onboarding-title-group">
            <h1 className="onboarding-title">{title}</h1>
            <p className="onboarding-description">{description}</p>
          </div>
        </div>

        <div className="onboarding-content">{children}</div>

        <div className="onboarding-actions">{actions}</div>
      </section>
    </main>
  )
}

export default OnboardingLayout
