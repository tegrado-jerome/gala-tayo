import type { ReactNode } from 'react'
import { Page } from '../ui'
import OnboardingProgress from './OnboardingProgress'
import type { OnboardingStep } from './types'

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
    <Page narrow>
      <OnboardingProgress step={step} />

      <header className="mt-8">
        {eyebrow ? <p className="g-eyebrow">{eyebrow}</p> : null}
        <h1 className="g-h1 mt-2">{title}</h1>
        <p className="g-mut mt-2">{description}</p>
      </header>

      <div className="mt-8">{children}</div>

      <div className="mt-8 flex items-center justify-end gap-3">{actions}</div>
    </Page>
  )
}

export default OnboardingLayout
