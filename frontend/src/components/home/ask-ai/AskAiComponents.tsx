import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowUp } from '@phosphor-icons/react/dist/csr/ArrowUp'
import { ArrowSquareOut as ExternalLink } from '@phosphor-icons/react/dist/csr/ArrowSquareOut'
import { MapTrifold as MapIcon } from '@phosphor-icons/react/dist/csr/MapTrifold'
import { NotePencil as SquarePen } from '@phosphor-icons/react/dist/csr/NotePencil'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { Square } from '@phosphor-icons/react/dist/csr/Square'
import { X } from '@phosphor-icons/react/dist/csr/X'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { ForkKnife } from '@phosphor-icons/react/dist/csr/ForkKnife'
import { Path } from '@phosphor-icons/react/dist/csr/Path'
import { Coins } from '@phosphor-icons/react/dist/csr/Coins'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import InternalLink from '../../InternalLink'
import '../../../design/misc.css'
import AskAiUsagePill from '../../AskAiUsagePill'
import { FeatureGuideModalTrigger, featureGuideContent } from '../../FeatureGuideModal'
import { Button } from '../../ui'
import type { AskAiSource } from '../homeHelpers'
import { cancelAskAiRuntimeRequest, type ChatMessage } from '../../../utils/askAiRuntime'
import type { AskAiUsageStatus } from '../../../utils/askAiUsage'

const starterPrompts: Array<{ label: string; prompt: string; icon: PhosphorIcon }> = [
  { label: 'Date ideas', prompt: 'Plan a date gala', icon: Heart },
  { label: 'Food trip', prompt: 'Plan a food trip', icon: ForkKnife },
  { label: 'Quick itinerary', prompt: 'Create a quick itinerary', icon: Path },
  { label: 'Budget picks', prompt: 'Suggest budget-friendly places to visit', icon: Coins },
]

/** Tara, the GalaTayo AI: a coral sparkle avatar. */
export function TaraAvatar({ large = false }: { large?: boolean }) {
  return (
    <span className={large ? 'm-tara is-lg' : 'm-tara'} aria-hidden="true">
      <Sparkles weight="fill" />
    </span>
  )
}

/** Returns an in-app path for GalaTayo links so sources open without a page reload. */
function toInternalPath(url: string) {
  if (url.startsWith('/') && !url.startsWith('//')) return url
  try {
    const parsed = new URL(url)
    if (parsed.origin === window.location.origin || /(^|\.)galatayo\.app$/.test(parsed.hostname)) return `${parsed.pathname}${parsed.search}`
  } catch {
    return null
  }
  return null
}

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

function AiMessage({ children, live }: { children: ReactNode; live?: boolean }) {
  return (
    <div className="m-msg-ai" aria-live={live ? 'polite' : undefined}>
      <TaraAvatar />
      <div className="m-bubble-ai">{children}</div>
    </div>
  )
}

function SourceLinks({ sources }: { sources: AskAiSource[] }) {
  return (
    <div className="m-src" aria-label="Sources">
      {sources.map((source) => {
        const internalPath = toInternalPath(source.url)
        return internalPath ? (
          <InternalLink key={source.url} href={internalPath}>
            <MapPin weight="fill" aria-hidden="true" />
            <span>{source.title}</span>
          </InternalLink>
        ) : (
          <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden="true" />
            <span>{source.title}</span>
          </a>
        )
      })}
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
      <div className="my-auto flex flex-col gap-5 py-6">
        <div>
          <TaraAvatar large />
          <h2 className="g-h1 mt-4">Hi, I&apos;m Tara. Ano ang plano today?</h2>
          <p className="g-sm g-mut mt-1.5">Places, food, dates, at iba pa. English or Taglish, okay lang.</p>
        </div>
        <div className="m-starters">
          {starterPrompts.map(({ label, prompt, icon: Icon }) => (
            <button key={label} type="button" className="m-starter" disabled={isLimitReached && isRegistered} onClick={() => onSend(prompt)}>
              <Icon weight="duotone" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        {limitNotice}
      </div>
    )
  }

  const lastAssistantIndex = messages.map((message) => message.role).lastIndexOf('assistant')

  return (
    <div className="flex flex-col gap-4">
      {messages.map((message, index) =>
        message.role === 'user' ? (
          <div key={index} className="m-bubble-me">
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
          </div>
        ) : (
          <AiMessage key={index}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
            {index === lastAssistantIndex && sources.length > 0 ? <SourceLinks sources={sources} /> : null}
          </AiMessage>
        ),
      )}

      {isSubmitting && !answer ? (
        <AiMessage live>
          <span className="m-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="sr-only">Tara is thinking</span>
        </AiMessage>
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
        <TaraAvatar />
        <div className="min-w-0 flex-1">
          <p className="g-h3 leading-tight">Tara</p>
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
              Get more with a free account
            </button>
          </p>
        ) : null}
        <div className="flex items-end gap-2 rounded-[var(--r-4)] border border-[var(--line)] bg-[var(--surface)] p-1.5 pl-4 shadow-[var(--sh-1)] focus-within:border-[var(--ink)]">
          <label htmlFor="ask-ai-chat-input" className="sr-only">
            Message Tara
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
            placeholder="Saan tayo? Ask Tara anything…"
            rows={1}
            disabled={isSubmitting || isUsagePending || (isLimitReached && isRegistered)}
            className="max-h-[140px] min-h-[40px] flex-1 resize-none overflow-y-auto bg-transparent py-2 text-[16px] leading-snug text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)] disabled:cursor-not-allowed"
          />
          <Button
            variant={isSubmitting ? 'ink' : 'tara'}
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
