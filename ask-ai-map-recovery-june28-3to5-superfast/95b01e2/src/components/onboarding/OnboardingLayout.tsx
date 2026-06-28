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
    <main className="flex min-h-screen items-start justify-center bg-[var(--bg)] px-4 py-8 text-[var(--text)] sm:items-center sm:px-6">
      <section className="w-full max-w-[640px] rounded-3xl border border-[var(--line)] bg-white p-5 shadow-md sm:p-8">
        <OnboardingProgress step={step} />
        <div className="mt-7">
          <h1 className="text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)] sm:text-base">{description}</p>
        </div>
        <div className="mt-7">{children}</div>
        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">{actions}</div>
      </section>
    </main>
  )
}

export default OnboardingLayout
