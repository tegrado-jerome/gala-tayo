import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import OnboardingAgreementStep from '../components/onboarding/OnboardingAgreementStep'
import OnboardingPersonalInfoStep from '../components/onboarding/OnboardingPersonalInfoStep'
import OnboardingPrivacyStep from '../components/onboarding/OnboardingPrivacyStep'
import OnboardingPublicProfileStep from '../components/onboarding/OnboardingPublicProfileStep'
import OnboardingWelcomeStep from '../components/onboarding/OnboardingWelcomeStep'
import { StateContainer } from '../components/layout/ResponsiveLayouts'
import type { OnboardingErrors, OnboardingFormState, OnboardingStep } from '../components/onboarding/types'
import {
  checkUsernameAvailable,
  completeOnboardingSetup,
  getOnboardingDraft,
  saveOnboardingDraft as saveRemoteOnboardingDraft,
  uploadProfileAvatar,
} from '../services/onboardingApi'
import { getOnboardingStatus } from '../utils/profileApi'
import { avatarUploadErrorMessage, isValidAvatarFile, prepareAvatarUploadFile } from '../utils/avatarUpload'
import { navigateToPath } from '../utils/navigation'

type OnboardingPageProps = {
  session: Session
  onComplete?: () => void
}

const MINIMUM_AGE = 13
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
    return 'You need to enter a username.'
  }

  if (!usernamePattern.test(username)) {
    return 'Your username must be 3-30 lowercase letters, numbers, underscores, or dots only.'
  }

  if (username.startsWith('.')) {
    return 'Your username cannot start with a dot.'
  }

  if (username.endsWith('.')) {
    return 'Your username cannot end with a dot.'
  }

  if (username.includes('..')) {
    return 'Your username cannot contain consecutive dots.'
  }

  return ''
}

function trimError(value: string, label: string, maxLength = 80) {
  const trimmed = value.trim()

  if (!trimmed) {
    return `You forgot to enter your ${label}.`
  }

  if (trimmed.length > maxLength) {
    return `Your ${label} must be ${maxLength} characters or less.`
  }

  return ''
}

function validateBirthdate(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return 'You forgot to enter your birthdate.'
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return 'Your birthdate must use YYYY-MM-DD format.'
  }

  const date = new Date(`${trimmed}T00:00:00.000Z`)

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    return 'You entered an invalid birthdate.'
  }

  const now = new Date()
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  if (date > todayUtc) {
    return 'Your birthdate cannot be in the future.'
  }

  if (date < new Date('1900-01-01T00:00:00.000Z')) {
    return 'Your birthdate cannot be before 1900-01-01.'
  }

  let age = todayUtc.getUTCFullYear() - date.getUTCFullYear()
  const monthDiff = todayUtc.getUTCMonth() - date.getUTCMonth()

  if (monthDiff < 0 || (monthDiff === 0 && todayUtc.getUTCDate() < date.getUTCDate())) {
    age--
  }

  if (age < MINIMUM_AGE) {
    return `You must be at least ${MINIMUM_AGE} years old to use GalaTayo.`
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

  const normalizedProfileVisibility = values.profileVisibility === 'private' ? 'private' : 'public'
  const shouldShowFollowLists = normalizedProfileVisibility === 'public'

  return {
    ...fallbackValues,
    ...values,
    step: isValidStep(values.step) ? values.step : fallbackValues.step,
    profileVisibility: normalizedProfileVisibility,
    showFollowers: shouldShowFollowLists,
    showFollowing: shouldShowFollowLists,
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
  const valuesRef = useRef(values)
  valuesRef.current = values

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
          navigateToPath('/')
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
    setErrors((currentErrors) => {
      if (!usernameValidationError) {
        const { username: _username, ...rest } = currentErrors
        return rest as OnboardingErrors
      }

      return { ...currentErrors, username: usernameValidationError }
    })

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

          if (!result.available) {
            setErrors((currentErrors) => ({
              ...currentErrors,
              username: result.reason || 'That username is already taken.',
            }))
          }
        })
        .catch(() => {
          if (isMounted) {
            setUsernameStatus('taken')
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
    setValues((currentValues) => {
      const nextValues = { ...currentValues, ...updates }

      if (updates.profileVisibility) {
        const shouldShowFollowLists = updates.profileVisibility === 'public'
        nextValues.showFollowers = shouldShowFollowLists
        nextValues.showFollowing = shouldShowFollowLists
      }

      return nextValues
    })
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
        nextErrors.middleName = 'Your Middle Name must be 80 characters or less.'
      }
    }

    if (step === 3) {
      nextErrors.displayName = trimError(values.displayName, 'Display Name')
      nextErrors.username = usernameValidationError || errors.username

      if (usernameStatus === 'checking') {
        nextErrors.username = 'Please wait, we are checking your username...'
      }

      if (usernameStatus === 'taken') {
        nextErrors.username = nextErrors.username || 'That username is already taken by someone else. Choose another.'
      }
    }

    if (step === 4 && values.profileVisibility !== 'public' && values.profileVisibility !== 'private') {
      nextErrors.profileVisibility = 'Please select whether you want a Public or Private profile.'
    }

    if (step === 5 && (!values.acceptedTerms || !values.acceptedPrivacy)) {
      nextErrors.form = 'You need to agree to both the Terms of Service and Privacy Policy to continue.'
    }

    const activeErrors = Object.fromEntries(Object.entries(nextErrors).filter(([, value]) => Boolean(value))) as OnboardingErrors
    setErrors(activeErrors)
    return Object.keys(activeErrors).length === 0
  }

  const nextStep = () => {
    const currentValues = valuesRef.current

    if (!validateStep(currentValues.step)) {
      return
    }

    goToStep(Math.min(5, currentValues.step + 1) as OnboardingStep)
  }

  const previousStep = () => {
    goToStep(Math.max(1, values.step - 1) as OnboardingStep)
  }

  const handleAvatarSelected = async (file: File) => {
    if (!isValidAvatarFile(file)) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        avatar: avatarUploadErrorMessage,
      }))
      return
    }

    try {
      setIsUploadingAvatar(true)
      setErrors((currentErrors) => ({ ...currentErrors, avatar: '' }))
      const result = await uploadProfileAvatar(await prepareAvatarUploadFile(file), session)
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
      navigateToPath('/')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not finish onboarding.'

      setErrors({
        form: message,
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
      <main className="grid min-h-[100dvh] place-items-center bg-[var(--bg)] px-6 text-[var(--text)]">
        <StateContainer className="flex justify-center">
          <section className="w-full max-w-[420px] rounded-lg bg-white p-5 text-center shadow-[0_18px_42px_rgba(47,116,232,0.12)]">
            <h1 className="text-2xl font-black text-slate-950">Onboarding problem</h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-red-700">{statusError}</p>
          </section>
        </StateContainer>
      </main>
    )
  }

  const hasErrors = Object.values(errors).some((error) => Boolean(error))

  if (values.step === 1) {
    return <OnboardingWelcomeStep onNext={() => goToStep(2)} />
  }

  if (values.step === 2) {
    return (
      <OnboardingPersonalInfoStep
        values={values}
        errors={errors}
        disableNext={hasErrors}
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
        disableNext={hasErrors}
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
        errors={errors}
        disableNext={hasErrors}
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
      disableNext={hasErrors}
      onUpdate={updateValues}
      onBack={previousStep}
      onFinish={() => void finishSetup()}
    />
  )
}

export default OnboardingPage
