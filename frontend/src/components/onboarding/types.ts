/** 1 profile, 2 interests, 3 visibility, 4 terms, 5 legal name and birthdate. */
export type OnboardingStep = 1 | 2 | 3 | 4 | 5

export const ONBOARDING_STEPS = { profile: 1, interests: 2, visibility: 3, terms: 4, personal: 5 } as const

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
  interests: string[]
  profileVisibility: ProfileVisibility
  showFollowers: boolean
  showFollowing: boolean
  acceptedTerms: boolean
  acceptedPrivacy: boolean
}

export type OnboardingErrors = Partial<Record<keyof OnboardingFormState | 'avatar' | 'form', string>>
