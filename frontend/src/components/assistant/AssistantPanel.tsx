import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp } from '@phosphor-icons/react/dist/csr/ArrowUp'
import { NotePencil } from '@phosphor-icons/react/dist/csr/NotePencil'
import { Square } from '@phosphor-icons/react/dist/csr/Square'
import { X } from '@phosphor-icons/react/dist/csr/X'
import AskAiUsagePill from '../AskAiUsagePill'
import AddToGalaPlanModal from '../AddToGalaPlanModal'
import InternalLink from '../InternalLink'
import { Button } from '../ui'
import { memorySummary, type AssistantChip, type AssistantMode, type AssistantResponse } from '../../utils/assistantCore'
import type { useAssistant } from '../../hooks/useAssistant'
import { AssistantReply, TaraAvatar } from './AssistantReply'

type AssistantApi = ReturnType<typeof useAssistant>

const STARTERS: Record<AssistantMode, Array<{ label: string; prompt: string }>> = {
  chat: [
    { label: 'Date in BGC, ₱1,500', prompt: 'Date in BGC, ₱1500 for two' },
    { label: 'Raining, where to go?', prompt: "Indoor activities, it's raining" },
    { label: 'Beach near Manila', prompt: 'Beach near Manila' },
    { label: 'First time in Manila', prompt: 'First time in Manila, 2 days. What should I do?' },
  ],
  map: [
    { label: 'Cafés in QC', prompt: 'Quiet cafes in QC' },
    { label: 'Museums in Manila', prompt: 'Museums in Manila' },
    { label: 'Where to eat in Tagaytay', prompt: 'Restaurants in Tagaytay with a view' },
    { label: 'Cheap day out in QC', prompt: 'Cheap day out in QC' },
  ],
}

export function AssistantPanel({
  assistant,
  mode,
  onClose,
  onShowMap,
  onGuestUpgrade,
  className = '',
}: {
  assistant: AssistantApi
  mode: AssistantMode
  onClose?: () => void
  onShowMap?: () => void
  onGuestUpgrade: () => void
  className?: string
}) {
  const { turns, memory, busy, usage, usageError, limitReached, isRegistered, send, stop, reset, retryUsage } = assistant
  const [draft, setDraft] = useState('')
  const [planFor, setPlanFor] = useState<{ id: string; name: string; slug: string } | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  const input = useRef<HTMLTextAreaElement | null>(null)
  const lastText = turns.at(-1)?.role === 'assistant' ? (turns.at(-1) as { text: string }).text : ''

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [turns.length, lastText])

  useLayoutEffect(() => {
    const element = input.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`
  }, [draft])

  const submit = (text: string) => {
    const message = text.trim()
    if (!message || busy) return
    if (limitReached) {
      if (!isRegistered) onGuestUpgrade()
      return
    }
    setDraft('')
    void send(message)
  }

  const onChip = (chip: AssistantChip, response: AssistantResponse) => {
    if (chip.kind === 'map') return onShowMap?.()
    if (chip.kind === 'add_to_plan') {
      const card = response.places.find((place) => place.slug === chip.prompt) ?? response.places[0]
      if (card) setPlanFor({ id: card.id, name: card.name, slug: card.slug })
      return
    }
    submit(chip.prompt)
  }

  const lastUser = [...turns].reverse().find((turn) => turn.role === 'user')
  const remembered = memorySummary(memory)

  return (
    <div className={`a-panel ${className}`}>
      <div className="a-head">
        <TaraAvatar />
        <div className="min-w-0 flex-1">
          <p className="g-h3 leading-tight">Tara</p>
          <AskAiUsagePill usageStatus={usage} />
        </div>
        <Button variant="soft" size="sm" onClick={reset} aria-label="New chat" disabled={turns.length === 0 && !busy}>
          <NotePencil aria-hidden="true" />
          New
        </Button>
        {onClose ? (
          <Button variant="soft" size="sm" iconOnly onClick={onClose} aria-label="Close chat">
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {remembered.length > 0 ? (
        <p className="a-memory" aria-label="Tara remembers">
          <span className="a-memory-k">Tara remembers</span>
          {remembered.map((item) => (
            <span key={item} className="a-memory-v">{item}</span>
          ))}
        </p>
      ) : null}

      <div ref={scroller} className="a-scroll">
        {usageError && turns.length === 0 ? (
          <div className="g-empty my-auto">
            <div className="g-h3">Tara is resting right now</div>
            <p className="g-sm g-mut">{usageError}</p>
            <Button variant="ink" size="sm" className="mt-4" onClick={retryUsage}>
              Try again
            </Button>
          </div>
        ) : turns.length === 0 ? (
          <div className="a-empty">
            <TaraAvatar large />
            <h2 className="g-h1 mt-4">{mode === 'map' ? "What are you looking for? I'll put it on the map!" : "Hi, I'm Tara! Where to?"}</h2>
            <p className="g-sm g-mut mt-1.5">Only GalaTayo-verified spots, with live weather. Ask in English or Filipino!</p>
            <div className="a-starters">
              {STARTERS[mode].map((starter) => (
                <button key={starter.label} type="button" className="a-chip" onClick={() => submit(starter.prompt)} disabled={busy || (limitReached && isRegistered)}>
                  {starter.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="a-thread">
            {turns.map((turn, index) =>
              turn.role === 'user' ? (
                <div key={turn.id} className="m-bubble-me">
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{turn.text}</p>
                </div>
              ) : (
                <AssistantReply
                  key={turn.id}
                  turn={turn}
                  isLatest={index === turns.length - 1}
                  showMap={mode === 'chat'}
                  busy={busy}
                  onChip={onChip}
                  onRetry={lastUser ? () => submit(lastUser.text) : undefined}
                />
              ),
            )}
          </div>
        )}
        {limitReached && !busy ? (
          <p className="a-limit" role="status">
            {isRegistered ? "That's all your AI chats for today. See you tomorrow!" : 'Free guest chats are used up for today.'}
            {!isRegistered ? (
              <button type="button" onClick={onGuestUpgrade}>
                Get more with a free account
              </button>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="a-compose">
        {!isRegistered && !limitReached ? (
          <p className="g-xs g-mut mb-2 px-1">
            Guest mode, a few chats a day.{' '}
            <button type="button" onClick={onGuestUpgrade} className="font-semibold text-[var(--ink)] underline underline-offset-2">
              Get more with a free account
            </button>
          </p>
        ) : null}
        <div className="a-box">
          <label htmlFor={`assistant-input-${mode}`} className="sr-only">
            Message Tara
          </label>
          <textarea
            id={`assistant-input-${mode}`}
            ref={input}
            value={draft}
            maxLength={500}
            rows={1}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit(draft)
              }
            }}
            placeholder={mode === 'map' ? 'e.g. date spots in Makati' : 'Where to? Ask Tara anything…'}
            disabled={limitReached && isRegistered}
          />
          <Button
            variant={busy ? 'ink' : 'tara'}
            iconOnly
            onClick={() => (busy ? stop() : submit(draft))}
            disabled={!busy && (!draft.trim() || (limitReached && isRegistered))}
            aria-label={busy ? 'Stop answer' : 'Send message'}
          >
            {busy ? <Square aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
          </Button>
        </div>
        <p className="a-fine mt-1.5 text-center">
          Tara is AI and can make mistakes. Check prices, hours and safety before you go.{' '}
          <InternalLink href="/disclaimer#ai" className="underline underline-offset-2">
            More
          </InternalLink>
        </p>
      </div>
      {planFor ? <AddToGalaPlanModal isOpen placeId={planFor.id} placeName={planFor.name} placeSlug={planFor.slug} onClose={() => setPlanFor(null)} /> : null}
    </div>
  )
}
