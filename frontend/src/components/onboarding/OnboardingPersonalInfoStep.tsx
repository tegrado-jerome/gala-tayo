import OnboardingLayout from './OnboardingLayout'
import type { OnboardingErrors, OnboardingFormState } from './types'

type OnboardingPersonalInfoStepProps = {
  values: Pick<OnboardingFormState, 'firstName' | 'middleName' | 'lastName' | 'birthdate'>
  errors: OnboardingErrors
  onUpdate: (updates: Partial<OnboardingFormState>) => void
  onBack: () => void
  onNext: () => void
}

function OnboardingPersonalInfoStep({ values, errors, onUpdate, onBack, onNext }: OnboardingPersonalInfoStepProps) {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <OnboardingLayout
      step={2}
      title="Personal info"
      description="Your full name helps complete your account profile. It is not shown publicly by default."
      actions={
        <>
          <button type="button" onClick={onBack} className="onboarding-button onboarding-button-secondary">
            Back
          </button>
          <button type="button" onClick={onNext} className="onboarding-button onboarding-button-primary">
            Next
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
        <label className="onboarding-field">
          <span className="onboarding-label">Birthdate</span>
          <input
            type="date"
            value={values.birthdate}
            onChange={(event) => onUpdate({ birthdate: event.target.value })}
            min="1900-01-01"
            max={today}
            autoComplete="bday"
            className="onboarding-input"
          />
          {errors.birthdate ? <span className="onboarding-error">{errors.birthdate}</span> : null}
        </label>
      </div>
    </OnboardingLayout>
  )
}

export default OnboardingPersonalInfoStep
