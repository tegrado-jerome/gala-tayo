import type { ChangeEvent } from 'react'
import OnboardingLayout from './OnboardingLayout'
import type { OnboardingErrors, OnboardingFormState } from './types'

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

type OnboardingPublicProfileStepProps = {
  values: Pick<OnboardingFormState, 'displayName' | 'username' | 'avatarUrl'>
  errors: OnboardingErrors
  usernameStatus: UsernameStatus
  isUploadingAvatar: boolean
  onUpdate: (updates: Partial<OnboardingFormState>) => void
  onAvatarSelected: (file: File) => void
  onBack: () => void
  onNext: () => void
}

const maxAvatarBytes = 5 * 1024 * 1024
const avatarTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

function OnboardingPublicProfileStep({
  values,
  errors,
  usernameStatus,
  isUploadingAvatar,
  onUpdate,
  onAvatarSelected,
  onBack,
  onNext,
}: OnboardingPublicProfileStepProps) {
  const normalizedUsername = values.username.trim().toLowerCase().replace(/^@+/, '')
  const previewName = values.displayName.trim() || 'Display Name'
  const previewUsername = normalizedUsername || 'username'

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!avatarTypes.includes(file.type) || file.size > maxAvatarBytes) {
      onUpdate({ avatarUrl: values.avatarUrl })
      return
    }

    onAvatarSelected(file)
  }

  const usernameMessage =
    errors.username ||
    (usernameStatus === 'checking'
      ? 'Checking username...'
      : usernameStatus === 'available'
        ? 'Username is available.'
        : usernameStatus === 'taken'
          ? 'That username is already taken.'
          : 'Use lowercase letters, numbers, underscore, or dot.')

  return (
    <OnboardingLayout
      step={3}
      title="Public profile setup"
      description="This is how other users may recognize you on GalaTayo."
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
      <div className="grid gap-5">
        <div className="flex items-center gap-4 rounded-lg border border-[var(--line)] bg-[var(--chip)] p-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-lg font-black text-[var(--accent-deep)] ring-1 ring-[var(--line)]">
            {values.avatarUrl ? <img src={values.avatarUrl} alt="" className="h-full w-full object-cover" /> : previewName.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-lg font-black text-slate-950">{previewName}</span>
            <span className="block truncate text-sm font-bold text-[var(--accent-deep)]">@{previewUsername}</span>
          </span>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-black text-slate-900">Display Name</span>
          <input
            value={values.displayName}
            onChange={(event) => onUpdate({ displayName: event.target.value })}
            maxLength={80}
            autoComplete="nickname"
            className="h-12 rounded-lg border border-[var(--line-strong)] px-4 text-sm font-semibold outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
          />
          {errors.displayName ? <span className="text-xs font-bold text-red-600">{errors.displayName}</span> : null}
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-black text-slate-900">Username</span>
          <span className="flex h-12 items-center rounded-lg border border-[var(--line-strong)] bg-white px-4 focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent-soft)]">
            <span className="font-black text-[var(--accent-deep)]">@</span>
            <input
              value={values.username}
              onChange={(event) => onUpdate({ username: event.target.value.toLowerCase().replace(/^@+/, '') })}
              className="min-w-0 flex-1 border-0 bg-transparent px-1 text-sm font-black text-slate-950 outline-none"
              autoCapitalize="none"
              autoComplete="username"
              spellCheck={false}
            />
          </span>
          <span className={`text-xs font-bold ${errors.username || usernameStatus === 'taken' ? 'text-red-600' : usernameStatus === 'available' ? 'text-emerald-700' : 'text-[var(--muted)]'}`}>
            {usernameMessage}
          </span>
        </label>

        <label className="grid gap-2">
          <span className="flex items-center gap-2 text-sm font-black text-slate-900">
            Avatar
            <span className="optional-label">Optional</span>
          </span>
          <input type="file" accept={avatarTypes.join(',')} onChange={handleAvatarChange} className="text-sm font-semibold text-slate-700 file:mr-4 file:h-10 file:rounded-lg file:border-0 file:bg-black file:px-4 file:text-sm file:font-black file:text-white" />
          <span className="text-xs font-semibold text-[var(--muted)]">JPEG, PNG, or WebP up to 5MB. You can continue without an avatar.</span>
          {isUploadingAvatar ? <span className="text-xs font-bold text-[var(--accent-deep)]">Uploading avatar...</span> : null}
          {errors.avatar ? <span className="text-xs font-bold text-red-600">{errors.avatar}</span> : null}
        </label>
      </div>
    </OnboardingLayout>
  )
}

export default OnboardingPublicProfileStep
