import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppIcon } from '../components/AppIcon'
import { useTheme } from './ThemeContext'
import { getTasks, subscribeToAskAiTasks, type AskAiTask } from '../utils/askAiTaskStore'
import { isFloatingChatOpen } from '../utils/floatingChat'

function sendBrowserNotification(description: string) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'denied') return
  if (document.visibilityState !== 'hidden') return

  if (Notification.permission === 'granted') {
    new Notification('GalaTayo', { body: description })
  } else if (Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

type AskAiNotificationTone = 'error'

type AskAiNotification = {
  id: string
  feature: string
  tone: AskAiNotificationTone
  description: string
}

type AskAiNotificationContextValue = Record<PropertyKey, never>

const ASK_AI_ERROR_MESSAGES: Record<string, string> = {
  chatbot: 'GalaTayo AI Chatbot had trouble finishing. Please try again.',
  maps: 'GalaTayo AI Maps had trouble finishing. Please try again.',
}

const ERROR_DISMISS_MS = 3000

const toneIcons: Record<AskAiNotificationTone, string> = {
  error: 'warning',
}

const toneBorders: Record<AskAiNotificationTone, string> = {
  error: 'border-red-200',
}

const toneBackgrounds: Record<AskAiNotificationTone, string> = {
  error: 'bg-red-50',
}

const toneTextColors: Record<AskAiNotificationTone, string> = {
  error: 'text-red-700',
}

function isOnFeaturePage(feature: string): boolean {
  const pathname = window.location.pathname.replace(/\/$/, '') || '/'
  if (feature === 'chatbot') return isFloatingChatOpen()
  if (feature === 'maps') return pathname === '/ask-ai/maps'
  return false
}

const AskAiNotificationContext = createContext<AskAiNotificationContextValue | null>(null)

function AskAiNotificationProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme()
  const isDarkMode = resolvedTheme === 'dark'
  const [notifications, setNotifications] = useState<AskAiNotification[]>([])
  const timersRef = useRef<Map<string, number>>(new Map())
  const seenCompletedRef = useRef<Set<string>>(new Set())
  const wasHiddenRef = useRef(false)
  const addNotificationRef = useRef<(notification: AskAiNotification, durationMs: number | null) => void>(null)

  const clearNotificationTimer = useCallback((id: string) => {
    const existing = timersRef.current.get(id)
    if (existing !== undefined) {
      window.clearTimeout(existing)
      timersRef.current.delete(id)
    }
  }, [])

  const removeNotification = useCallback((id: string) => {
    clearNotificationTimer(id)
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [clearNotificationTimer])

  const addNotification = useCallback((notification: AskAiNotification, durationMs: number | null) => {
    setNotifications((prev) => {
      const alreadyExists = prev.some((n) => n.id === notification.id)
      if (alreadyExists) {
        return prev
      }
      return [...prev, notification]
    })

    if (durationMs !== null) {
      const timerId = window.setTimeout(() => {
        removeNotification(notification.id)
      }, durationMs)
      timersRef.current.set(notification.id, timerId)
    }
  }, [removeNotification])

  useEffect(() => {
    addNotificationRef.current = addNotification
  }, [addNotification])

  useEffect(() => {
    const unsubscribe = subscribeToAskAiTasks((task: AskAiTask) => {
      const message = ASK_AI_ERROR_MESSAGES[task.feature]
      if (!message) {
        return
      }

      const errorId = `${task.feature}-error`

      if (task.status === 'pending' && !task.exceededThreshold) {
        seenCompletedRef.current.delete(errorId)
        return
      }

      if (task.status === 'error' && !seenCompletedRef.current.has(errorId)) {
        if (!isOnFeaturePage(task.feature)) {
          seenCompletedRef.current.add(errorId)
          addNotification(
            { id: errorId, feature: task.feature, tone: 'error', description: message },
            ERROR_DISMISS_MS,
          )
          sendBrowserNotification(message)
        }
      }

      if (task.status === 'cancelled') {
        removeNotification(errorId)
      }
    })

    return unsubscribe
  }, [addNotification, removeNotification])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && wasHiddenRef.current) {
        const tasks = getTasks()
        for (const task of tasks) {
          if (task.status !== 'error') continue
          if (isOnFeaturePage(task.feature)) continue

          const errorId = `${task.feature}-error`
          const message = ASK_AI_ERROR_MESSAGES[task.feature]
          if (!message) continue

          if (task.status === 'error' && !seenCompletedRef.current.has(errorId)) {
            seenCompletedRef.current.add(errorId)
            addNotificationRef.current?.(
              { id: errorId, feature: task.feature, tone: 'error', description: message },
              ERROR_DISMISS_MS,
            )
          }
        }
      }

      wasHiddenRef.current = document.visibilityState === 'hidden'
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      const tasks = getTasks()
      for (const task of tasks) {
        if (task.status !== 'error') continue
        if (isOnFeaturePage(task.feature)) continue

        const errorId = `${task.feature}-error`
        const message = ASK_AI_ERROR_MESSAGES[task.feature]
        if (!message) continue

        if (task.status === 'error' && !seenCompletedRef.current.has(errorId)) {
          seenCompletedRef.current.add(errorId)
          addNotificationRef.current?.(
            { id: errorId, feature: task.feature, tone: 'error', description: message },
            ERROR_DISMISS_MS,
          )
        }
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const value = useMemo<AskAiNotificationContextValue>(() => ({}), [])

  return (
    <AskAiNotificationContext.Provider value={value}>
      {children}
      {notifications.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] z-[9998] flex flex-col items-center gap-2 sm:bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] sm:left-auto sm:right-5 sm:top-auto sm:items-end">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`pointer-events-auto w-full max-w-[420px] rounded-2xl border px-4 py-3 shadow-lg motion-safe:animate-[gala-game-invite-pop_280ms_cubic-bezier(0.16,1,0.3,1)_both] ${
                isDarkMode
                  ? 'border-[rgba(248,113,113,0.18)] bg-[rgba(27,26,23,0.82)] text-slate-100'
                  : `bg-white text-slate-900 ${toneBorders[notification.tone]}`
              }`}
              aria-live="polite"
              role="status"
            >
              <div className="flex items-start gap-2.5">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                  isDarkMode
                    ? 'bg-[rgba(127,29,29,0.44)] text-rose-200'
                    : `${toneBackgrounds[notification.tone]} ${toneTextColors[notification.tone]}`
                }`}>
                  <AppIcon name={toneIcons[notification.tone] as never} className="h-4 w-4" strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs leading-5 font-medium ${isDarkMode ? 'text-rose-100' : 'text-slate-600'}`}>
                    {notification.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    removeNotification(notification.id)
                  }}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition ${
                    isDarkMode
                      ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                  }`}
                  aria-label="Dismiss"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </AskAiNotificationContext.Provider>
  )
}

function useAskAiNotification() {
  const context = useContext(AskAiNotificationContext)

  if (!context) {
    throw new Error('useAskAiNotification must be used inside AskAiNotificationProvider.')
  }

  return context
}

export { AskAiNotificationProvider, useAskAiNotification }
