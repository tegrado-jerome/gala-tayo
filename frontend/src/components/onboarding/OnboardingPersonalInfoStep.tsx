import OnboardingLayout from './OnboardingLayout'
import BirthdatePicker from '../BirthdatePicker'
import { AuthNotice } from '../auth/AuthCard'
import { Button } from '../ui'
import type { OnboardingErrors, OnboardingFormState } from './types'

type OnboardingPersonalInfoStepProps = {
  values: Pick<OnboardingFormState, 'firstName' | 'middleName' | 'lastName' | 'birthdate'>
  errors: OnboardingErrors
  disableNext: boolean
  isSubmitting: boolean
  onUpdate: (updates: Partial<OnboardingFormState>) => void
  onBack: () => void
  onFinish: () => void
}

type NameKey = 'firstName' | 'middleName' | 'lastName'

const nameFields: Array<{ key: NameKey; label: string; autoComplete: string; optional?: boolean }> = [
  { key: 'firstName', label: 'First name', autoComplete: 'given-name' },
  { key: 'middleName', label: 'Middle name', autoComplete: 'additional-name', optional: true },
  { key: 'lastName', label: 'Last name', autoComplete: 'family-name' },
]

function OnboardingPersonalInfoStep({ values, errors, disableNext, isSubmitting, onUpdate, onBack, onFinish }: OnboardingPersonalInfoStepProps) {
  return (
    <OnboardingLayout
      step={5}
      title="Last step: your legal name"
      description="Needed for your account and age check. Only you see these; your profile shows your display name."
      onBack={onBack}
      backDisabled={isSubmitting}
      primary={
        <Button variant="tara" size="lg" onClick={onFinish} disabled={disableNext || isSubmitting}>
          {isSubmitting ? 'Finishing...' : 'Finish setup'}
        </Button>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        {nameFields.map((field) => {
          const id = `onboarding-${field.key}`
          const error = errors[field.key]
          return (
            <div key={field.key} className="g-field">
              <label htmlFor={id}>
                {field.label}
                {field.optional ? <span className="g-fnt font-normal"> · Optional</span> : null}
              </label>
              <input
                id={id}
                value={values[field.key]}
                onChange={(event) => onUpdate({ [field.key]: event.target.value })}
                maxLength={80}
                autoComplete={field.autoComplete}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? `${id}-msg` : undefined}
                className="g-input h-14 text-[16px]"
              />
              {error ? <span id={`${id}-msg`} className="g-hint is-error">{error}</span> : null}
            </div>
          )
        })}
        <div className="g-field">
          <label htmlFor="onboarding-birthdate">Birthdate</label>
          <BirthdatePicker
            id="onboarding-birthdate"
            value={values.birthdate}
            onChange={(birthdate) => onUpdate({ birthdate })}
            minYear={1900}
            maxYear={new Date().getUTCFullYear()}
            error={errors.birthdate}
          />
        </div>
      </div>
      {errors.form ? <AuthNotice tone="bad" className="mt-5">{errors.form}</AuthNotice> : null}
    </OnboardingLayout>
  )
}

export default OnboardingPersonalInfoStep
