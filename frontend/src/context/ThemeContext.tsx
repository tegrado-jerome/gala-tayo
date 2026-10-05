import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'

export type ThemePreference = 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'galatayo:theme-preference'
const THEME_SWITCHING_ATTRIBUTE = 'themeSwitching'

let themeSwitchingFrame: number | null = null
let themeSwitchingTimeout: number | null = null

type ThemeContextValue = {
  themePreference: ThemePreference
  resolvedTheme: ResolvedTheme
  setThemePreference: (preference: ThemePreference) => void
}

type ThemeProviderProps = PropsWithChildren

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

function clearThemeSwitchingSchedule() {
  if (typeof window === 'undefined') {
    return
  }

  if (themeSwitchingFrame !== null) {
    window.cancelAnimationFrame(themeSwitchingFrame)
    themeSwitchingFrame = null
  }

  if (themeSwitchingTimeout !== null) {
    window.clearTimeout(themeSwitchingTimeout)
    themeSwitchingTimeout = null
  }
}

function beginThemeSwitching() {
  if (typeof document === 'undefined') {
    return
  }

  clearThemeSwitchingSchedule()
  document.documentElement.dataset[THEME_SWITCHING_ATTRIBUTE] = 'true'
}

function endThemeSwitchingAfterCommit() {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return
  }

  clearThemeSwitchingSchedule()

  themeSwitchingFrame = window.requestAnimationFrame(() => {
    themeSwitchingFrame = window.requestAnimationFrame(() => {
      themeSwitchingFrame = null
      themeSwitchingTimeout = window.setTimeout(() => {
        themeSwitchingTimeout = null
        delete document.documentElement.dataset[THEME_SWITCHING_ATTRIBUTE]
      }, 60)
    })
  })
}

export function ThemeProvider({ children }: ThemeProviderProps) {
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
      themeColorMeta.setAttribute('content', resolvedTheme === 'dark' ? '#0c1a1d' : '#FFFAF4')
    }

    if (root.dataset[THEME_SWITCHING_ATTRIBUTE] === 'true') {
      endThemeSwitchingAfterCommit()
    }
  }, [resolvedTheme, themePreference])

  const setThemePreference = useCallback((preference: ThemePreference) => {
    if (preference !== themePreference) {
      beginThemeSwitching()
    }

    setThemePreferenceState(preference)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference)
    } catch {
      // localStorage may be unavailable, ignore
    }
  }, [themePreference])

  const value = useMemo(
    () => ({
      themePreference,
      resolvedTheme,
      setThemePreference,
    }),
    [resolvedTheme, setThemePreference, themePreference],
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
