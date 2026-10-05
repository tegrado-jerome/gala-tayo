import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight'
import OnboardingLayout from './OnboardingLayout'
import BirthdatePicker from '../BirthdatePicker'
import { Button } from '../ui'
import type { OnboardingErrors, OnboardingFormState } from './types'

type OnboardingPersonalInfoStepProps = {
  values: Pick<OnboardingFormState, 'firstName' | 'middleName' | 'lastName' | 'birthdate'>
  errors: OnboardingErrors
  disableNext: boolean
  onUpdate: (updates: Partial<OnboardingFormState>) => void
  onNext: () => void
}

type NameKey = 'firstName' | 'middleName' | 'lastName'

const nameFields: Array<{ key: NameKey; label: string; autoComplete: string; optional?: boolean }> = [
  { key: 'firstName', label: 'First name', autoComplete: 'given-name' },
  { key: 'middleName', label: 'Middle name', autoComplete: 'additional-name', optional: true },
  { key: 'lastName', label: 'Last name', autoComplete: 'family-name' },
]

function OnboardingPersonalInfoStep({ values, errors, disableNext, onUpdate, onNext }: OnboardingPersonalInfoStepProps) {
  return (
    <OnboardingLayout
      step={1}
      title="Kumusta! What's your name?"
      description="We use these details to finish your account setup and age check. Only you see your birthdate."
      primary={
        <Button variant="tara" size="lg" onClick={onNext} disabled={disableNext}>
          Next
          <ArrowRight aria-hidden="true" />
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
    </OnboardingLayout>
  )
}

export default OnboardingPersonalInfoStep
