import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowUp, ExternalLink, Map as MapIcon, SquarePen, Sparkles, Square, X } from 'lucide-react'
import AskAiUsagePill from '../../AskAiUsagePill'
import { FeatureGuideModalTrigger, featureGuideContent } from '../../FeatureGuideModal'
import { Button, Chip, Skeleton } from '../../ui'
import type { AskAiSource } from '../homeHelpers'
import { cancelAskAiRuntimeRequest, type ChatMessage } from '../../../utils/askAiRuntime'
import type { AskAiUsageStatus } from '../../../utils/askAiUsage'

const starterPrompts = [
  { label: 'Date ideas', prompt: 'Plan a date gala' },
  { label: 'Food trip', prompt: 'Plan a food trip' },
  { label: 'Quick itinerary', prompt: 'Create a quick itinerary' },
  { label: 'Budget picks', prompt: 'Suggest budget-friendly places to visit' },
]

function isChatbotDailyLimitMessage(message: string | null) {
  if (!message) return false
  const normalized = message.trim().toLowerCase()
  return normalized === 'you have reached your chatbot ai daily limit.' || normalized === 'daily_ai_limit_reached'
}

function isChatbotUsageLimitReached(usageStatus: AskAiUsageStatus | null, isRegistered: boolean) {
  if (!usageStatus) return false
  return isRegistered ? !usageStatus.allowed || usageStatus.remaining <= 0 : !usageStatus.allowed
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-3 whitespace-pre-wrap break-words last:mb-0 [overflow-wrap:anywhere]">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-5">{children}</ol>,
  li: ({ children }) => <li className="break-words [overflow-wrap:anywhere]">{children}</li>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="whitespace-pre-wrap break-all rounded-[var(--r-1)] bg-[var(--fill)] px-1.5 py-0.5 text-[13px]">{children}</code>,
  pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-[var(--r-2)] bg-[var(--fill)] p-3 text-[13px]">{children}</pre>,
  h1: ({ children }) => <h3 className="g-h3 mb-2 mt-4 first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="g-h3 mb-2 mt-4 first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1.5 mt-3 font-semibold first:mt-0">{children}</h4>,
  blockquote: ({ children }) => <blockquote className="g-mut my-3 border-l-2 border-[var(--line)] pl-4">{children}</blockquote>,
  table: ({ children }) => (
    <div className="my-3 max-w-full overflow-x-auto">
      <table className="min-w-max border-collapse text-[14px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="whitespace-nowrap border border-[var(--line)] bg-[var(--fill)] px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-[var(--line)] px-3 py-2 align-top">{children}</td>,
}

const aiBubbleClass =
  'w-full min-w-0 max-w-[92%] self-start rounded-[var(--r-3)] rounded-tl-[var(--r-1)] border border-[var(--line-2)] bg-[var(--surface)] px-4 py-3 text-[15px] leading-[1.65]'

function SourceLinks({ sources }: { sources: AskAiSource[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--line-2)] pt-3">
      <span className="g-eyebrow mr-1">Sources</span>
      {sources.map((source) => (
        <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="g-tag max-w-[200px]">
          <span className="truncate">{source.title}</span>
          <ExternalLink aria-hidden="true" />
        </a>
      ))}
    </div>
  )
}

function Notice({ tone, children }: { tone: 'bad' | 'warn'; children: ReactNode }) {
  const toneClass = tone === 'bad' ? 'bg-[var(--bad-soft)] text-[var(--bad)]' : 'bg-[var(--warn-soft)] text-[var(--warn)]'
  return (
    <p role={tone === 'bad' ? 'alert' : 'status'} className={`g-sm rounded-[var(--r-3)] px-4 py-3 ${toneClass}`}>
      {children}
    </p>
  )
}

const ChatMessageList = memo(function ChatMessageList({
  isSessionLoading,
  isRegistered,
  usageError,
  messages,
  isSubmitting,
  answer,
  sources,
  answerError,
  isLimitReached,
  onSend,
  onRetryUsage,
}: {
  isSessionLoading: boolean
  isRegistered: boolean
  usageError: string | null
  messages: ChatMessage[]
  isSubmitting: boolean
  answer: string
  sources: AskAiSource[]
  answerError: string | null
  isLimitReached: boolean
  onSend: (text?: string) => void
  onRetryUsage: () => void
}) {
  const limitNotice = isRegistered && isLimitReached && !isSubmitting ? <Notice tone="warn">Ubos na ang AI chats mo today. Balik ka bukas.</Notice> : null

  if (!isSessionLoading && usageError) {
    return (
      <div className="g-empty my-auto">
        <div className="g-h3">AI is resting right now</div>
        <p className="g-sm g-mut">{usageError}</p>
        <div className="mt-4 flex justify-center">
          <Button variant="ink" size="sm" onClick={onRetryUsage}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  if (messages.length === 0 && !isSubmitting && !answer) {
    return (
      <div className="my-auto flex flex-col gap-4 py-6">
        <div>
          <span className="g-ai-badge">
            <Sparkles aria-hidden="true" />
            GalaTayo AI
          </span>
          <h2 className="g-h1 mt-2">Ano ang plano today?</h2>
          <p className="g-sm g-mut mt-1">Places, food, dates, at iba pa. English or Taglish, okay lang.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {starterPrompts.map((chip) => (
            <Chip key={chip.label} disabled={isLimitReached && isRegistered} onClick={() => onSend(chip.prompt)}>
              {chip.label}
            </Chip>
          ))}
        </div>
        {limitNotice}
      </div>
    )
  }

  const lastAssistantIndex = messages.map((message) => message.role).lastIndexOf('assistant')

  return (
    <div className="flex flex-col gap-3">
      {messages.map((message, index) =>
        message.role === 'user' ? (
          <div key={index} className="max-w-[85%] self-end rounded-[var(--r-3)] rounded-tr-[var(--r-1)] bg-[var(--ink)] px-4 py-2.5 text-[15px] leading-relaxed text-[var(--on-ink)]">
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
          </div>
        ) : (
          <div key={index} className={aiBubbleClass}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
            {index === lastAssistantIndex && sources.length > 0 ? <SourceLinks sources={sources} /> : null}
          </div>
        ),
      )}

      {isSubmitting && !answer ? (
        <div className={aiBubbleClass} aria-live="polite">
          <span className="g-ai-badge">
            <Sparkles aria-hidden="true" />
            Thinking…
          </span>
          <Skeleton className="mt-3 h-3 w-11/12" />
          <Skeleton className="mt-2 h-3 w-3/4" />
        </div>
      ) : null}

      {answerError && !isSubmitting && messages.length > 0 && !isChatbotDailyLimitMessage(answerError) ? <Notice tone="bad">{answerError}</Notice> : null}

      {messages.length > 0 ? limitNotice : null}
    </div>
  )
})

function AskAiModePanel({
  isRegistered,
  isSessionLoading,
  usageStatus,
  usageError,
  answer,
  sources,
  isSubmitting,
  answerError,
  messages,
  onRetryUsage,
  onSubmit,
  onStartOver,
  onGuestUpgradePrompt,
  onClose,
  onShowOnMap,
  className = '',
}: {
  isRegistered: boolean
  isSessionLoading: boolean
  usageStatus: AskAiUsageStatus | null
  isUsageLoading: boolean
  usageError: string | null
  answer: string
  sources: AskAiSource[]
  isSubmitting: boolean
  answerError: string | null
  messages: ChatMessage[]
  onRetryUsage: () => void
  onSubmit: (questionOverride?: string) => void
  onStartOver: () => void
  onGuestUpgradePrompt: () => void
  onClose?: () => void
  onShowOnMap?: (question: string) => void
  className?: string
}) {
  const lastUserQuestion = [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
  const canShowOnMap = Boolean(onShowOnMap) && Boolean(lastUserQuestion) && !isSubmitting && messages[messages.length - 1]?.role === 'assistant'
  const isUsagePending = !usageStatus
  const isLimitReached = isChatbotUsageLimitReached(usageStatus, isRegistered)
  const messageScrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [draftQuestion, setDraftQuestion] = useState('')
  const draftQuestionRef = useRef('')

  useEffect(() => {
    const scroller = messageScrollRef.current
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  }, [answer, isSubmitting, messages])

  useLayoutEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`
  }, [draftQuestion])

  const updateDraftQuestion = useCallback((nextQuestion: string) => {
    draftQuestionRef.current = nextQuestion
    setDraftQuestion(nextQuestion)
  }, [])

  const handleSend = useCallback(
    (text?: string) => {
      const finalQuestion = (text ?? draftQuestionRef.current).trim()
      if (isSubmitting || isUsagePending) return
      if (isLimitReached && !isRegistered) {
        onGuestUpgradePrompt()
        return
      }
      if (!finalQuestion || isLimitReached) return
      updateDraftQuestion('')
      onSubmit(finalQuestion)
    },
    [isLimitReached, isRegistered, isSubmitting, isUsagePending, onGuestUpgradePrompt, onSubmit, updateDraftQuestion],
  )

  return (
    <div className={`flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[var(--paper)] ${className}`}>
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line-2)] bg-[var(--surface)] px-4 py-2 pt-[max(env(safe-area-inset-top,0px),0.5rem)] sm:pt-2">
        <div className="min-w-0 flex-1">
          <p className="g-h3 leading-tight">Ask AI</p>
          <AskAiUsagePill usageStatus={usageStatus} />
        </div>
        <Button variant="soft" size="sm" onClick={onStartOver} aria-label="New chat">
          <SquarePen aria-hidden="true" />
          New
        </Button>
        <FeatureGuideModalTrigger content={featureGuideContent.chatbot} className="h-11 w-11" />
        {onClose ? (
          <Button variant="soft" size="sm" iconOnly onClick={onClose} aria-label="Close chat">
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <div ref={messageScrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-4 [overflow-anchor:none]">
        <ChatMessageList
          isSessionLoading={isSessionLoading}
          isRegistered={isRegistered}
          usageError={usageError}
          messages={messages}
          isSubmitting={isSubmitting}
          answer={answer}
          sources={sources}
          answerError={answerError}
          isLimitReached={isLimitReached}
          onSend={handleSend}
          onRetryUsage={onRetryUsage}
        />
        {canShowOnMap ? (
          <Button variant="line" size="sm" className="mt-3 self-start" onClick={() => onShowOnMap?.(lastUserQuestion)}>
            <MapIcon aria-hidden="true" />
            Show on map
          </Button>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-[var(--line-2)] bg-[var(--surface)] px-3 pt-3 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)]">
        {!isRegistered ? (
          <p className="g-xs g-mut mb-2 flex flex-wrap items-center gap-x-1 px-1">
            Guest mode, limited chats a day.
            <button type="button" onClick={onGuestUpgradePrompt} className="font-semibold text-[var(--ink)] underline underline-offset-2">
              Log in for more
            </button>
          </p>
        ) : null}
        <div className="flex items-end gap-2 rounded-[var(--r-4)] border border-[var(--line)] bg-[var(--surface)] p-1.5 pl-3 focus-within:border-[var(--ink)]">
          <label htmlFor="ask-ai-chat-input" className="sr-only">
            Message GalaTayo AI
          </label>
          <textarea
            id="ask-ai-chat-input"
            ref={textareaRef}
            value={draftQuestion}
            onChange={(event) => updateDraftQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSend()
              }
            }}
            placeholder="Saan tayo? Ask anything…"
            rows={1}
            disabled={isSubmitting || isUsagePending || (isLimitReached && isRegistered)}
            className="max-h-[140px] min-h-[40px] flex-1 resize-none overflow-y-auto bg-transparent py-2 text-[16px] leading-snug text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)] disabled:cursor-not-allowed"
          />
          <Button
            variant="ink"
            iconOnly
            onClick={() => (isSubmitting ? cancelAskAiRuntimeRequest() : handleSend())}
            disabled={!isSubmitting && (isUsagePending || (!draftQuestion.trim() && !isLimitReached) || (isLimitReached && isRegistered))}
            aria-label={isSubmitting ? 'Stop answer' : 'Send message'}
          >
            {isSubmitting ? <Square aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
          </Button>
        </div>
        <p className="g-xs g-fnt mt-2 text-center">AI can be wrong. Double-check before you go.</p>
      </div>
    </div>
  )
}

export { AskAiModePanel }
