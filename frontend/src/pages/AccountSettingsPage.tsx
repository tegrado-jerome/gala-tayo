import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Camera } from '@phosphor-icons/react/dist/csr/Camera'
import { Eye } from '@phosphor-icons/react/dist/csr/Eye'
import { LockKey } from '@phosphor-icons/react/dist/csr/LockKey'
import { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck'
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
import { FormSkeleton } from '../components/loading/SkeletonStates'
import { MeRow } from './ProfilePage'
import '../design/me.css'

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

type EditKey = 'name' | 'displayName' | 'birthdate' | 'username' | 'bio'

/** Airbnb personal-info row: label and current value, "Edit" opens the inputs in place. */
function EditRow({
  id,
  label,
  value,
  open,
  onEdit,
  onCancel,
  error,
  footer,
  children,
}: {
  id: string
  label: string
  value: ReactNode
  open: boolean
  onEdit: () => void
  onCancel: () => void
  error?: string
  footer: ReactNode
  children: ReactNode
}) {
  return (
    <div className="me-edit">
      <div className="me-edit-head">
        <div>
          <b id={`${id}-label`}>{label}</b>
          {open ? null : <p>{value}</p>}
        </div>
        <Button variant="text" size="sm" aria-expanded={open} aria-controls={`${id}-body`} aria-describedby={`${id}-label`} onClick={open ? onCancel : onEdit}>
          {open ? 'Cancel' : 'Edit'}
        </Button>
      </div>
      {open ? (
        <div id={`${id}-body`} className="me-edit-body" role="group" aria-labelledby={`${id}-label`}>
          {children}
          {error ? (
            <p className="g-hint is-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="me-edit-acts">{footer}</div>
        </div>
      ) : null}
    </div>
  )
}

function SettingsSection({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="g-h2">{title}</h2>
      {sub ? <p className="g-sm g-mut mt-1">{sub}</p> : null}
      <div className="mt-1">{children}</div>
    </section>
  )
}

const notProvided = <span className="g-fnt">Not provided</span>

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
  const [editing, setEditing] = useState<EditKey | null>(null)

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
      setEditing(null)
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

  const saved = {
    firstName: currentUser?.user.firstName ?? '',
    lastName: currentUser?.user.lastName ?? '',
    displayName: currentUser?.profile?.displayName ?? '',
    username: profile?.username ?? '',
    bio: profile?.bio ?? '',
    isPublic: profile?.is_public ?? true,
  }
  const isDirty =
    firstName !== saved.firstName ||
    lastName !== saved.lastName ||
    displayName !== saved.displayName ||
    usernameInput !== saved.username ||
    bioInput !== saved.bio ||
    isPublic !== saved.isPublic
  const cannotSave = Boolean(usernameError || personalInfoError) || isSaving

  const cancelEdit = () => {
    if (editing === 'name') {
      setFirstName(saved.firstName)
      setLastName(saved.lastName)
    } else if (editing === 'displayName') {
      setDisplayName(saved.displayName)
    } else if (editing === 'username') {
      setUsernameInput(saved.username)
    } else if (editing === 'bio') {
      setBioInput(saved.bio)
    }
    setErrorMessage('')
    setEditing(null)
  }

  const rowProps = (key: EditKey) => ({
    open: editing === key,
    onEdit: () => {
      if (editing) cancelEdit()
      setEditing(key)
    },
    onCancel: cancelEdit,
    error: editing === key ? errorMessage : undefined,
    footer: (
      <Button type="submit" variant="tara" disabled={cannotSave}>
        {isSaving ? 'Saving…' : 'Save'}
      </Button>
    ),
  })

  const birthdateLabel = birthdate && isValidBirthdate(birthdate) ? formatDate(`${birthdate}T00:00:00`) : null

  return (
    <Page narrow>
      <MinimalBackNav to="/profile" label="Profile" preferHistory={false} />
      <h1 className="g-h1 mt-2">Account settings</h1>
      <p className="g-mut mt-1 truncate text-[15px]">{currentUser?.user.email ?? 'Your profile, details and privacy'}</p>

      {isLoading && !(currentUser && profile) ? <FormSkeleton rows={6} className="mt-6" /> : null}
      {currentUser && profile ? (
        <form onSubmit={handleSave}>
          <section className="me-card mt-6 !grid-cols-[auto_minmax(0,1fr)] !gap-4" aria-label="Profile photo">
            <ProfileAvatar profile={avatarProfile} size="lg" />
            <div className="min-w-0">
              <p className="g-h3 truncate">{displayName.trim() || 'Your account'}</p>
              <p className="g-sm g-mut truncate">@{publicUsername || 'username'}</p>
              <label className={`${buttonClass({ variant: 'line', size: 'sm' })} mt-3 cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--ink)]`}>
                <Camera aria-hidden="true" />
                {isUploadingAvatar ? 'Uploading…' : 'Change photo'}
                <input type="file" accept={avatarUploadAccept} onChange={handleAvatarChange} className="sr-only" />
              </label>
              <p className={`g-hint mt-2 ${avatarError ? 'is-error' : ''}`} role={avatarError ? 'alert' : undefined}>
                {avatarError || 'Optional. JPEG, PNG, or WebP up to 5MB.'}
              </p>
            </div>
          </section>

          <SettingsSection title="Personal info" sub="Only you see these. We use them to keep your account yours.">
            <EditRow id="settings-name" label="Legal name" value={[saved.firstName, saved.lastName].filter(Boolean).join(' ') || notProvided} {...rowProps('name')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="g-field">
                  <label htmlFor="settings-first-name">First name</label>
                  <input id="settings-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} className="g-input" autoComplete="given-name" />
                </div>
                <div className="g-field">
                  <label htmlFor="settings-last-name">Last name</label>
                  <input id="settings-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} className="g-input" autoComplete="family-name" />
                </div>
              </div>
            </EditRow>
            <EditRow id="settings-display" label="Display name" value={saved.displayName || notProvided} {...rowProps('displayName')}>
              <div className="g-field">
                <label htmlFor="settings-display-name">Shown on your profile and plans</label>
                <input id="settings-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} className="g-input" />
              </div>
            </EditRow>
            <EditRow
              id="settings-birthdate"
              label="Birthdate"
              value={birthdateLabel ?? <span className="g-fnt">Optional · not provided</span>}
              {...rowProps('birthdate')}
              onCancel={() => setEditing(null)}
              footer={
                <Button variant="tara" onClick={() => setEditing(null)}>
                  Done
                </Button>
              }
            >
              <p className="g-sm g-mut">Saves as soon as you pick a date.</p>
              <BirthdatePicker
                value={birthdate}
                onChange={(nextBirthdate) => {
                  setBirthdate(nextBirthdate)
                  saveBirthdate(nextBirthdate)
                }}
                error={birthdateError}
              />
            </EditRow>
            <div className="me-edit">
              <div className="me-edit-head">
                <div>
                  <b>Email</b>
                  <p>{currentUser.user.email ?? notProvided}</p>
                </div>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="Public details" sub="What people see when they open your profile.">
            <EditRow id="settings-handle" label="Username" value={saved.username ? `@${saved.username}` : notProvided} {...rowProps('username')}>
              <div className="g-field">
                <label htmlFor="settings-username" className="sr-only">
                  Username
                </label>
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
            </EditRow>
            <EditRow id="settings-about" label="Bio" value={saved.bio ? <span className="line-clamp-2">{saved.bio}</span> : <span className="g-fnt">Optional · not provided</span>} {...rowProps('bio')}>
              <div className="g-field">
                <label htmlFor="settings-bio" className="sr-only">
                  Bio
                </label>
                <textarea id="settings-bio" value={bioInput} onChange={(event) => setBioInput(event.target.value)} maxLength={280} className="g-input" placeholder="Kape, museums, and long walks sa Intramuros." />
                <span className="g-hint text-right">{bioInput.length}/280</span>
              </div>
            </EditRow>
          </SettingsSection>

          <SettingsSection title="Privacy and security">
            <label className="me-edit flex cursor-pointer items-center gap-4">
              <span className="min-w-0 flex-1">
                <b className="block text-[15px] font-semibold">Public profile</b>
                <span className="g-sm g-mut mt-0.5 block">
                  {isPublic ? 'Anyone can view your profile and your follower/following lists.' : 'People need to request access, and follower/following names stay hidden.'}
                </span>
              </span>
              <input type="checkbox" role="switch" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} className="sr-only" />
              <span className="me-switch" aria-hidden="true" />
            </label>
            <div className="me-rows mt-2">
              <MeRow icon={LockKey} title="Password" sub="Change the password you log in with" href="/account-settings/change-password" />
              <MeRow icon={ShieldCheck} title="Privacy center" sub="Data requests and account deletion" href="/privacy-center" />
              <MeRow icon={Eye} title="View my profile" sub={formatDate(profile.created_at) === 'Not available' ? undefined : `Joined ${formatDate(profile.created_at)}`} href="/profile" />
            </div>
          </SettingsSection>

          {isDirty && editing === null ? (
            <div className="me-savebar">
              <p>
                {errorMessage ? (
                  <span role="alert" style={{ color: 'var(--bad)' }}>
                    {errorMessage}
                  </span>
                ) : (
                  'You have unsaved changes'
                )}
              </p>
              <Button type="submit" variant="tara" disabled={cannotSave}>
                {isSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          ) : null}
          {!isDirty && editing === null && errorMessage ? (
            <p className="g-hint is-error mt-6" role="alert">
              {errorMessage}
            </p>
          ) : null}
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
