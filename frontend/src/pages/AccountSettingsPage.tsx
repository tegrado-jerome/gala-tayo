import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ChevronDown, Globe2, Shield, UserRound } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import PageHeroHeader from '../components/PageHeroHeader'
import ProfileAvatar from '../components/ProfileAvatar'
import { PageContainer } from '../components/layout/ResponsiveLayouts'
import UnifiedLoadingState from '../components/UnifiedLoadingState'
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

type AccountSettingsPageProps = {
  session: Session
}

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

function inputClassName() {
  return 'h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#1877f2] focus:ring-4 focus:ring-[#e7f3ff]'
}

function selectClassName() {
  return 'h-11 w-full appearance-none rounded-xl border border-slate-300 bg-white px-3 pr-10 text-sm font-medium text-slate-900 outline-none transition focus:border-[#1877f2] focus:ring-4 focus:ring-[#e7f3ff]'
}

type SelectFieldProps = {
  value: string
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void
  className: string
  children: ReactNode
}

function SelectField({ value, onChange, className, children }: SelectFieldProps) {
  return (
    <div className="relative">
      <select value={value} onChange={onChange} className={className}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" strokeWidth={2.25} />
    </div>
  )
}

type SectionHeaderProps = {
  title: string
  description: string
  icon: ReactNode
}

function SectionHeader({ title, description, icon }: SectionHeaderProps) {
  return (
    <div className="group rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 transition duration-200 hover:border-slate-300 hover:bg-white hover:shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:px-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-white text-[#1877f2] ring-1 ring-slate-200 transition group-hover:scale-[1.02] group-hover:ring-[#bfdbfe]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>
    </div>
  )
}

function AccountSettingsPage({ session }: AccountSettingsPageProps) {
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const { showSystemMessage } = useSystemMessage()

  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [usernameInput, setUsernameInput] = useState('')
  const [bioInput, setBioInput] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [defaultPlanVisibility, setDefaultPlanVisibility] = useState<Profile['default_gala_plan_visibility']>('private')

  const normalizedUsername = useMemo(() => normalizeUsername(usernameInput), [usernameInput])
  const usernameError = normalizedUsername ? validateUsername(normalizedUsername) : 'Username is required.'
  const birthdateError = birthdate && !isValidBirthdate(birthdate) ? 'Birthdate must use a real YYYY-MM-DD date.' : ''
  const personalInfoError =
    !firstName.trim() ? 'First Name is required.' : !lastName.trim() ? 'Last Name is required.' : !displayName.trim() ? 'Display Name is required.' : birthdateError

  useEffect(() => {
    let isMounted = true

    const loadSettings = async () => {
      try {
        setIsLoading(true)
        setErrorMessage('')

        const [accountData, profileData] = await Promise.all([getCurrentUser(session), getMyProfile(session)])

        if (!isMounted) {
          return
        }

        setCurrentUser(accountData)
        setProfile(profileData.profile)
        setFirstName(accountData.user.firstName ?? '')
        setMiddleName(accountData.user.middleName ?? '')
        setLastName(accountData.user.lastName ?? '')
        setBirthdate(accountData.user.birthdate ?? '')
        setDisplayName(accountData.profile?.displayName ?? '')
        setUsernameInput(profileData.profile?.username ?? '')
        setBioInput(profileData.profile?.bio ?? '')
        setIsPublic(profileData.profile?.is_public ?? true)
        setDefaultPlanVisibility(profileData.profile?.default_gala_plan_visibility ?? 'private')
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load account settings.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
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
            middleName: middleName.trim() || null,
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
            default_gala_plan_visibility: defaultPlanVisibility,
          },
          session,
        ),
      ])

      setCurrentUser(accountData)
      setProfile(profileData.profile)
      setFirstName(accountData.user.firstName ?? '')
      setMiddleName(accountData.user.middleName ?? '')
      setLastName(accountData.user.lastName ?? '')
      setBirthdate(accountData.user.birthdate ?? '')
      setDisplayName(accountData.profile?.displayName ?? '')
      setUsernameInput(profileData.profile?.username ?? '')
      setBioInput(profileData.profile?.bio ?? '')
      setIsPublic(profileData.profile?.is_public ?? true)
      setDefaultPlanVisibility(profileData.profile?.default_gala_plan_visibility ?? 'private')
      showSystemMessage({
        title: 'Account Update Successful!',
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

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    if (!isValidAvatarFile(file)) {
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
      showSystemMessage({
        title: 'Photo Update Successful!',
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

  const sharedInputClassName = inputClassName()
  const sharedSelectClassName = selectClassName()

  return (
    <div className="gala-page-shell">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-8">
        <PageContainer className="px-0">
        {isLoading ? (
          <UnifiedLoadingState
            title="Preparing account settings..."
            message="We are loading your account details and preferences."
          />
        ) : currentUser && profile ? (
          <form onSubmit={handleSave} className="space-y-8">
            <PageHeroHeader
              className="account-settings-hero"
              eyebrow="Account Settings"
              title="Manage your profile and privacy"
              description="Update your personal details, public profile, and default visibility settings in one place."
              icon={<UserRound className="h-4 w-4" strokeWidth={2.2} />}
              badges={
                <div className="account-settings-hero-meta">
                  <span className="account-settings-hero-chip">
                    <Globe2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                    <span>{profile.is_public ? 'Public profile' : 'Private profile'}</span>
                  </span>
                  <span className="account-settings-hero-divider" aria-hidden="true" />
                  <span className="account-settings-hero-chip account-settings-hero-chip-email">
                    <span>{currentUser.user.email ?? 'Email unavailable'}</span>
                  </span>
                </div>
              }
            />

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="grid gap-6 px-5 py-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-6">
                <div className="self-start">
                  <div className="mt-5 flex items-center gap-3">
                    <ProfileAvatar profile={avatarProfile} size="lg" />
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-slate-900">{displayName.trim() || 'Your account'}</p>
                      <p className="truncate text-sm text-slate-500">@{publicUsername || 'username'}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateToPath('/profile')}
                    className="gala-primary-button mt-4 w-full"
                  >
                    Go to profile
                  </button>
                </div>

                <div className="grid gap-4 border-t border-slate-200 pt-4 text-sm text-slate-600 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <span>Joined</span>
                    <span className="text-right font-medium text-slate-900">{formatDate(profile.created_at)}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span>Visibility</span>
                    <span className="text-right font-medium text-slate-900">{profile.is_public ? 'Public' : 'Private'}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span>Password</span>
                    <button
                      type="button"
                      onClick={() => navigateToPath('/settings/change-password')}
                      className="font-semibold text-[#1877f2] hover:underline"
                    >
                      Change
                    </button>
                  </div>
                  <p className="text-sm text-slate-500">{currentUser.user.email ?? 'No email on file'}</p>
                </div>
              </div>
            </section>

            <div className="space-y-8">
              <section className="border-b border-slate-200 pb-8">
                <SectionHeader
                  title="Profile"
                  description="Basic info people recognize across GalaTayo."
                  icon={<UserRound className="h-5 w-5" strokeWidth={2.2} />}
                />
                <div className="mt-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <ProfileAvatar profile={avatarProfile} size="lg" />
                      <div>
                        <p className="text-base font-semibold text-slate-900">{displayName.trim() || 'Your account'}</p>
                        <p className="text-sm text-slate-500">{currentUser.user.email ?? 'No email on file'}</p>
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                        {isUploadingAvatar ? 'Uploading...' : 'Upload Photo'}
                        <input type="file" accept={avatarUploadAccept} onChange={handleAvatarChange} className="sr-only" />
                      </label>
                      <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                        JPEG, PNG, or WebP up to 5MB.
                        <span className="optional-label">Optional</span>
                      </p>
                    </div>
                  </div>
                  {avatarError ? <p className="mt-3 text-sm font-semibold text-red-600">{avatarError}</p> : null}

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-slate-800">First Name</span>
                      <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className={sharedInputClassName} />
                    </label>
                    <label className="grid gap-2">
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        Middle Name
                        <span className="optional-label">Optional</span>
                      </span>
                      <input value={middleName} onChange={(event) => setMiddleName(event.target.value)} className={sharedInputClassName} />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-slate-800">Last Name</span>
                      <input value={lastName} onChange={(event) => setLastName(event.target.value)} className={sharedInputClassName} />
                    </label>
                    <label className="grid gap-2">
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        Birthdate
                        <span className="optional-label">Optional</span>
                      </span>
                      <input type="date" value={birthdate} onChange={(event) => setBirthdate(event.target.value)} className={sharedInputClassName} />
                      {birthdateError ? <span className="text-xs font-semibold text-red-600">{birthdateError}</span> : null}
                    </label>
                    <label className="grid gap-2 sm:col-span-2">
                      <span className="text-sm font-semibold text-slate-800">Display Name</span>
                      <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} className={sharedInputClassName} />
                    </label>
                  </div>
                </div>
              </section>

              <section className="border-b border-slate-200 pb-8">
                <SectionHeader
                  title="Public Details"
                  description="This is the information shown when people open your public profile."
                  icon={<Globe2 className="h-5 w-5" strokeWidth={2.2} />}
                />
                <div className="mt-5">
                  <div className="grid gap-4">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-slate-800">Username</span>
                      <span className="flex h-11 items-center rounded-xl border border-slate-300 bg-white px-3 focus-within:border-[#1877f2] focus-within:ring-4 focus-within:ring-[#e7f3ff]">
                        <span className="font-semibold text-slate-500">@</span>
                        <input
                          value={usernameInput}
                          onChange={(event) => setUsernameInput(event.target.value.toLowerCase())}
                          className="min-w-0 flex-1 border-0 bg-transparent px-1 text-sm font-medium text-slate-900 outline-none"
                          autoCapitalize="none"
                          autoComplete="username"
                          spellCheck={false}
                        />
                      </span>
                      <span className={`text-xs font-medium ${usernameError ? 'text-red-600' : 'text-slate-500'}`}>
                        {usernameError || 'People can search for you with this username.'}
                      </span>
                    </label>

                    <label className="grid gap-2">
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        Bio
                        <span className="optional-label">Optional</span>
                      </span>
                      <textarea
                        value={bioInput}
                        onChange={(event) => setBioInput(event.target.value)}
                        maxLength={280}
                        className="min-h-28 resize-none rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-medium leading-6 text-slate-900 outline-none transition focus:border-[#1877f2] focus:ring-4 focus:ring-[#e7f3ff]"
                      />
                    </label>
                  </div>
                </div>
              </section>

              <section className="pb-2">
                <SectionHeader
                  title="Privacy"
                  description="Keep these defaults simple and easy to scan."
                  icon={<Shield className="h-5 w-5" strokeWidth={2.2} />}
                />
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-slate-800">Profile Visibility</span>
                    <SelectField value={isPublic ? 'public' : 'private'} onChange={(event) => setIsPublic(event.target.value === 'public')} className={sharedSelectClassName}>
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </SelectField>
                    <span className="text-xs text-slate-500">{isPublic ? 'Anyone can view your profile and your follower/following lists.' : 'People need to request access, and follower/following names stay hidden.'}</span>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-slate-800">Default Gala Plan Visibility</span>
                    <SelectField
                      value={defaultPlanVisibility}
                      onChange={(event) => setDefaultPlanVisibility(event.target.value as Profile['default_gala_plan_visibility'])}
                      className={sharedSelectClassName}
                    >
                      <option value="private">Private</option>
                      <option value="followers">Followers only</option>
                      <option value="public">Public</option>
                      <option value="unlisted">Unlisted</option>
                    </SelectField>
                    <span className="text-xs text-slate-500">Unlisted stays off your public profile but still works with a direct link.</span>
                  </label>
                </div>
              </section>

              <div className="space-y-3">
                {errorMessage ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p> : null}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={Boolean(usernameError || personalInfoError) || isSaving}
                    className="gala-primary-button px-6 disabled:border-slate-300 disabled:bg-slate-300"
                  >
                    {isSaving ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        ) : (
          <p className="rounded-2xl border border-red-200 bg-white px-5 py-6 text-sm font-medium text-red-700 shadow-sm">
            {errorMessage || 'Account settings are unavailable right now.'}
          </p>
        )}
        </PageContainer>
      </main>
    </div>
  )
}

export default AccountSettingsPage
