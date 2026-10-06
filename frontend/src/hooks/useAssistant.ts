import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { getApiUrl } from '../utils/apiClient'
import { getAskAiRequestHeaders, getOrCreateAskAiGuestId } from '../utils/askAiIdentity'
import { getAskAiUsageStatusFromResponse, normalizeAskAiUsageStatus, type AskAiUsageResponse, type AskAiUsageStatus } from '../utils/askAiUsage'
import { EMPTY_MEMORY, historyFor, parseLine, parseNdjson, type AssistantEvent, type AssistantMemory, type AssistantMode, type AssistantTurn } from '../utils/assistantCore'
import { hasAccountSession } from '../utils/guestSession'
import { trackAskAiChatbotUsed } from '../utils/analytics'

/*
 * One conversation per browser tab, shared by the floating chat and the map page, kept in sessionStorage
 * so it survives navigation and reloads within the tab.
 */
type AssistantState = { turns: AssistantTurn[]; memory: AssistantMemory; busy: boolean }

const STORAGE_KEY = 'galatayo:assistant:v1'
let state: AssistantState = readStored()
let controller: AbortController | null = null
let activeRequest: { id: string; usageType: string } | null = null
const listeners = new Set<() => void>()

function readStored(): AssistantState {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(STORAGE_KEY) : null
    const parsed = raw ? (JSON.parse(raw) as Partial<AssistantState>) : null
    if (parsed && Array.isArray(parsed.turns)) {
      // A turn that was streaming when the page went away can't resume.
      const turns = parsed.turns.map((turn) => (turn.role === 'assistant' && turn.streaming ? { ...turn, streaming: false, status: null, error: turn.text ? null : 'Interrupted. Try again.' } : turn))
      return { turns, memory: { ...EMPTY_MEMORY, ...(parsed.memory ?? {}) }, busy: false }
    }
  } catch {
    // Storage blocked or bad JSON: start fresh.
  }
  return { turns: [], memory: { ...EMPTY_MEMORY }, busy: false }
}

function setState(next: AssistantState) {
  state = next
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ turns: next.turns.slice(-30), memory: next.memory }))
  } catch {
    // Not critical.
  }
  listeners.forEach((listener) => listener())
}

function updateTurn(id: string, update: (turn: Extract<AssistantTurn, { role: 'assistant' }>) => Extract<AssistantTurn, { role: 'assistant' }>) {
  setState({ ...state, turns: state.turns.map((turn) => (turn.id === id && turn.role === 'assistant' ? update(turn) : turn)) })
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

function applyEvent(turnId: string, event: AssistantEvent, onUsage: (usage: AskAiUsageStatus | null) => void) {
  switch (event.type) {
    case 'status':
      return updateTurn(turnId, (turn) => ({ ...turn, status: event.text }))
    case 'places':
      return updateTurn(turnId, (turn) => ({ ...turn, preview: event.places, previewMap: event.map }))
    case 'delta':
      return updateTurn(turnId, (turn) => ({ ...turn, status: null, text: turn.text + event.text }))
    case 'reset':
      return updateTurn(turnId, (turn) => ({ ...turn, text: '' }))
    case 'error':
      onUsage(normalizeAskAiUsageStatus(event.usage))
      return updateTurn(turnId, (turn) => ({ ...turn, streaming: false, status: null, error: event.message }))
    case 'final':
      onUsage(normalizeAskAiUsageStatus(event.response.usage))
      setState({ ...state, memory: event.response.memory })
      return updateTurn(turnId, (turn) => ({ ...turn, streaming: false, status: null, text: event.response.text, response: event.response, preview: [], previewMap: null }))
  }
}

async function sendMessage(message: string, mode: AssistantMode, accessToken: string | null, onUsage: (usage: AssistantUsageUpdate) => void) {
  const text = message.trim()
  if (!text || state.busy) return
  controller?.abort()
  controller = new AbortController()
  const signal = controller.signal
  const requestId = newId()
  activeRequest = { id: requestId, usageType: mode === 'map' ? 'ask_ai_maps' : 'chatbot_ai' }
  const history = historyFor(state.turns)
  const turnId = newId()
  setState({
    ...state,
    busy: true,
    turns: [
      ...state.turns,
      { id: newId(), role: 'user', text },
      { id: turnId, role: 'assistant', text: '', status: null, streaming: true, preview: [], previewMap: null, response: null, error: null },
    ],
  })

  try {
    const response = await fetch(getApiUrl('/ask-ai/assistant'), {
      method: 'POST',
      cache: 'no-store',
      headers: { ...(await getAskAiRequestHeaders(accessToken)), 'x-request-id': requestId },
      body: JSON.stringify({ message: text, mode, history, memory: state.memory, stream: true }),
      signal,
    })
    let gotFinal = false
    const handle = (event: AssistantEvent) => {
      if (event.type === 'final') {
        gotFinal = true
        trackAskAiChatbotUsed({ answerLength: event.response.text.length })
      }
      if (event.type === 'error') gotFinal = true
      applyEvent(turnId, event, onUsage)
    }
    if (!response.body) {
      const event = parseLine(await response.text())
      if (event) handle(event)
    } else {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parsed = parseNdjson(buffer)
        buffer = parsed.rest
        parsed.events.forEach(handle)
      }
      const tail = parseLine(buffer)
      if (tail) handle(tail)
    }
    if (!gotFinal) updateTurn(turnId, (turn) => ({ ...turn, streaming: false, status: null, error: 'Tara got cut off. Try again.' }))
  } catch (error) {
    if (signal.aborted) {
      updateTurn(turnId, (turn) => ({ ...turn, streaming: false, status: null, error: turn.text ? null : 'Stopped.' }))
    } else {
      const offline = error instanceof TypeError
      updateTurn(turnId, (turn) => ({ ...turn, streaming: false, status: null, error: offline ? "Can't reach Tara. Check your connection and try again." : 'Tara had a hiccup. Try again.' }))
    }
  } finally {
    if (controller?.signal === signal) controller = null
    activeRequest = null
    setState({ ...state, busy: false })
  }
}

type AssistantUsageUpdate = AskAiUsageStatus | null

export function stopAssistant() {
  if (activeRequest) {
    void fetch(getApiUrl('/ask-ai/cancel'), {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', 'x-request-id': activeRequest.id },
      body: JSON.stringify({ requestId: activeRequest.id, usageType: activeRequest.usageType }),
    }).catch(() => undefined)
  }
  controller?.abort()
}

export function resetAssistant() {
  stopAssistant()
  setState({ turns: [], memory: { ...EMPTY_MEMORY }, busy: false })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAssistantState() {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

/** Chat state, quota and actions for one mode. Both modes share the conversation and memory. */
export function useAssistant(mode: AssistantMode) {
  const { session, isSessionLoading } = useSavedFavorites()
  const current = useAssistantState()
  const [usage, setUsage] = useState<AskAiUsageStatus | null>(null)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [usageVersion, setUsageVersion] = useState(0)
  const accessToken = session?.access_token ?? null

  useEffect(() => {
    if (isSessionLoading) return
    const abort = new AbortController()
    ;(async () => {
      try {
        if (!accessToken && !getOrCreateAskAiGuestId()) throw new Error('Missing Ask AI guest identifier.')
        const response = await fetch(getApiUrl('/ask-ai/usage/check'), { cache: 'no-store', headers: await getAskAiRequestHeaders(accessToken), signal: abort.signal })
        const data = (await response.json()) as AskAiUsageResponse
        if (!response.ok) throw new Error(data.message || data.error || 'Could not check your AI limit.')
        setUsage(getAskAiUsageStatusFromResponse(data, [mode === 'map' ? 'askAiMaps' : 'chatbotAi']))
        setUsageError(null)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setUsageError(error instanceof Error ? error.message : 'Could not check your AI limit.')
      }
    })()
    return () => abort.abort()
  }, [accessToken, isSessionLoading, mode, usageVersion])

  const send = useCallback(
    (message: string) => sendMessage(message, mode, accessToken, (next) => next && next.usageType === (mode === 'map' ? 'ask_ai_maps' : 'chatbot_ai') && setUsage(next)),
    [accessToken, mode],
  )

  const limitReached = Boolean(usage && (!usage.allowed || usage.remaining <= 0))
  return {
    turns: current.turns,
    memory: current.memory,
    busy: current.busy,
    usage,
    usageError,
    limitReached,
    isRegistered: hasAccountSession(session),
    isSessionLoading,
    send,
    stop: stopAssistant,
    reset: resetAssistant,
    retryUsage: () => setUsageVersion((value) => value + 1),
  }
}
