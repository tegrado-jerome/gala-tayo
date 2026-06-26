import OnboardingLayout from './OnboardingLayout'
import type { OnboardingFormState, ProfileVisibility } from './types'

type OnboardingPrivacyStepProps = {
  values: Pick<OnboardingFormState, 'profileVisibility' | 'showFollowers' | 'showFollowing'>
  onUpdate: (updates: Partial<OnboardingFormState>) => void
  onBack: () => void
  onNext: () => void
}

const options: Array<{ value: ProfileVisibility; title: string; description: string }> = [
  {
    value: 'public',
    title: 'Public',
    description: 'Other users can view your public profile, public gala plans, comments, reviews, and other public activity.',
  },
  {
    value: 'private',
    title: 'Private',
    description: 'Only limited public information is shown. Your private gala plans and private profile details stay hidden.',
  },
]

function OnboardingPrivacyStep({ values, onUpdate, onBack, onNext }: OnboardingPrivacyStepProps) {
  return (
    <OnboardingLayout
      step={4}
      title="Profile privacy"
      description="Choose how your GalaTayo profile appears to the community."
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
        {options.map((option) => {
          const selected = values.profileVisibility === option.value

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onUpdate({ profileVisibility: option.value })}
              className={`rounded-lg border p-4 text-left transition ${selected ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-white hover:bg-slate-50'}`}
            >
              <span className="block text-base font-black text-slate-950">{option.title}</span>
              <span className="mt-2 block text-sm font-semibold leading-6 text-[var(--muted)]">{option.description}</span>
            </button>
          )
        })}

        <div className="grid gap-3 rounded-lg bg-[var(--chip)] p-4">
          <label className="flex items-center justify-between gap-4 text-sm font-black text-slate-900">
            <span>Show followers on my profile</span>
            <input type="checkbox" checked={values.showFollowers} onChange={(event) => onUpdate({ showFollowers: event.target.checked })} className="h-5 w-5 accent-[var(--accent)]" />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm font-black text-slate-900">
            <span>Show following on my profile</span>
            <input type="checkbox" checked={values.showFollowing} onChange={(event) => onUpdate({ showFollowing: event.target.checked })} className="h-5 w-5 accent-[var(--accent)]" />
          </label>
        </div>
      </div>
    </OnboardingLayout>
  )
}

export default OnboardingPrivacyStep
