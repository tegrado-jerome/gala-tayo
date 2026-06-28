import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppIcon } from '../components/AppIcon'

type SystemMessagePayload = {
  title: string
  description?: string
  durationMs?: number
}

type SystemMessageState = {
  id: number
  title: string
  description: string
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

  const showSystemMessage = useCallback(({ title, description = '', durationMs = DEFAULT_DURATION_MS }: SystemMessagePayload) => {
    clearMessageTimer()

    setMessage({
      id: Date.now(),
      title,
      description,
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
          <div
            key={message.id}
            className="w-full max-w-[420px] rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-slate-900 shadow-md"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <AppIcon name="check" className="h-5 w-5" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">{message.title}</p>
                {message.description ? <p className="mt-1 text-xs leading-5 text-slate-600">{message.description}</p> : null}
              </div>
            </div>
          </div>
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
