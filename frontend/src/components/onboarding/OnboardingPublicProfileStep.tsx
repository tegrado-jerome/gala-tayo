import type { ChangeEvent } from 'react'
import OnboardingLayout from './OnboardingLayout'
import type { OnboardingErrors, OnboardingFormState } from './types'
import { avatarUploadAccept } from '../../utils/avatarUpload'

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

type OnboardingPublicProfileStepProps = {
  values: Pick<OnboardingFormState, 'displayName' | 'username' | 'avatarUrl'>
  errors: OnboardingErrors
  usernameStatus: UsernameStatus
  isUploadingAvatar: boolean
  disableNext: boolean
  onUpdate: (updates: Partial<OnboardingFormState>) => void
  onAvatarSelected: (file: File) => void
  onBack: () => void
  onNext: () => void
}

function OnboardingPublicProfileStep({
  values,
  errors,
  usernameStatus,
  isUploadingAvatar,
  disableNext,
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
    event.target.value = ''

    if (!file) {
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
          <button type="button" onClick={onBack} className="onboarding-button onboarding-button-secondary">
            Back
          </button>
          <button type="button" onClick={onNext} disabled={disableNext || usernameStatus === 'checking' || isUploadingAvatar} className="onboarding-button onboarding-button-primary disabled:cursor-not-allowed disabled:opacity-60">
            {usernameStatus === 'checking' ? 'Checking...' : 'Next'}
          </button>
        </>
      }
    >
      <div className="onboarding-form-grid">
        <div className="onboarding-preview">
          <span className="onboarding-avatar">
            {values.avatarUrl ? <img src={values.avatarUrl} alt="" className="h-full w-full object-cover" /> : previewName.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-black text-slate-950 sm:text-lg">{previewName}</span>
            <span className="block truncate text-xs font-bold text-[var(--accent-deep)] sm:text-sm">@{previewUsername}</span>
          </span>
        </div>

        <label className="onboarding-field">
          <span className="onboarding-label">Display Name</span>
          <input
            value={values.displayName}
            onChange={(event) => onUpdate({ displayName: event.target.value })}
            maxLength={80}
            autoComplete="nickname"
            className="onboarding-input"
          />
          {errors.displayName ? <span className="onboarding-error">{errors.displayName}</span> : null}
        </label>

        <label className="onboarding-field">
          <span className="onboarding-label">Username</span>
          <span className="onboarding-input onboarding-input-row">
            <span className="font-black text-[var(--accent-deep)]">@</span>
            <input
              value={values.username}
              onChange={(event) => onUpdate({ username: event.target.value.toLowerCase().replace(/^@+/, '') })}
              className="min-w-0 flex-1 border-0 bg-transparent px-1 text-[13px] font-black text-slate-950 outline-none sm:text-sm"
              autoCapitalize="none"
              autoComplete="username"
              spellCheck={false}
            />
          </span>
          <span className={`onboarding-status ${errors.username || usernameStatus === 'taken' ? 'is-error' : usernameStatus === 'available' ? 'is-success' : ''}`}>
            {usernameMessage}
          </span>
        </label>

        <label className="onboarding-field">
          <span className="onboarding-label onboarding-label-inline">
            Avatar
            <span className="optional-label">Optional</span>
          </span>
          <input
            type="file"
            accept={avatarUploadAccept}
            onChange={handleAvatarChange}
            className="onboarding-file-input"
            disabled={isUploadingAvatar}
            aria-busy={isUploadingAvatar}
          />
          {isUploadingAvatar ? (
            <div className="onboarding-uploading-banner" aria-live="polite">
              <span className="onboarding-uploading-spinner" aria-hidden="true" />
              <div className="min-w-0">
                <p className="onboarding-uploading-title">Uploading photo...</p>
                <p className="onboarding-uploading-copy">Please wait while we prepare and upload your avatar.</p>
              </div>
            </div>
          ) : (
            <span className="onboarding-help">JPEG, PNG, or WebP up to 5MB. You can continue without an avatar.</span>
          )}
          {errors.avatar ? <span className="onboarding-error">{errors.avatar}</span> : null}
        </label>
      </div>
    </OnboardingLayout>
  )
}

export default OnboardingPublicProfileStep
