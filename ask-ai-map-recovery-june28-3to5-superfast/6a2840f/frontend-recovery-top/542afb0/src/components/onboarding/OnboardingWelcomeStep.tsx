import OnboardingLayout from './OnboardingLayout'

type OnboardingWelcomeStepProps = {
  onNext: () => void
}

function OnboardingWelcomeStep({ onNext }: OnboardingWelcomeStepProps) {
  return (
    <OnboardingLayout
      step={1}
      title="Welcome to GalaTayo 👋"
      description="Let's set up your profile so you can save places, create gala plans, submit places, upload photos, and join the GalaTayo community."
      actions={
        <button type="button" onClick={onNext} className="h-12 rounded-lg bg-[var(--accent)] px-5 text-sm font-black text-white transition hover:bg-[var(--accent-deep)] sm:ml-auto">
          Get Started
        </button>
      }
    >
      <div className="rounded-lg bg-[var(--chip)] px-4 py-4 text-sm font-semibold leading-6 text-slate-700">
        This takes about a minute. Your public profile is separate from private account details.
      </div>
    </OnboardingLayout>
  )
}

export default OnboardingWelcomeStep
