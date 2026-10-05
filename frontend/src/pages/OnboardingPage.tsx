import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import OnboardingAgreementStep from '../components/onboarding/OnboardingAgreementStep'
import OnboardingPersonalInfoStep from '../components/onboarding/OnboardingPersonalInfoStep'
import OnboardingPrivacyStep from '../components/onboarding/OnboardingPrivacyStep'
import OnboardingPublicProfileStep from '../components/onboarding/OnboardingPublicProfileStep'
import { AuthNotice } from '../components/auth/AuthCard'
import type { OnboardingErrors, OnboardingFormState, OnboardingStep } from '../components/onboarding/types'
import {
  checkUsernameAvailable,
  completeOnboardingSetup,
  getOnboardingDraft,
  saveOnboardingDraft as saveRemoteOnboardingDraft,
  uploadProfileAvatar,
} from '../services/onboardingApi'
import { clearSignupOnboardingAccess } from '../services/authApi'
import { getCurrentUser, getOnboardingStatus, validateUsername, type CurrentUserResponse } from '../utils/profileApi'
import { avatarUploadErrorMessage, isValidAvatarFile, prepareAvatarUploadFile } from '../utils/avatarUpload'
import { preloadAvatarImage } from '../utils/avatarImageCache'
import { replaceWithPath } from '../utils/navigation'
import { trackOnboardingCompleted } from '../utils/analytics'

type OnboardingPageProps = {
  session: Session
  onComplete?: (account?: CurrentUserResponse) => void
}

const MINIMUM_AGE = 13
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

function validateUsernameLocally(username: string) {
  if (!username) {
    return 'You need to enter a username.'
  }

  return validateUsername(username) || ''
}

function buildUsernameSuggestion(firstName: string, lastName: string) {
  const toPart = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
  const suggestion = [toPart(firstName), toPart(lastName)].filter(Boolean).join('_').slice(0, 27).replace(/_+$/, '')

  return validateUsernameLocally(suggestion) ? '' : suggestion
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
  return value === 1 || value === 2 || value === 3 || value === 4
}

function normalizeStep(value: unknown, fallbackStep: OnboardingStep): OnboardingStep {
  if (isValidStep(value)) {
    return value
  }

  if (value === 5) {
    return 4
  }

  return fallbackStep
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
    step: normalizeStep(values.step, fallbackValues.step),
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

function clearSignupOnboardingAccessAfterHomeRedirect() {
  window.setTimeout(() => {
    clearSignupOnboardingAccess()
  }, 1000)
}

async function loadCompletedAccountForHome(session: Session) {
  const account = await getCurrentUser(session)
  const avatarUrl = account.profile?.avatarUrl ?? account.profile?.providerAvatarUrl ?? null
  await preloadAvatarImage(avatarUrl)
  return account
}

function OnboardingPage({ session, onComplete }: OnboardingPageProps) {
  const [draftUserId, setDraftUserId] = useState(session.user.id)
  const [values, setValues] = useState<OnboardingFormState>(() => createInitialValues(session))
  const [errors, setErrors] = useState<OnboardingErrors>({})
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDraftReady, setIsDraftReady] = useState(false)
  const [isRedirectingHome, setIsRedirectingHome] = useState(false)
  const [statusError, setStatusError] = useState('')
  const valuesRef = useRef(values)
  valuesRef.current = values
  const sessionRef = useRef(session)
  sessionRef.current = session
  const hasSuggestedUsernameRef = useRef(false)
  const pendingSuggestionRef = useRef<string | null>(null)

  const normalizedUsername = useMemo(() => values.username.trim().toLowerCase().replace(/^@+/, ''), [values.username])
  const usernameValidationError = useMemo(() => validateUsernameLocally(normalizedUsername), [normalizedUsername])

  useEffect(() => {
    if (draftUserId !== session.user.id) {
      setDraftUserId(session.user.id)
      setValues(createInitialValues(session))
      setErrors({})
      setIsDraftReady(false)
    }
  }, [draftUserId, session])

  useEffect(() => {
    if (isRedirectingHome) {
      return
    }

    const timer = window.setTimeout(() => {
      saveLocalOnboardingDraft(draftUserId, values)
    }, 200)

    return () => window.clearTimeout(timer)
  }, [draftUserId, isRedirectingHome, values])

  useEffect(() => {
    if (isRedirectingHome || !isDraftReady) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      void saveRemoteOnboardingDraft(values, session).catch(() => undefined)
    }, 700)

    return () => window.clearTimeout(timer)
  }, [isDraftReady, isRedirectingHome, session, values])

  useEffect(() => {
    if (isRedirectingHome) {
      return undefined
    }

    let isMounted = true

    const loadStatus = async () => {
      try {
        setStatusError('')
        const status = await getOnboardingStatus(session)

        if (isMounted && !status.needsOnboarding) {
          const account = await loadCompletedAccountForHome(session)
          clearOnboardingDraft(session.user.id)
          onComplete?.(account)
          replaceWithPath('/home')
          clearSignupOnboardingAccessAfterHomeRedirect()
          setIsRedirectingHome(true)
          return
        }

        const draft = await getOnboardingDraft(session).catch(() => null)

        if (isMounted && draft?.draft) {
          setValues((currentValues) => normalizeDraftValues(draft.draft, currentValues))
        }
      } catch (error) {
        if (isMounted) {
          setStatusError(error instanceof Error ? error.message : 'Failed to refresh your onboarding draft.')
        }
      } finally {
        if (isMounted) {
          setIsDraftReady(true)
        }
      }
    }

    void loadStatus()

    return () => {
      isMounted = false
    }
  }, [isRedirectingHome, onComplete, session.user.id])

  useEffect(() => {
    if (values.step !== 2) {
      hasSuggestedUsernameRef.current = false
      return
    }

    if (!isDraftReady || hasSuggestedUsernameRef.current) {
      return
    }

    hasSuggestedUsernameRef.current = true

    if (values.username.trim()) {
      return
    }

    const suggestion = buildUsernameSuggestion(values.firstName, values.lastName)

    if (suggestion) {
      pendingSuggestionRef.current = suggestion
      setValues((currentValues) => (currentValues.username.trim() ? currentValues : { ...currentValues, username: suggestion }))
    }
  }, [isDraftReady, values.firstName, values.lastName, values.step, values.username])

  useEffect(() => {
    if (values.step !== 2) {
      setUsernameStatus('idle')
      setErrors((currentErrors) => {
        if (!currentErrors.username) {
          return currentErrors
        }

        const { username: _username, ...rest } = currentErrors
        return rest as OnboardingErrors
      })
      return undefined
    }

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

      void checkUsernameAvailable(normalizedUsername, sessionRef.current)
        .then((result) => {
          if (!isMounted) {
            return
          }

          if (!result.available && pendingSuggestionRef.current === normalizedUsername) {
            pendingSuggestionRef.current = null
            const retry = `${normalizedUsername}${Math.floor(10 + Math.random() * 90)}`
            setValues((currentValues) => (currentValues.username === normalizedUsername ? { ...currentValues, username: retry } : currentValues))
            return
          }

          pendingSuggestionRef.current = null
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
  }, [normalizedUsername, usernameValidationError, values.step])

  useEffect(() => {
    if (isRedirectingHome) {
      return
    }

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    })
  }, [isRedirectingHome, values.step])

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

    if (step === 1) {
      nextErrors.firstName = trimError(values.firstName, 'First Name')
      nextErrors.lastName = trimError(values.lastName, 'Last Name')
      nextErrors.birthdate = validateBirthdate(values.birthdate)

      if (values.middleName.trim().length > 80) {
        nextErrors.middleName = 'Your Middle Name must be 80 characters or less.'
      }
    }

    if (step === 2) {
      nextErrors.displayName = trimError(values.displayName, 'Display Name')
      nextErrors.username = usernameValidationError || errors.username

      if (usernameStatus === 'checking') {
        nextErrors.username = 'Please wait, we are checking your username...'
      }

      if (usernameStatus === 'taken') {
        nextErrors.username = nextErrors.username || 'That username is already taken by someone else. Choose another.'
      }
    }

    if (step === 3 && values.profileVisibility !== 'public' && values.profileVisibility !== 'private') {
      nextErrors.profileVisibility = 'Please select whether you want a Public or Private profile.'
    }

    if (step === 4 && (!values.acceptedTerms || !values.acceptedPrivacy)) {
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

    goToStep(Math.min(4, currentValues.step + 1) as OnboardingStep)
  }

  const previousStep = () => {
    goToStep(Math.max(1, values.step - 1) as OnboardingStep)
  }

  const handleAvatarSelected = async (file: File) => {
    if (!(await isValidAvatarFile(file))) {
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
    if (!validateStep(4)) {
      return
    }

    try {
      setIsSubmitting(true)
      setErrors({})
      await completeOnboardingSetup({ ...values, username: normalizedUsername }, session)
      const account = await loadCompletedAccountForHome(session)
      trackOnboardingCompleted({
        method: 'profile_setup',
      })
      clearOnboardingDraft(session.user.id)
      onComplete?.(account)
      replaceWithPath('/home')
      clearSignupOnboardingAccessAfterHomeRedirect()
      setIsRedirectingHome(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not finish onboarding.'

      setErrors({
        form: message,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const currentStepErrorKeys: Array<keyof OnboardingErrors> =
    values.step === 1
      ? ['firstName', 'middleName', 'lastName', 'birthdate']
      : values.step === 2
        ? ['displayName', 'username', 'avatar']
        : values.step === 3
          ? ['profileVisibility']
          : ['form']
  const hasCurrentStepErrors = currentStepErrorKeys.some((key) => Boolean(errors[key]))

  if (isRedirectingHome) {
    return null
  }

  let content = (
    <OnboardingPersonalInfoStep
      values={values}
      errors={errors}
      disableNext={hasCurrentStepErrors}
      onUpdate={updateValues}
      onNext={nextStep}
    />
  )

  if (values.step === 2) {
    content = (
      <OnboardingPublicProfileStep
        values={values}
        errors={errors}
        usernameStatus={usernameStatus}
        isUploadingAvatar={isUploadingAvatar}
        disableNext={hasCurrentStepErrors}
        onUpdate={updateValues}
        onAvatarSelected={handleAvatarSelected}
        onBack={previousStep}
        onNext={nextStep}
      />
    )
  } else if (values.step === 3) {
    content = (
      <OnboardingPrivacyStep
        values={values}
        errors={errors}
        disableNext={hasCurrentStepErrors}
        onUpdate={updateValues}
        onBack={previousStep}
        onNext={nextStep}
      />
    )
  } else if (values.step === 4) {
    content = (
      <OnboardingAgreementStep
        values={values}
        errors={errors}
        isSubmitting={isSubmitting}
        disableNext={hasCurrentStepErrors}
        onUpdate={updateValues}
        onBack={previousStep}
        onFinish={() => void finishSetup()}
      />
    )
  }

  return (
    <>
      {statusError ? (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-[80] flex justify-center px-4">
          <AuthNotice tone="warn" className="w-full max-w-[520px] text-center">
            {statusError}
          </AuthNotice>
        </div>
      ) : null}
      {content}
    </>
  )
}

export default OnboardingPage
