import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { Info } from '@phosphor-icons/react/dist/csr/Info'
import { WarningCircle } from '@phosphor-icons/react/dist/csr/WarningCircle'

export type SystemMessageTone = 'success' | 'info' | 'error'

type SystemMessagePayload = {
  title: string
  description?: string
  durationMs?: number
  /** Defaults from the title: failures read as errors, removals as info, the rest as success. */
  tone?: SystemMessageTone
}

type SystemMessageState = {
  id: number
  title: string
  description: string
  tone: SystemMessageTone
}

const ERROR_TITLE = /could not|couldn't|can't|cannot|failed|unable|error/i
const INFO_TITLE = /removed|deleted|already|copied|updated|required|rejected/i

function guessTone(title: string): SystemMessageTone {
  if (ERROR_TITLE.test(title)) return 'error'
  if (INFO_TITLE.test(title)) return 'info'
  return 'success'
}

const TONE_CLASS: Record<SystemMessageTone, string> = { success: 'is-ok', info: '', error: 'is-bad' }
const TONE_ICON = { success: Check, info: Info, error: WarningCircle }

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

  const showSystemMessage = useCallback(({ title, description = '', durationMs = DEFAULT_DURATION_MS, tone }: SystemMessagePayload) => {
    clearMessageTimer()

    setMessage({
      id: Date.now(),
      title,
      description,
      tone: tone ?? guessTone(title),
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
        <div className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--tabbar-h)+12px+env(safe-area-inset-bottom,0px))] z-[9999] flex justify-center sm:inset-x-auto sm:right-5 sm:justify-end lg:bottom-5">
          <SystemToast key={message.id} message={message} />
        </div>
      ) : null}
    </SystemMessageContext.Provider>
  )
}

function SystemToast({ message }: { message: SystemMessageState }) {
  const Icon = TONE_ICON[message.tone]
  return (
    <div className={`g-toast ${TONE_CLASS[message.tone]}`} role={message.tone === 'error' ? 'alert' : 'status'} aria-live={message.tone === 'error' ? 'assertive' : 'polite'}>
      <span className="g-toast-ic" aria-hidden="true">
        <Icon weight="bold" />
      </span>
      <div className="g-toast-body">
        <p className="g-toast-title">{message.title}</p>
        {message.description ? <p className="g-toast-desc">{message.description}</p> : null}
      </div>
    </div>
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
