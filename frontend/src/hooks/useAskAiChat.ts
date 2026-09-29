import { useEffect, useRef, useState } from 'react'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { useAskAiUsageAutoRefresh } from './useAskAiUsageAutoRefresh'
import {
  getAskAiRuntimeState,
  hasActiveAskAiRuntimeState,
  resetAskAiRuntimeState,
  resumeAskAiRuntimeJob,
  seedAskAiRuntimeState,
  submitAskAiRuntimeRequest,
  subscribeToAskAiRuntime,
} from '../utils/askAiRuntime'
import type { ChatMessage } from '../utils/askAiRuntime'
import { getApiUrl } from '../utils/apiClient'
import { getAskAiUsageStatusFromResponse, type AskAiUsageResponse, type AskAiUsageStatus } from '../utils/askAiUsage'
import { buildAskAiRequestHeaders, getOrCreateAskAiGuestId } from '../utils/askAiIdentity'
import { trackAskAiChatbotUsed } from '../utils/analytics'
import {
  type AskAiSource,
  readAskAiRouteCache,
  writeAskAiRouteCache,
  clearAskAiRouteCache,
  normalizeSearchText,
} from '../components/home/homeHelpers'

function isAskAiChatbotDailyLimitMessage(message: string | null) {
  if (!message) {
    return false
  }

  const normalized = message.trim().toLowerCase()
  return (
    normalized === 'you have reached your chatbot ai daily limit.' ||
    normalized === 'daily_ai_limit_reached'
  )
}

export function useAskAiChat(initialQuestion = '') {
  const initialAskAiState = useRef(
    hasActiveAskAiRuntimeState() ? getAskAiRuntimeState() : readAskAiRouteCache()
  ).current
  const normalizedInitialQuestion = normalizeSearchText(initialQuestion)
  const shouldUseCachedState =
    Boolean(initialAskAiState) &&
    (!normalizedInitialQuestion || initialAskAiState?.question === normalizedInitialQuestion)
  const cachedState = shouldUseCachedState ? initialAskAiState : null

  const { session, isSessionLoading } = useSavedFavorites()
  const [usageStatus, setUsageStatus] = useState<AskAiUsageStatus | null>(null)
  const [isUsageLoading, setIsUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [usageRefreshSignal, setUsageRefreshSignal] = useState(0)
  const [question, setQuestion] = useState(cachedState?.question ?? initialQuestion)
  const [answer, setAnswer] = useState(cachedState?.answer ?? '')
  const [sources, setSources] = useState<AskAiSource[]>(cachedState?.sources ?? [])
  const [isSubmitting, setIsSubmitting] = useState(cachedState?.isSubmitting === true)
  const [answerError, setAnswerError] = useState<string | null>(
    cachedState?.answerError && !isAskAiChatbotDailyLimitMessage(cachedState.answerError)
      ? cachedState.answerError
      : null
  )
  const [messages, setMessages] = useState<ChatMessage[]>(cachedState?.messages ?? [])
  const [isGuestPromptOpen, setIsGuestPromptOpen] = useState(false)
  const lastAutoSubmittedQuestionRef = useRef('')

  const submit = async (questionOverride?: string) => {
    const nextQuestion = normalizeSearchText(questionOverride ?? question)
    const guestId = session?.access_token ? null : getOrCreateAskAiGuestId()

    if (!nextQuestion || isSubmitting || (!session?.access_token && !guestId)) {
      return
    }

    setQuestion(nextQuestion)

    const updatedMessages: ChatMessage[] = [
      ...messages,
      { role: 'user' as const, content: nextQuestion },
    ]
    setMessages(updatedMessages)

    await submitAskAiRuntimeRequest({
      question: nextQuestion,
      accessToken: session?.access_token ?? null,
      guestId,
      messages: updatedMessages,
    })
    setUsageRefreshSignal((signal) => signal + 1)
  }

  const startOver = () => {
    resetAskAiRuntimeState({ usageStatus })
    setQuestion('')
    setAnswer('')
    setSources([])
    setAnswerError(null)
    setUsageError(null)
    setMessages([])

    if (!usageStatus && session?.access_token) {
      setUsageRefreshSignal((current) => current + 1)
    }

    clearAskAiRouteCache()
  }

  useEffect(() => {
    const initialAnswerError = initialAskAiState?.answerError ?? null
    seedAskAiRuntimeState({
      question: initialAskAiState?.question ?? '',
      answer: initialAskAiState?.answer ?? '',
      sources: initialAskAiState?.sources ?? [],
      answerError: initialAnswerError && isAskAiChatbotDailyLimitMessage(initialAnswerError) ? null : initialAnswerError,
      usageStatus: null,
      isSubmitting: initialAskAiState?.isSubmitting === true,
      messages: initialAskAiState?.messages ?? [],
      jobId: initialAskAiState?.jobId ?? null,
      jobStatus: initialAskAiState?.jobStatus ?? null,
    })

    let hasReceivedInitialRuntimeState = false

    return subscribeToAskAiRuntime((runtimeState) => {
      setQuestion(runtimeState.question)
      setAnswer(runtimeState.answer)
      setSources(runtimeState.sources)
      setAnswerError(runtimeState.answerError)
      if (hasReceivedInitialRuntimeState && runtimeState.usageStatus) {
        setUsageStatus(runtimeState.usageStatus)
      }
      hasReceivedInitialRuntimeState = true
      setIsSubmitting(runtimeState.isSubmitting)

      if (runtimeState.answer && runtimeState.jobStatus === 'completed') {
        trackAskAiChatbotUsed({
          answerLength: runtimeState.answer.length,
        })
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1]
          if (lastMessage?.role === 'assistant' && lastMessage.content === runtimeState.answer) {
            return prev
          }
          if (lastMessage?.role === 'assistant') {
            return [...prev.slice(0, -1), { role: 'assistant' as const, content: runtimeState.answer }]
          }
          return [...prev, { role: 'assistant' as const, content: runtimeState.answer }]
        })
      }
    })
  }, [initialAskAiState])

  useEffect(() => {
    if (!normalizedInitialQuestion || lastAutoSubmittedQuestionRef.current === normalizedInitialQuestion) {
      return
    }

    const runtimeState = getAskAiRuntimeState()
    const isSameQuestion = runtimeState.question === normalizedInitialQuestion
    const hasActiveRequest = isSameQuestion && runtimeState.isSubmitting
    const hasCachedResult =
      isSameQuestion && Boolean(runtimeState.answer || runtimeState.answerError || runtimeState.sources.length)

    if (hasActiveRequest || hasCachedResult) {
      lastAutoSubmittedQuestionRef.current = normalizedInitialQuestion
      return
    }

    if (isSessionLoading || (!session?.access_token && !getOrCreateAskAiGuestId())) {
      return
    }

    lastAutoSubmittedQuestionRef.current = normalizedInitialQuestion
    void submit(normalizedInitialQuestion)
  })

  useEffect(() => {
    const normalizedQuestion = normalizeSearchText(question)

    if (!normalizedQuestion && !answer && !sources.length && !answerError) {
      clearAskAiRouteCache()
      return
    }

    const runtimeState = getAskAiRuntimeState()

    writeAskAiRouteCache({
      question: normalizedQuestion,
      answer,
      sources,
      answerError,
      isSubmitting,
      messages,
      jobId: runtimeState.jobId,
      jobStatus: runtimeState.jobStatus,
    })
  }, [answer, answerError, question, sources, isSubmitting, messages])

  useEffect(() => {
    if (!session?.access_token) {
      return
    }

    void resumeAskAiRuntimeJob({
      accessToken: session.access_token,
    })
  }, [session?.access_token])

  useEffect(() => {
    if (!usageStatus?.allowed) {
      return
    }

    setAnswerError((currentValue) =>
      isAskAiChatbotDailyLimitMessage(currentValue) ? null : currentValue
    )
  }, [usageStatus?.allowed])

  useAskAiUsageAutoRefresh({
    enabled: !isSessionLoading,
    onRefresh: () => {
      setUsageRefreshSignal((prev) => prev + 1)
    },
  })

  useEffect(() => {
    if (isSessionLoading) {
      return
    }

    const controller = new AbortController()
    const guestId = session?.access_token ? null : getOrCreateAskAiGuestId()

    const loadUsage = async () => {
      try {
        setIsUsageLoading(true)
        setUsageError(null)
        setUsageStatus(null)

        if (!session?.access_token && !guestId) {
          throw new Error('Missing Ask AI guest identifier.')
        }

        const response = await fetch(getApiUrl('/ask-ai/usage/check'), {
          method: 'GET',
          cache: 'no-store',
          headers: buildAskAiRequestHeaders(session?.access_token ?? null),
          signal: controller.signal,
        })

        const data = (await response.json()) as AskAiUsageResponse

        if (!response.ok) {
          throw new Error(data.message || data.error || 'Failed to check Ask AI usage.')
        }

        const nextUsageStatus = getAskAiUsageStatusFromResponse(data, ['chatbotAi'])

        if (!nextUsageStatus) {
          throw new Error('Ask AI usage response was incomplete.')
        }

        setUsageStatus(nextUsageStatus)
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        setUsageError(error instanceof Error ? error.message : 'Failed to check Ask AI usage.')
      } finally {
        if (!controller.signal.aborted) {
          setIsUsageLoading(false)
        }
      }
    }

    void loadUsage()

    return () => controller.abort()
  }, [usageRefreshSignal, isSessionLoading, session?.access_token])

  return {
    panelProps: {
      isRegistered: Boolean(session?.user),
      isSessionLoading,
      usageStatus,
      isUsageLoading,
      usageError,
      answer,
      sources,
      isSubmitting,
      answerError,
      messages,
      onRetryUsage: () => setUsageRefreshSignal((signal) => signal + 1),
      onSubmit: (questionOverride?: string) => void submit(questionOverride),
      onStartOver: startOver,
      onGuestUpgradePrompt: () => setIsGuestPromptOpen(true),
    },
    isGuestPromptOpen,
    closeGuestPrompt: () => setIsGuestPromptOpen(false),
  }
}
