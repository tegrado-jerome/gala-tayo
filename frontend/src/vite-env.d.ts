/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SITE_URL?: string
  readonly VITE_GA_MEASUREMENT_ID?: string
  readonly VITE_GOOGLE_SITE_VERIFICATION?: string
  readonly VITE_BING_SITE_VERIFICATION?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_ADMIN_BASE_PATH?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

type GoogleCredentialResponse = {
  credential: string
  select_by?: string
}

type GoogleInitializeConfig = {
  client_id: string
  callback: (response: GoogleCredentialResponse) => void
  cancel_on_tap_outside?: boolean
  context?: string
  nonce?: string
  use_fedcm_for_prompt?: boolean
}

type GoogleRenderButtonConfig = {
  type?: 'standard' | 'icon'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  logo_alignment?: 'left' | 'center'
  width?: number
  locale?: string
}

interface GoogleAccountsId {
  initialize: (config: GoogleInitializeConfig) => void
  renderButton: (parent: HTMLElement, options: GoogleRenderButtonConfig) => void
  prompt: (momentListener?: (moment: { type: string }) => void) => void
  cancel: () => void
  storeCredential: (credential: string, callback?: () => void) => void
  disableAutoSelect: () => void
}

interface Window {
  google?: {
    accounts: {
      id: GoogleAccountsId
    }
  }
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
