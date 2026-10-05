import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ChevronRight } from 'lucide-react'
import BirthdatePicker from '../components/BirthdatePicker'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import ProfileAvatar from '../components/ProfileAvatar'
import { Button, Empty, Page, buttonClass } from '../components/ui'
import { useAppUser } from '../context/AppUserContext'
import { useSystemMessage } from '../context/SystemMessageContext'
import { uploadProfileAvatar } from '../services/onboardingApi'
import { avatarUploadAccept, avatarUploadErrorMessage, isValidAvatarFile, prepareAvatarUploadFile } from '../utils/avatarUpload'
import {
  getCurrentUser,
  getMyProfile,
  normalizeUsername,
  type CurrentUserResponse,
  type Profile,
  updateCurrentUser,
  updateMyProfile,
  validateUsername,
} from '../utils/profileApi'
import { navigateToPath } from '../utils/navigation'
import { FormSkeleton } from '../components/loading/SkeletonStates'

type AccountSettingsPageProps = {
  session: Session
}

type AccountSettingsResumeCache = {
  currentUser: CurrentUserResponse | null
  profile: Profile | null
  cachedAt: number
}

const ACCOUNT_SETTINGS_RESUME_CACHE_PREFIX = 'galatayo:account-settings:'
const ACCOUNT_SETTINGS_RESUME_CACHE_TTL_MS = 30 * 60 * 1000

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not available'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Not available'
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function isValidBirthdate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function emitAccountUpdated() {
  window.dispatchEvent(new Event('galatayo:account-updated'))
}

function getAccountSettingsResumeCacheKey(userId: string) {
  return `${ACCOUNT_SETTINGS_RESUME_CACHE_PREFIX}${userId}`
}

function readAccountSettingsResumeCache(userId: string): AccountSettingsResumeCache | null {
  try {
    const rawCache = window.localStorage.getItem(getAccountSettingsResumeCacheKey(userId))

    if (!rawCache) {
      return null
    }

    const parsedCache = JSON.parse(rawCache) as Partial<AccountSettingsResumeCache>
    if (
      typeof parsedCache.cachedAt !== 'number' ||
      !Number.isFinite(parsedCache.cachedAt) ||
      Date.now() - parsedCache.cachedAt > ACCOUNT_SETTINGS_RESUME_CACHE_TTL_MS
    ) {
      window.localStorage.removeItem(getAccountSettingsResumeCacheKey(userId))
      return null
    }

    return {
      currentUser:
        parsedCache.currentUser && typeof parsedCache.currentUser === 'object'
          ? parsedCache.currentUser as CurrentUserResponse
          : null,
      profile:
        parsedCache.profile && typeof parsedCache.profile === 'object'
          ? parsedCache.profile as Profile
          : null,
      cachedAt: parsedCache.cachedAt,
    }
  } catch {
    return null
  }
}

function writeAccountSettingsResumeCache(userId: string, cache: AccountSettingsResumeCache) {
  try {
    window.localStorage.setItem(getAccountSettingsResumeCacheKey(userId), JSON.stringify(cache))
  } catch {
    // localStorage may be unavailable, ignore
  }
}

const optionalLabel = <span className="g-fnt font-normal">Optional</span>

function SettingsRow({ label, value, onClick }: { label: string; value?: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">{label}</span>
      {value || onClick ? (
        <span className="g-group-end min-w-0">
          {value ? <span className="truncate">{value}</span> : null}
          {onClick ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
        </span>
      ) : null}
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className="g-group-row">
      {body}
    </button>
  ) : (
    <div className="g-group-row cursor-default hover:bg-transparent">{body}</div>
  )
}

function SettingsSection({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="g-h2">{title}</h2>
      {sub ? <p className="g-sm g-mut mt-1">{sub}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function AccountSettingsPage({ session }: AccountSettingsPageProps) {
  const { currentProfile } = useAppUser()
  const fallbackCurrentUser: CurrentUserResponse = {
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      firstName: null,
      middleName: null,
      lastName: null,
      birthdate: null,
      role: 'user',
      lastSeenAt: null,
      termsAcceptedAt: null,
      privacyAcceptedAt: null,
      termsVersion: null,
      privacyVersion: null,
      defaultGalaPlanVisibility: 'private',
      followersVisibility: 'private',
      followingVisibility: 'private',
      showPublicPlansOnProfile: false,
    },
    profile: currentProfile
      ? {
          userId: currentProfile.userId,
          username: currentProfile.username,
          displayName: currentProfile.displayName,
          avatarUrl: currentProfile.avatarUrl,
          providerAvatarUrl: currentProfile.providerAvatarUrl,
          bio: currentProfile.bio,
          isPublic: currentProfile.isPublic,
          onboardingCompletedAt: currentProfile.onboardingCompletedAt,
        }
      : null,
    onboarding: {
      completed: Boolean(currentProfile?.onboardingCompletedAt),
    },
  }
  const fallbackProfile: Profile = {
    user_id: session.user.id,
    username: currentProfile?.username ?? '',
    avatar_url: currentProfile?.avatarUrl ?? null,
    provider_avatar_url: currentProfile?.providerAvatarUrl ?? null,
    bio: currentProfile?.bio ?? null,
    is_public: currentProfile?.isPublic ?? true,
    show_followers: 'everyone',
    show_following: 'everyone',
    default_gala_plan_visibility: 'private',
    followers_count: 0,
    following_count: 0,
    onboarding_completed_at: currentProfile?.onboardingCompletedAt ?? null,
    created_at: '',
    updated_at: '',
  }
  const initialResumeCache = useMemo(() => readAccountSettingsResumeCache(session.user.id), [session.user.id])
  const initialCachedCurrentUser = initialResumeCache?.currentUser ?? null
  const initialCachedProfile = initialResumeCache?.profile ?? null
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(initialResumeCache?.currentUser ?? fallbackCurrentUser)
  const [profile, setProfile] = useState<Profile | null>(initialResumeCache?.profile ?? fallbackProfile)
  const [isLoading, setIsLoading] = useState(false)
  const [, setIsRefreshing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const { showSystemMessage } = useSystemMessage()
  const birthdateSaveQueueRef = useRef(Promise.resolve())

  const [firstName, setFirstName] = useState(initialCachedCurrentUser?.user.firstName ?? '')
  const [lastName, setLastName] = useState(initialCachedCurrentUser?.user.lastName ?? '')
  const [birthdate, setBirthdate] = useState(initialCachedCurrentUser?.user.birthdate ?? '')
  const [displayName, setDisplayName] = useState(initialCachedCurrentUser?.profile?.displayName ?? currentProfile?.displayName ?? '')
  const [usernameInput, setUsernameInput] = useState(initialCachedProfile?.username ?? currentProfile?.username ?? '')
  const [bioInput, setBioInput] = useState(initialCachedProfile?.bio ?? '')
  const [isPublic, setIsPublic] = useState(initialCachedProfile?.is_public ?? true)

  useEffect(() => {
    if (!currentProfile) {
      return
    }

    setCurrentUser((currentValue) =>
      currentValue
        ? {
            ...currentValue,
            profile: currentValue.profile
              ? {
                  ...currentValue.profile,
                  ...currentProfile,
                }
              : currentProfile,
          }
        : currentValue
    )
  }, [currentProfile])


  const normalizedUsername = useMemo(() => normalizeUsername(usernameInput), [usernameInput])
  const usernameError = normalizedUsername ? validateUsername(normalizedUsername) : 'Username is required.'
  const birthdateError = birthdate && !isValidBirthdate(birthdate) ? 'Birthdate must use a real YYYY-MM-DD date.' : ''
  const personalInfoError =
    !firstName.trim() ? 'First Name is required.' : !lastName.trim() ? 'Last Name is required.' : !displayName.trim() ? 'Display Name is required.' : birthdateError

  useEffect(() => {
    let isMounted = true

    const loadSettings = async () => {
      try {
        if (initialResumeCache) {
          setIsRefreshing(true)
        }
        setErrorMessage('')

        const [accountData, profileData] = await Promise.all([
          getCurrentUser(session),
          getMyProfile(session),
        ])

        if (!isMounted) {
          return
        }

        setCurrentUser(accountData)
        setProfile(profileData.profile)
        setFirstName(accountData.user.firstName ?? '')
        setLastName(accountData.user.lastName ?? '')
        setBirthdate(accountData.user.birthdate ?? '')
        setDisplayName(accountData.profile?.displayName ?? '')
        setUsernameInput(profileData.profile?.username ?? '')
        setBioInput(profileData.profile?.bio ?? '')
        setIsPublic(profileData.profile?.is_public ?? true)
        writeAccountSettingsResumeCache(session.user.id, {
          currentUser: accountData,
          profile: profileData.profile,
          cachedAt: Date.now(),
        })
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load account settings.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
          setIsRefreshing(false)
        }
      }
    }

    void loadSettings()

    return () => {
      isMounted = false
    }
  }, [session])

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (personalInfoError) {
      setErrorMessage(personalInfoError)
      return
    }

    if (usernameError) {
      setErrorMessage(usernameError)
      return
    }

    try {
      setIsSaving(true)
      setErrorMessage('')

      const [accountData, profileData] = await Promise.all([
        updateCurrentUser(
          {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            birthdate: birthdate.trim(),
            displayName: displayName.trim(),
          },
          session,
        ),
        updateMyProfile(
          {
            username: normalizedUsername,
            bio: bioInput.trim() || null,
            is_public: isPublic,
          },
          session,
        ),
      ])

      setCurrentUser(accountData)
      setProfile(profileData.profile)
      setFirstName(accountData.user.firstName ?? '')
      setLastName(accountData.user.lastName ?? '')
      setBirthdate(accountData.user.birthdate ?? '')
      setDisplayName(accountData.profile?.displayName ?? '')
      setUsernameInput(profileData.profile?.username ?? '')
      setBioInput(profileData.profile?.bio ?? '')
      setIsPublic(profileData.profile?.is_public ?? true)
      writeAccountSettingsResumeCache(session.user.id, {
        currentUser: accountData,
        profile: profileData.profile,
        cachedAt: Date.now(),
      })
      showSystemMessage({
        title: 'Changes saved',
        description: 'Your account settings were updated.',
      })
      emitAccountUpdated()
    } catch (error) {
      const status = (error as Error & { status?: number }).status
      setErrorMessage(
        status === 409
          ? 'That username is taken. Try another one.'
          : error instanceof Error
            ? error.message
            : 'Failed to save account settings.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  const saveBirthdate = (nextBirthdate: string) => {
    const trimmedBirthdate = nextBirthdate.trim()
    const payloadBirthdate = trimmedBirthdate ? trimmedBirthdate : null

    birthdateSaveQueueRef.current = birthdateSaveQueueRef.current
      .then(async () => {
        const accountData = await updateCurrentUser(
          {
            birthdate: payloadBirthdate,
          },
          session,
        )

        setCurrentUser(accountData)
        setBirthdate(accountData.user.birthdate ?? '')
        writeAccountSettingsResumeCache(session.user.id, {
          currentUser: accountData,
          profile,
          cachedAt: Date.now(),
        })
        emitAccountUpdated()
      })
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to save birthdate.')
      })
  }

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    if (!(await isValidAvatarFile(file))) {
      setAvatarError(avatarUploadErrorMessage)
      return
    }

    try {
      setIsUploadingAvatar(true)
      setAvatarError('')
      const result = await uploadProfileAvatar(await prepareAvatarUploadFile(file), session)

      setCurrentUser((currentValue) =>
        currentValue
          ? {
              ...currentValue,
              profile: currentValue.profile
                ? {
                    ...currentValue.profile,
                    avatarUrl: result.avatar_url,
                  }
                : currentValue.profile,
            }
          : currentValue,
      )
      setProfile((currentValue) =>
        currentValue
          ? {
              ...currentValue,
              avatar_url: result.avatar_url,
            }
          : currentValue,
      )
      writeAccountSettingsResumeCache(session.user.id, {
        currentUser: currentUser
          ? {
              ...currentUser,
              profile: currentUser.profile
                ? {
                    ...currentUser.profile,
                    avatarUrl: result.avatar_url,
                  }
                : currentUser.profile,
            }
          : currentUser,
        profile: profile
          ? {
              ...profile,
              avatar_url: result.avatar_url,
            }
          : profile,
        cachedAt: Date.now(),
      })
      showSystemMessage({
        title: 'Photo updated',
        description: 'Your profile photo was updated.',
      })
      emitAccountUpdated()
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : 'Avatar upload failed.')
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const publicUsername = profile?.username ?? currentUser?.profile?.username ?? null
  const avatarProfile = profile
    ? profile
    : {
        username: currentUser?.profile?.username ?? null,
        avatar_url: currentUser?.profile?.avatarUrl ?? null,
        provider_avatar_url: currentUser?.profile?.providerAvatarUrl ?? null,
      }

  return (
    <Page narrow>
      <MinimalBackNav to="/profile" label="Profile" preferHistory={false} />
      <h1 className="g-h1 mt-2">Account settings</h1>
      <p className="g-mut mt-1 truncate text-[15px]">{currentUser?.user.email ?? 'Your profile, details and privacy'}</p>

      {isLoading && !(currentUser && profile) ? <FormSkeleton rows={6} className="mt-6" /> : null}
      {currentUser && profile ? (
        <form onSubmit={handleSave}>
          <div className="mt-6 flex items-center gap-4">
            <ProfileAvatar profile={avatarProfile} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="g-h3 truncate">{displayName.trim() || 'Your account'}</p>
              <p className="g-sm g-mut truncate">@{publicUsername || 'username'}</p>
              <label className={`${buttonClass({ variant: 'line', size: 'sm' })} mt-2 cursor-pointer`}>
                {isUploadingAvatar ? 'Uploading…' : 'Change photo'}
                <input type="file" accept={avatarUploadAccept} onChange={handleAvatarChange} className="sr-only" />
              </label>
            </div>
          </div>
          <p className={`g-hint mt-2 ${avatarError ? 'is-error' : ''}`}>{avatarError || 'Optional. JPEG, PNG, or WebP up to 5MB.'}</p>

          <SettingsSection title="Profile" sub="Basic info people recognize across GalaTayo.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="g-field">
                <label htmlFor="settings-first-name">First name</label>
                <input id="settings-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} className="g-input" autoComplete="given-name" />
              </div>
              <div className="g-field">
                <label htmlFor="settings-last-name">Last name</label>
                <input id="settings-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} className="g-input" autoComplete="family-name" />
              </div>
              <div className="g-field">
                <span className="g-label">Birthdate {optionalLabel}</span>
                <BirthdatePicker
                  value={birthdate}
                  onChange={(nextBirthdate) => {
                    setBirthdate(nextBirthdate)
                    saveBirthdate(nextBirthdate)
                  }}
                  error={birthdateError}
                />
              </div>
              <div className="g-field sm:col-span-2">
                <label htmlFor="settings-display-name">Display name</label>
                <input id="settings-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} className="g-input" />
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="Public details" sub="What people see when they open your profile.">
            <div className="grid gap-4">
              <div className="g-field">
                <label htmlFor="settings-username">Username</label>
                <div className="relative">
                  <span className="g-mut pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2" aria-hidden="true">@</span>
                  <input
                    id="settings-username"
                    value={usernameInput}
                    onChange={(event) => setUsernameInput(event.target.value.toLowerCase())}
                    className="g-input"
                    style={{ paddingLeft: 30 }}
                    aria-invalid={Boolean(usernameError) || undefined}
                    aria-describedby="settings-username-hint"
                    autoCapitalize="none"
                    autoComplete="username"
                    spellCheck={false}
                  />
                </div>
                <span id="settings-username-hint" className={`g-hint ${usernameError ? 'is-error' : ''}`}>
                  {usernameError || 'People can search for you with this username.'}
                </span>
              </div>
              <div className="g-field">
                <label htmlFor="settings-bio">Bio {optionalLabel}</label>
                <textarea id="settings-bio" value={bioInput} onChange={(event) => setBioInput(event.target.value)} maxLength={280} className="g-input" />
                <span className="g-hint text-right">{bioInput.length}/280</span>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="Privacy and security">
            <div className="g-group">
              <label className="g-group-row py-3">
                <span className="min-w-0 flex-1">
                  <span className="block">Public profile</span>
                  <span className="g-sm g-mut block">
                    {isPublic ? 'Anyone can view your profile and your follower/following lists.' : 'People need to request access, and follower/following names stay hidden.'}
                  </span>
                </span>
                <input type="checkbox" role="switch" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} className="peer sr-only" />
                <span
                  aria-hidden="true"
                  className="relative h-7 w-12 shrink-0 rounded-full bg-[var(--fill-2)] transition-colors peer-checked:bg-[var(--ink)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ink)] after:absolute after:top-0.5 after:left-0.5 after:h-6 after:w-6 after:rounded-full after:bg-[var(--surface)] after:shadow-[var(--sh-1)] after:transition-transform peer-checked:after:translate-x-5"
                />
              </label>
              <SettingsRow label="Password" value="Change" onClick={() => navigateToPath('/account-settings/change-password')} />
              <SettingsRow label="Privacy center" onClick={() => navigateToPath('/privacy-center')} />
              <SettingsRow label="View my profile" onClick={() => navigateToPath('/profile')} />
              <SettingsRow label="Joined" value={formatDate(profile.created_at)} />
            </div>
          </SettingsSection>

          {errorMessage ? (
            <p className="g-hint is-error mt-6" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <div className="mt-8 flex justify-end">
            <Button type="submit" variant="tara" className="w-full sm:w-auto" disabled={Boolean(usernameError || personalInfoError) || isSaving}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      ) : (
        <Empty
          className="mt-6"
          title="Hindi ma-load ang settings"
          description={errorMessage || 'Account settings are unavailable right now.'}
          action={
            <Button variant="line" onClick={() => window.location.reload()}>
              Try again
            </Button>
          }
        />
      )}
    </Page>
  )
}

export default AccountSettingsPage
