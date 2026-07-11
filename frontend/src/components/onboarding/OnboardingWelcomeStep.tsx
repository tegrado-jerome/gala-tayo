import OnboardingLayout from './OnboardingLayout'

type OnboardingWelcomeStepProps = {
  onNext: () => void
}

function OnboardingWelcomeStep({ onNext }: OnboardingWelcomeStepProps) {
  return (
    <OnboardingLayout
      step={1}
      title="Welcome to GalaTayo"
      description="Let's set up your profile so you can save places, create gala plans, submit places, upload photos, and join the GalaTayo community."
      actions={
        <div className="col-span-2 flex w-full justify-end sm:w-auto">
          <button type="button" onClick={onNext} className="onboarding-button onboarding-button-primary">
            Get Started
          </button>
        </div>
      }
    >
      <p className="onboarding-note">
        This takes about a minute. Your public profile is separate from private account details.
      </p>
    </OnboardingLayout>
  )
}

export default OnboardingWelcomeStep
