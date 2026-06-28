import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import OnboardingAgreementStep from '../components/onboarding/OnboardingAgreementStep'
import OnboardingPersonalInfoStep from '../components/onboarding/OnboardingPersonalInfoStep'
import OnboardingPrivacyStep from '../components/onboarding/OnboardingPrivacyStep'
import OnboardingPublicProfileStep from '../components/onboarding/OnboardingPublicProfileStep'
import OnboardingWelcomeStep from '../components/onboarding/OnboardingWelcomeStep'
import type { OnboardingErrors, OnboardingFormState, OnboardingStep } from '../components/onboarding/types'
import {
  checkUsernameAvailable,
  completeOnboardingSetup,
  getOnboardingDraft,
  saveOnboardingDraft as saveRemoteOnboardingDraft,
  uploadProfileAvatar,
} from '../services/onboardingApi'
import { getOnboardingStatus } from '../utils/profileApi'
import { navigateToPath } from '../utils/navigation'

type OnboardingPageProps = {
  session: Session
  onComplete?: () => void
}

const usernamePattern = /^[a-z0-9_.]{3,30}$/
const draftStorageVersion = 1

type StoredOnboardingDraft = {
  version: number
  userId: string
  updatedAt: string
  values: OnboardingFormState
}

function getMetadataString(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key]

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return { firstName: '', lastName: '' }
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' }
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

function validateUsername(username: string) {
  if (!username) {
    return 'Username is required.'
  }

  if (!usernamePattern.test(username)) {
    return 'Use 3-30 lowercase letters, numbers, underscores, or dots.'
  }

  if (username.startsWith('.')) {
    return 'Username cannot start with a dot.'
  }

  if (username.endsWith('.')) {
    return 'Username cannot end with a dot.'
  }

  if (username.includes('..')) {
    return 'Username cannot contain consecutive dots.'
  }

  return ''
}

function trimError(value: string, label: string, maxLength = 80) {
  const trimmed = value.trim()

  if (!trimmed) {
    return `${label} is required.`
  }

  if (trimmed.length > maxLength) {
    return `${label} must be ${maxLength} characters or less.`
  }

  return ''
}

function validateBirthdate(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return 'Birthdate is required.'
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return 'Birthdate must use YYYY-MM-DD format.'
  }

  const date = new Date(`${trimmed}T00:00:00.000Z`)

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    return 'Birthdate must be a real date.'
  }

  const now = new Date()
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  if (date > todayUtc) {
    return 'Birthdate cannot be in the future.'
  }

  if (date < new Date('1900-01-01T00:00:00.000Z')) {
    return 'Birthdate cannot be before 1900-01-01.'
  }

  return ''
}

function getDraftStorageKey(userId: string) {
  return `galatayo:onboarding-draft:${userId}`
}

function isValidStep(value: unknown): value is OnboardingStep {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5
}

function createInitialValues(session: Session): OnboardingFormState {
  const metadata = session.user.user_metadata as Record<string, unknown>
  const fullName = getMetadataString(metadata, ['full_name', 'name'])
  const suggestedName = splitName(fullName)
  const providerAvatarUrl = getMetadataString(metadata, ['avatar_url', 'picture'])

  const fallbackValues: OnboardingFormState = {
    step: 1,
    firstName: suggestedName.firstName,
    middleName: '',
    lastName: suggestedName.lastName,
    birthdate: '',
    displayName: fullName,
    username: '',
    avatarUrl: providerAvatarUrl || null,
    avatarStorageKey: null,
    profileVisibility: 'public',
    showFollowers: true,
    showFollowing: true,
    acceptedTerms: false,
    acceptedPrivacy: false,
  }

  try {
    const rawDraft = window.localStorage.getItem(getDraftStorageKey(session.user.id))

    if (!rawDraft) {
      return fallbackValues
    }

    const draft = JSON.parse(rawDraft) as Partial<StoredOnboardingDraft>

    if (draft.version !== draftStorageVersion || draft.userId !== session.user.id || !draft.values) {
      return fallbackValues
    }

    return normalizeDraftValues(draft.values, fallbackValues)
  } catch {
    return fallbackValues
  }
}

function normalizeDraftValues(values: Partial<OnboardingFormState> | null | undefined, fallbackValues: OnboardingFormState): OnboardingFormState {
  if (!values) {
    return fallbackValues
  }

  return {
    ...fallbackValues,
    ...values,
    step: isValidStep(values.step) ? values.step : fallbackValues.step,
    profileVisibility: values.profileVisibility === 'private' ? 'private' : 'public',
    showFollowers: typeof values.showFollowers === 'boolean' ? values.showFollowers : fallbackValues.showFollowers,
    showFollowing: typeof values.showFollowing === 'boolean' ? values.showFollowing : fallbackValues.showFollowing,
    acceptedTerms: Boolean(values.acceptedTerms),
    acceptedPrivacy: Boolean(values.acceptedPrivacy),
  }
}

function saveLocalOnboardingDraft(userId: string, values: OnboardingFormState) {
  try {
    const draft: StoredOnboardingDraft = {
      version: draftStorageVersion,
      userId,
      updatedAt: new Date().toISOString(),
      values,
    }
    window.localStorage.setItem(getDraftStorageKey(userId), JSON.stringify(draft))
  } catch {
    // Draft saving should never block onboarding.
  }
}

function clearOnboardingDraft(userId: string) {
  try {
    window.localStorage.removeItem(getDraftStorageKey(userId))
  } catch {
    // Draft cleanup is best-effort.
  }
}

function OnboardingPage({ session, onComplete }: OnboardingPageProps) {
  const [draftUserId, setDraftUserId] = useState(session.user.id)
  const [values, setValues] = useState<OnboardingFormState>(() => createInitialValues(session))
  const [errors, setErrors] = useState<OnboardingErrors>({})
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCheckingStatus, setIsCheckingStatus] = useState(true)
  const [isDraftReady, setIsDraftReady] = useState(false)
  const [statusError, setStatusError] = useState('')

  const normalizedUsername = useMemo(() => values.username.trim().toLowerCase().replace(/^@+/, ''), [values.username])
  const usernameValidationError = useMemo(() => validateUsername(normalizedUsername), [normalizedUsername])

  useEffect(() => {
    if (draftUserId !== session.user.id) {
      setDraftUserId(session.user.id)
      setValues(createInitialValues(session))
      setErrors({})
      setIsDraftReady(false)
    }
  }, [draftUserId, session])

  useEffect(() => {
    saveLocalOnboardingDraft(draftUserId, values)
  }, [draftUserId, values])

  useEffect(() => {
    if (!isDraftReady) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      void saveRemoteOnboardingDraft(values, session).catch(() => undefined)
    }, 700)

    return () => window.clearTimeout(timer)
  }, [isDraftReady, session, values])

  useEffect(() => {
    let isMounted = true

    const loadStatus = async () => {
      try {
        setIsCheckingStatus(true)
        setStatusError('')
        const status = await getOnboardingStatus(session)

        if (isMounted && !status.needsOnboarding) {
          clearOnboardingDraft(session.user.id)
          navigateToPath('/home')
          return
        }

        const draft = await getOnboardingDraft(session).catch(() => null)

        if (isMounted && draft?.draft) {
          setValues((currentValues) => normalizeDraftValues(draft.draft, currentValues))
        }
      } catch (error) {
        if (isMounted) {
          setStatusError(error instanceof Error ? error.message : 'Failed to load onboarding status.')
        }
      } finally {
        if (isMounted) {
          setIsDraftReady(true)
          setIsCheckingStatus(false)
        }
      }
    }

    void loadStatus()

    return () => {
      isMounted = false
    }
  }, [session])

  useEffect(() => {
    setErrors((currentErrors) => ({ ...currentErrors, username: usernameValidationError }))

    if (usernameValidationError) {
      setUsernameStatus('invalid')
      return undefined
    }

    let isMounted = true
    const timer = window.setTimeout(() => {
      setUsernameStatus('checking')

      void checkUsernameAvailable(normalizedUsername, session)
        .then((result) => {
          if (!isMounted) {
            return
          }

          setUsernameStatus(result.available ? 'available' : 'taken')
          setErrors((currentErrors) => ({
            ...currentErrors,
            username: result.available ? '' : result.reason || 'That username is already taken.',
          }))
        })
        .catch((error) => {
          if (isMounted) {
            setUsernameStatus('taken')
            setErrors((currentErrors) => ({
              ...currentErrors,
              username: error instanceof Error ? error.message : 'Could not check username.',
            }))
          }
        })
    }, 450)

    return () => {
      isMounted = false
      window.clearTimeout(timer)
    }
  }, [normalizedUsername, session, usernameValidationError])

  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    })
  }, [values.step])

  const updateValues = (updates: Partial<OnboardingFormState>) => {
    setValues((currentValues) => ({ ...currentValues, ...updates }))
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors }
      Object.keys(updates).forEach((key) => {
        delete nextErrors[key as keyof OnboardingErrors]
      })
      return nextErrors
    })
  }

  const goToStep = (step: OnboardingStep) => {
    setValues((currentValues) => ({ ...currentValues, step }))
    setErrors({})
  }

  const validateStep = (step: OnboardingStep) => {
    const nextErrors: OnboardingErrors = {}

    if (step === 2) {
      nextErrors.firstName = trimError(values.firstName, 'First Name')
      nextErrors.lastName = trimError(values.lastName, 'Last Name')
      nextErrors.birthdate = validateBirthdate(values.birthdate)

      if (values.middleName.trim().length > 80) {
        nextErrors.middleName = 'Middle Name must be 80 characters or less.'
      }
    }

    if (step === 3) {
      nextErrors.displayName = trimError(values.displayName, 'Display Name')
      nextErrors.username = usernameValidationError || errors.username

      if (usernameStatus === 'checking') {
        nextErrors.username = 'Checking username...'
      }

      if (usernameStatus === 'taken') {
        nextErrors.username = nextErrors.username || 'That username is already taken.'
      }
    }

    if (step === 4 && values.profileVisibility !== 'public' && values.profileVisibility !== 'private') {
      nextErrors.profileVisibility = 'Choose public or private.'
    }

    if (step === 5 && (!values.acceptedTerms || !values.acceptedPrivacy)) {
      nextErrors.form = 'You must agree to the Terms of Service and Privacy Policy.'
    }

    const activeErrors = Object.fromEntries(Object.entries(nextErrors).filter(([, value]) => Boolean(value))) as OnboardingErrors
    setErrors(activeErrors)
    return Object.keys(activeErrors).length === 0
  }

  const nextStep = () => {
    if (!validateStep(values.step)) {
      return
    }

    goToStep(Math.min(5, values.step + 1) as OnboardingStep)
  }

  const previousStep = () => {
    goToStep(Math.max(1, values.step - 1) as OnboardingStep)
  }

  const handleAvatarSelected = async (file: File) => {
    try {
      setIsUploadingAvatar(true)
      setErrors((currentErrors) => ({ ...currentErrors, avatar: '' }))
      const result = await uploadProfileAvatar(file, session)
      updateValues({ avatarUrl: result.avatar_url, avatarStorageKey: result.avatar_storage_key })
    } catch (error) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        avatar: error instanceof Error ? error.message : 'Avatar upload failed. You can continue without one.',
      }))
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const finishSetup = async () => {
    if (!validateStep(5)) {
      return
    }

    try {
      setIsSubmitting(true)
      setErrors({})
      await completeOnboardingSetup({ ...values, username: normalizedUsername }, session)
      clearOnboardingDraft(session.user.id)
      onComplete?.()
      navigateToPath('/home')
    } catch (error) {
      setErrors({
        form: error instanceof Error ? error.message : 'Could not finish onboarding.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isCheckingStatus) {
    return null
  }

  if (statusError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 text-[var(--text)]">
        <section className="w-full max-w-[420px] rounded-lg bg-white p-5 text-center shadow-[0_18px_42px_rgba(47,116,232,0.12)]">
          <h1 className="text-2xl font-black text-slate-950">Onboarding problem</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-red-700">{statusError}</p>
        </section>
      </main>
    )
  }

  if (values.step === 1) {
    return <OnboardingWelcomeStep onNext={() => goToStep(2)} />
  }

  if (values.step === 2) {
    return (
      <OnboardingPersonalInfoStep
        values={values}
        errors={errors}
        onUpdate={updateValues}
        onBack={previousStep}
        onNext={nextStep}
      />
    )
  }

  if (values.step === 3) {
    return (
      <OnboardingPublicProfileStep
        values={values}
        errors={errors}
        usernameStatus={usernameStatus}
        isUploadingAvatar={isUploadingAvatar}
        onUpdate={updateValues}
        onAvatarSelected={handleAvatarSelected}
        onBack={previousStep}
        onNext={nextStep}
      />
    )
  }

  if (values.step === 4) {
    return (
      <OnboardingPrivacyStep
        values={values}
        onUpdate={updateValues}
        onBack={previousStep}
        onNext={nextStep}
      />
    )
  }

  return (
    <OnboardingAgreementStep
      values={values}
      errors={errors}
      isSubmitting={isSubmitting}
      onUpdate={updateValues}
      onBack={previousStep}
      onFinish={() => void finishSetup()}
    />
  )
}

export default OnboardingPage
