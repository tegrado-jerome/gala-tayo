/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SITE_URL?: string
  readonly VITE_GA_MEASUREMENT_ID?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_ADMIN_BASE_PATH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
