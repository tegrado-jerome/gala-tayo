import OnboardingLayout from './OnboardingLayout'
import { AppIcon } from '../AppIcon'

type OnboardingWelcomeStepProps = {
  onNext: () => void
}

function OnboardingWelcomeStep({ onNext }: OnboardingWelcomeStepProps) {
  return (
    <OnboardingLayout
      step={1}
      eyebrow="Profile setup"
      title="Welcome to GalaTayo"
      description="Set up your profile to save places, build gala plans, and explore Metro Manila your way."
      actions={
        <div className="col-span-2 flex w-full justify-end sm:w-auto">
          <button type="button" onClick={onNext} className="onboarding-button onboarding-button-primary gap-2">
            Get Started
            <AppIcon name="arrowRight" size={16} className="shrink-0" />
          </button>
        </div>
      }
    >
      <p className="onboarding-note">
        This only takes about a minute. Your public profile stays separate from your private account details.
      </p>
    </OnboardingLayout>
  )
}

export default OnboardingWelcomeStep
