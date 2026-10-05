import { useState, type ChangeEvent } from 'react'
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { Camera } from '@phosphor-icons/react/dist/csr/Camera'
import OnboardingLayout from './OnboardingLayout'
import type { OnboardingErrors, OnboardingFormState } from './types'
import { avatarUploadAccept } from '../../utils/avatarUpload'
import { Avatar, Button, Panel, Skeleton, buttonClass, cx } from '../ui'

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
  const previewName = values.displayName.trim() || 'Your name'
  const previewUsername = normalizedUsername || 'username'

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    onAvatarSelected(file)
  }

  const [touched, setTouched] = useState({ displayName: false, username: false })
  const [attemptedNext, setAttemptedNext] = useState(false)
  const displayNameError = attemptedNext || touched.displayName ? errors.displayName : ''
  const usernameError = usernameStatus === 'taken' || attemptedNext || touched.username ? errors.username : ''

  const handleNext = () => {
    setAttemptedNext(true)
    onNext()
  }

  const usernameMessage =
    usernameError ||
    (usernameStatus === 'checking'
      ? 'Checking username...'
      : usernameStatus === 'available'
        ? 'Username is available.'
        : usernameStatus === 'taken'
          ? 'That username is already taken.'
          : 'Use lowercase letters, numbers, underscore, or dot.')
  const usernameIsError = Boolean(usernameError) || usernameStatus === 'taken'

  return (
    <OnboardingLayout
      step={2}
      eyebrow="Public profile"
      title="Build your profile"
      description="Choose how your name shows up and pick a username your barkada can find."
      actions={
        <>
          <Button variant="soft" onClick={onBack}>
            Back
          </Button>
          <Button variant="tara" onClick={handleNext} disabled={(attemptedNext && disableNext) || usernameStatus === 'checking' || isUploadingAvatar}>
            {usernameStatus === 'checking' ? 'Checking...' : 'Next'}
            {usernameStatus === 'checking' ? null : <ArrowRight aria-hidden="true" />}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <Panel className="flex items-center gap-4">
          <Avatar src={values.avatarUrl} name={previewName} size={56} />
          <div className="min-w-0 flex-1">
            <p className="g-h3 truncate">{previewName}</p>
            <p className="g-sm g-mut truncate">@{previewUsername}</p>
          </div>
          <div className="shrink-0">
            <input
              id="onboarding-avatar"
              type="file"
              accept={avatarUploadAccept}
              onChange={handleAvatarChange}
              className="peer sr-only"
              disabled={isUploadingAvatar}
              aria-busy={isUploadingAvatar}
              aria-describedby="onboarding-avatar-msg"
            />
            <label
              htmlFor="onboarding-avatar"
              className={cx(buttonClass({ variant: 'line', size: 'sm' }), 'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2', isUploadingAvatar && 'pointer-events-none opacity-60')}
            >
              <Camera aria-hidden="true" />
              {values.avatarUrl ? 'Change' : 'Add photo'}
            </label>
          </div>
        </Panel>

        <div id="onboarding-avatar-msg" className="-mt-3" aria-live="polite">
          {isUploadingAvatar ? (
            <div aria-busy="true">
              <span className="sr-only">Uploading photo</span>
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
          ) : (
            <p className="g-hint">Photo is optional. JPEG, PNG, or WebP up to 5MB. You can change it later.</p>
          )}
          {errors.avatar ? <p className="g-hint is-error mt-1">{errors.avatar}</p> : null}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="g-field">
            <label htmlFor="onboarding-display-name">Display name</label>
            <input
              id="onboarding-display-name"
              value={values.displayName}
              onChange={(event) => onUpdate({ displayName: event.target.value })}
              onBlur={() => setTouched((current) => ({ ...current, displayName: true }))}
              maxLength={80}
              autoComplete="nickname"
              aria-invalid={Boolean(displayNameError) || undefined}
              aria-describedby={displayNameError ? 'onboarding-display-name-msg' : undefined}
              className="g-input"
            />
            {displayNameError ? <span id="onboarding-display-name-msg" className="g-hint is-error">{displayNameError}</span> : null}
          </div>

          <div className="g-field">
            <label htmlFor="onboarding-username">Username</label>
            <div className="relative">
              <span className="g-mut pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center font-semibold" aria-hidden="true">
                @
              </span>
              <input
                id="onboarding-username"
                value={values.username}
                onChange={(event) => onUpdate({ username: event.target.value.toLowerCase().replace(/^@+/, '') })}
                onBlur={() => setTouched((current) => ({ ...current, username: true }))}
                autoCapitalize="none"
                autoComplete="username"
                spellCheck={false}
                aria-invalid={usernameIsError || undefined}
                aria-describedby="onboarding-username-msg"
                className="g-input !pl-8"
              />
            </div>
            <span
              id="onboarding-username-msg"
              className={cx('g-hint', usernameIsError && 'is-error')}
              style={!usernameIsError && usernameStatus === 'available' ? { color: 'var(--ok)' } : undefined}
              aria-live="polite"
            >
              {usernameMessage}
            </span>
          </div>
        </div>
      </div>
    </OnboardingLayout>
  )
}

export default OnboardingPublicProfileStep
