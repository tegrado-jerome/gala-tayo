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
          <button type="button" onClick={onBack} className="h-12 rounded-lg border border-[var(--line-strong)] bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50">
            Back
          </button>
          <button type="button" onClick={onNext} className="h-12 rounded-lg bg-[var(--accent)] px-5 text-sm font-black text-white transition hover:bg-[var(--accent-deep)]">
            Next
          </button>
        </>
      }
    >
      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-black text-slate-900">First Name</span>
          <input
            value={values.firstName}
            onChange={(event) => onUpdate({ firstName: event.target.value })}
            maxLength={80}
            autoComplete="given-name"
            className="h-12 rounded-lg border border-[var(--line-strong)] px-4 text-sm font-semibold outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
          />
          {errors.firstName ? <span className="text-xs font-bold text-red-600">{errors.firstName}</span> : null}
        </label>
        <label className="grid gap-2">
          <span className="flex items-center gap-2 text-sm font-black text-slate-900">
            Middle Name
            <span className="optional-label">Optional</span>
          </span>
          <input
            value={values.middleName}
            onChange={(event) => onUpdate({ middleName: event.target.value })}
            maxLength={80}
            autoComplete="additional-name"
            className="h-12 rounded-lg border border-[var(--line-strong)] px-4 text-sm font-semibold outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
          />
          {errors.middleName ? <span className="text-xs font-bold text-red-600">{errors.middleName}</span> : null}
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-black text-slate-900">Last Name</span>
          <input
            value={values.lastName}
            onChange={(event) => onUpdate({ lastName: event.target.value })}
            maxLength={80}
            autoComplete="family-name"
            className="h-12 rounded-lg border border-[var(--line-strong)] px-4 text-sm font-semibold outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
          />
          {errors.lastName ? <span className="text-xs font-bold text-red-600">{errors.lastName}</span> : null}
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-black text-slate-900">Birthdate</span>
          <input
            type="date"
            value={values.birthdate}
            onChange={(event) => onUpdate({ birthdate: event.target.value })}
            min="1900-01-01"
            max={today}
            autoComplete="bday"
            className="h-12 rounded-lg border border-[var(--line-strong)] px-4 text-sm font-semibold outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
          />
          {errors.birthdate ? <span className="text-xs font-bold text-red-600">{errors.birthdate}</span> : null}
        </label>
      </div>
    </OnboardingLayout>
  )
}

export default OnboardingPersonalInfoStep
