import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Check, ChevronDown, Globe2, Shield, UserRound } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import PageHeroHeader from '../components/PageHeroHeader'
import MinimalBackNav from '../components/MinimalBackNav'
import ProfileAvatar from '../components/ProfileAvatar'
import { PageContainer, PageShell, ResponsiveGrid, CardSurface, Stack, Section } from '../components/layout/ResponsiveLayouts'
import UnifiedLoadingState from '../components/UnifiedLoadingState'
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

function inputClassName() {
  return 'gala-field px-3'
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

type PrivacyOptionTone = 'public' | 'private' | 'followers' | 'unlisted'

type PrivacyOption = {
  value: string
  label: string
  description: string
  tone: PrivacyOptionTone
}

const profileVisibilityOptions: PrivacyOption[] = [
  {
    value: 'public',
    label: 'Public',
    description: 'Anyone can view your profile and follower lists.',
    tone: 'public',
  },
  {
    value: 'private',
    label: 'Private',
    description: 'People need approval before they can follow you.',
    tone: 'private',
  },
]


type PrivacySelectProps = {
  label: string
  value: string
  onChange: (value: string) => void
  options: PrivacyOption[]
  helperText: string
  id: string
}

function PrivacySelect({ label, value, onChange, options, helperText, id }: PrivacySelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const buttonId = `${id}-button`
  const menuId = `${id}-menu`
  const selectedOption = options.find((option) => option.value === value) ?? options[0]

  const updateMenuPosition = () => {
    if (!buttonRef.current || !menuRef.current) {
      return
    }

    const rect = buttonRef.current.getBoundingClientRect()
    const gap = 10
    const viewportPadding = 16
    const mobileBottomNav = document.querySelector<HTMLElement>('nav[aria-label="Primary"]')
    const navRect = mobileBottomNav?.getBoundingClientRect()
    const hasFixedBottomNav = Boolean(navRect && navRect.height > 0 && navRect.top < window.innerHeight)
    const reservedBottomSpace = hasFixedBottomNav ? navRect!.height + 8 : 0
    const spaceBelow = Math.max(96, window.innerHeight - rect.bottom - gap - viewportPadding - reservedBottomSpace)
    const spaceAbove = Math.max(96, rect.top - gap - viewportPadding)
    const naturalHeight = Math.min(menuRef.current.scrollHeight, 320)
    const isMobile = window.innerWidth < 640
    const shouldOpenUpward = isMobile && naturalHeight > spaceBelow && spaceAbove > spaceBelow
    const maxHeight = isMobile ? Math.min(320, shouldOpenUpward ? spaceAbove : spaceBelow) : undefined

    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      visibility: 'visible',
      zIndex: 7000,
      ...(isMobile ? { maxHeight: `${maxHeight}px`, overflowY: 'auto' } : { maxHeight: 'none', overflowY: 'visible' }),
      ...(shouldOpenUpward
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    })
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const targetNode = event.target as Node
      const clickedTrigger = rootRef.current?.contains(targetNode)
      const clickedMenu = menuRef.current?.contains(targetNode)

      if (!clickedTrigger && !clickedMenu) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) {
      return
    }

    updateMenuPosition()
  }, [isOpen, options.length])

  useEffect(() => {
    if (!isOpen) return
    function handleScroll() {
      setIsOpen(false)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    document.documentElement.classList.add('gala-select-open')
    document.body.classList.add('gala-select-open')
    window.addEventListener('resize', updateMenuPosition)
    updateMenuPosition()

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      document.documentElement.classList.remove('gala-select-open')
      document.body.classList.remove('gala-select-open')
    }
  }, [isOpen])

  return (
    <div ref={rootRef} className="gala-select-root grid gap-2">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      <div className="relative">
        <button
          ref={buttonRef}
          id={buttonId}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={menuId}
          onClick={() => setIsOpen((current) => !current)}
          className="gala-select-trigger"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className={`gala-select-tone gala-select-tone-${selectedOption.tone}`}>{selectedOption.label.slice(0, 1)}</span>
            <span className="min-w-0">
              <span className="block truncate text-left text-sm font-semibold text-slate-900">{selectedOption.label}</span>
              <span className="block truncate text-left text-xs text-slate-500">{selectedOption.description}</span>
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} strokeWidth={2.25} />
        </button>

        {isOpen
          ? createPortal(
              <div ref={menuRef} id={menuId} role="listbox" aria-labelledby={buttonId} className="gala-select-menu" style={{ visibility: 'hidden', ...menuStyle }}>
                {options.map((option) => {
                  const selected = option.value === value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onChange(option.value)
                        setIsOpen(false)
                      }}
                      className={`gala-select-option ${selected ? 'gala-select-option-selected' : ''}`}
                    >
                      <span className={`gala-select-tone gala-select-tone-${option.tone}`}>{option.label.slice(0, 1)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                        <span className="block text-xs text-slate-500">{option.description}</span>
                      </span>
                      {selected ? <Check className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.5} /> : null}
                    </button>
                  )
                })}
              </div>,
              document.body,
            )
          : null}
      </div>
      <span className="text-xs text-slate-500">{helperText}</span>
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
  const { currentProfile } = useAppUser()
  const initialResumeCache = useMemo(() => readAccountSettingsResumeCache(session.user.id), [session.user.id])
  const initialCachedCurrentUser = initialResumeCache?.currentUser ?? null
  const initialCachedProfile = initialResumeCache?.profile ?? null
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(initialResumeCache?.currentUser ?? null)
  const [profile, setProfile] = useState<Profile | null>(initialResumeCache?.profile ?? null)
  const [isLoading, setIsLoading] = useState(() => !initialResumeCache)
  const [, setIsRefreshing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const { showSystemMessage } = useSystemMessage()

  const [firstName, setFirstName] = useState(initialCachedCurrentUser?.user.firstName ?? '')
  const [middleName, setMiddleName] = useState(initialCachedCurrentUser?.user.middleName ?? '')
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
        if (!initialResumeCache) {
          setIsLoading(true)
        } else {
          setIsRefreshing(true)
        }
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
      writeAccountSettingsResumeCache(session.user.id, {
        currentUser: accountData,
        profile: profileData.profile,
        cachedAt: Date.now(),
      })
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

  return (
    <PageShell>
      <AppHeader />
      <main className="w-full pb-0 pt-4 sm:pt-5 lg:py-8">
        <PageContainer size="wide">
          <div className="mb-5">
            <MinimalBackNav to="/profile" label="Profile" preferHistory={false} />
          </div>

          {isLoading ? (
            <UnifiedLoadingState
              variant="section"
              title="Preparing account settings..."
              message="We are loading your account details and preferences."
            />
          ) : currentUser && profile ? (
            <form onSubmit={handleSave} className="grid gap-6 lg:gap-8">
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
              <CardSurface pad="loose" tone="outlined" className="rounded-2xl">
                <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
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
                      className="app-button app-button-primary app-button-md mt-4 w-full sm:w-auto"
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
                        onClick={() => navigateToPath('/account-settings/change-password')}
                        className="font-semibold text-[#1877f2] hover:underline"
                      >
                        Change
                      </button>
                    </div>
                    <p className="text-sm text-slate-500">{currentUser.user.email ?? 'No email on file'}</p>
                  </div>
                </div>
              </CardSurface>

              <Section gap="loose">
                <Section gap="default" as="section" className="border-b border-slate-200 pb-8">
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

                    <ResponsiveGrid cols={2} gap="default" className="mt-6">
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
                    </ResponsiveGrid>
                  </div>
                </Section>

                <Section gap="default" as="section" className="border-b border-slate-200 pb-8">
                  <SectionHeader
                    title="Public Details"
                    description="This is the information shown when people open your public profile."
                    icon={<Globe2 className="h-5 w-5" strokeWidth={2.2} />}
                  />
                  <div className="mt-5 grid gap-4">
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
                </Section>

                <Section gap="default" as="section">
                  <SectionHeader
                    title="Privacy"
                    description="Keep these defaults simple and easy to scan."
                    icon={<Shield className="h-5 w-5" strokeWidth={2.2} />}
                  />
                  <ResponsiveGrid cols={2} gap="default" className="mt-5">
                    <PrivacySelect
                      id="profile-visibility"
                      label="Profile Visibility"
                      value={isPublic ? 'public' : 'private'}
                      onChange={(nextValue) => setIsPublic(nextValue === 'public')}
                      options={profileVisibilityOptions}
                      helperText={isPublic ? 'Anyone can view your profile and your follower/following lists.' : 'People need to request access, and follower/following names stay hidden.'}
                    />

                  </ResponsiveGrid>
                </Section>

                <Stack gap="tight">
                  {errorMessage ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p> : null}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={Boolean(usernameError || personalInfoError) || isSaving}
                      className="app-button app-button-primary app-button-md px-5"
                    >
                      {isSaving ? 'Saving...' : 'Save changes'}
                    </button>
                  </div>
                </Stack>
              </Section>
            </form>
          ) : (
            <p className="rounded-2xl border border-red-200 bg-white px-5 py-6 text-sm font-medium text-red-700 shadow-sm">
              {errorMessage || 'Account settings are unavailable right now.'}
            </p>
          )}
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default AccountSettingsPage
