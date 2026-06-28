import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppToast } from '../components/AppUI'

type SystemMessagePayload = {
  title: string
  description?: string
  durationMs?: number
  tone?: 'success' | 'error' | 'warning' | 'info' | 'neutral'
}

type SystemMessageState = {
  id: number
  title: string
  description: string
  tone: 'success' | 'error' | 'warning' | 'info' | 'neutral'
}

type SystemMessageContextValue = {
  showSystemMessage: (payload: SystemMessagePayload) => void
}

const DEFAULT_DURATION_MS = 3000

const SystemMessageContext = createContext<SystemMessageContextValue | null>(null)

function SystemMessageProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<SystemMessageState | null>(null)
  const timerRef = useRef<number | null>(null)

  const clearMessageTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => clearMessageTimer, [clearMessageTimer])

  const showSystemMessage = useCallback(({ title, description = '', durationMs = DEFAULT_DURATION_MS, tone = 'success' }: SystemMessagePayload) => {
    clearMessageTimer()

    setMessage({
      id: Date.now(),
      title,
      description,
      tone,
    })

    timerRef.current = window.setTimeout(() => {
      setMessage((currentValue) => (currentValue ? null : currentValue))
      timerRef.current = null
    }, durationMs)
  }, [clearMessageTimer])

  const value = useMemo<SystemMessageContextValue>(() => ({
    showSystemMessage,
  }), [showSystemMessage])

  return (
    <SystemMessageContext.Provider value={value}>
      {children}
      {message ? (
        <div className="pointer-events-none fixed inset-x-4 top-4 z-[9999] flex justify-center sm:inset-x-auto sm:right-5 sm:top-5 sm:justify-end">
          <AppToast
            key={message.id}
            className="w-full max-w-[420px] backdrop-blur"
            role="status"
            aria-live="polite"
            tone={message.tone}
            title={message.title}
            description={message.description}
          />
        </div>
      ) : null}
    </SystemMessageContext.Provider>
  )
}

function useSystemMessage() {
  const context = useContext(SystemMessageContext)

  if (!context) {
    throw new Error('useSystemMessage must be used inside SystemMessageProvider.')
  }

  return context
}

export { SystemMessageProvider, useSystemMessage }
