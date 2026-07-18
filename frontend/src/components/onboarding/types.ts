export type OnboardingStep = 1 | 2 | 3 | 4

export type ProfileVisibility = 'public' | 'private'

export type OnboardingFormState = {
  step: OnboardingStep
  firstName: string
  middleName: string
  lastName: string
  birthdate: string
  displayName: string
  username: string
  avatarUrl: string | null
  avatarStorageKey: string | null
  profileVisibility: ProfileVisibility
  showFollowers: boolean
  showFollowing: boolean
  acceptedTerms: boolean
  acceptedPrivacy: boolean
}

export type OnboardingErrors = Partial<Record<keyof OnboardingFormState | 'avatar' | 'form', string>>
