import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'

export type ThemePreference = 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'galatayo:theme-preference'

type ThemeContextValue = {
  themePreference: ThemePreference
  resolvedTheme: ResolvedTheme
  setThemePreference: (preference: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'light'
  }

  try {
    const storedValue = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (storedValue === 'light' || storedValue === 'dark') {
      return storedValue
    }
  } catch {
    // localStorage may be unavailable, ignore
  }

  return 'light'
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => readStoredThemePreference())
  const resolvedTheme: ResolvedTheme = themePreference

  useLayoutEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const root = document.documentElement
    const body = document.body
    root.dataset.theme = resolvedTheme
    root.dataset.themePreference = themePreference
    root.style.colorScheme = resolvedTheme
    body.dataset.theme = resolvedTheme

    const themeColorMeta = document.querySelector('meta[name="theme-color"]')
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', resolvedTheme === 'dark' ? '#08111d' : '#1E3A8A')
    }
  }, [resolvedTheme, themePreference])

  const setThemePreference = (preference: ThemePreference) => {
    setThemePreferenceState(preference)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference)
    } catch {
      // localStorage may be unavailable, ignore
    }
  }

  const value = useMemo(
    () => ({
      themePreference,
      resolvedTheme,
      setThemePreference,
    }),
    [resolvedTheme, themePreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  return context
}
