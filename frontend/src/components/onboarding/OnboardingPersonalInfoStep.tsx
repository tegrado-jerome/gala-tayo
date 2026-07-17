import OnboardingLayout from './OnboardingLayout'
import BirthdatePicker from '../BirthdatePicker'
import type { OnboardingErrors, OnboardingFormState } from './types'

type OnboardingPersonalInfoStepProps = {
  values: Pick<OnboardingFormState, 'firstName' | 'middleName' | 'lastName' | 'birthdate'>
  errors: OnboardingErrors
  disableNext: boolean
  onUpdate: (updates: Partial<OnboardingFormState>) => void
  onBack: () => void
  onNext: () => void
}

function OnboardingPersonalInfoStep({ values, errors, disableNext, onUpdate, onBack, onNext }: OnboardingPersonalInfoStepProps) {
  return (
    <OnboardingLayout
      step={2}
      eyebrow="Personal details"
      title="Tell us about you"
      description="We use these details to complete your account setup and age checks."
      actions={
        <>
          <button type="button" onClick={onBack} className="onboarding-button onboarding-button-secondary">
            Back
          </button>
          <button type="button" onClick={onNext} disabled={disableNext} className="onboarding-button onboarding-button-primary disabled:cursor-not-allowed disabled:opacity-60">
            Continue
          </button>
        </>
      }
    >
      <div className="onboarding-form-grid">
        <label className="onboarding-field">
          <span className="onboarding-label">First Name</span>
          <input
            value={values.firstName}
            onChange={(event) => onUpdate({ firstName: event.target.value })}
            maxLength={80}
            autoComplete="given-name"
            className="onboarding-input"
          />
          {errors.firstName ? <span className="onboarding-error">{errors.firstName}</span> : null}
        </label>
        <label className="onboarding-field">
          <span className="onboarding-label onboarding-label-inline">
            Middle Name
            <span className="optional-label">Optional</span>
          </span>
          <input
            value={values.middleName}
            onChange={(event) => onUpdate({ middleName: event.target.value })}
            maxLength={80}
            autoComplete="additional-name"
            className="onboarding-input"
          />
          {errors.middleName ? <span className="onboarding-error">{errors.middleName}</span> : null}
        </label>
        <label className="onboarding-field">
          <span className="onboarding-label">Last Name</span>
          <input
            value={values.lastName}
            onChange={(event) => onUpdate({ lastName: event.target.value })}
            maxLength={80}
            autoComplete="family-name"
            className="onboarding-input"
          />
          {errors.lastName ? <span className="onboarding-error">{errors.lastName}</span> : null}
        </label>
        <label className="onboarding-field onboarding-field-wide">
          <span className="onboarding-label">Birthdate</span>
          <BirthdatePicker
            value={values.birthdate}
            onChange={(birthdate) => onUpdate({ birthdate })}
            minYear={1900}
            maxYear={new Date().getUTCFullYear()}
            helperText="Required. Stored as YYYY-MM-DD for your account."
            error={errors.birthdate}
          />
        </label>
      </div>
    </OnboardingLayout>
  )
}

export default OnboardingPersonalInfoStep
