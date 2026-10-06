import { useEffect, useRef, useState } from 'react'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { AssistantPanel } from '../components/assistant/AssistantPanel'
import { AssistantMap } from '../components/assistant/AssistantReply'
import { GuestAuthPrompt } from '../components/GuestAuthPrompt'
import InternalLink from '../components/InternalLink'
import { useAssistant } from '../hooks/useAssistant'
import { useAskAiViewportHeightSync } from '../hooks/useAskAiViewportHeightSync'
import type { AssistantMapBlock, AssistantPlaceCard, AssistantTurn } from '../utils/assistantCore'
import { replaceWithPath } from '../utils/navigation'
import '../design/assistant.css'

function latestPins(turns: AssistantTurn[]): { places: AssistantPlaceCard[]; map: AssistantMapBlock } | null {
  for (let index = turns.length - 1; index >= 0; index--) {
    const turn = turns[index]
    if (turn.role !== 'assistant') continue
    const places = turn.response?.places ?? turn.preview
    const map = turn.response?.map ?? turn.previewMap
    if (places.length > 0 && map) return { places, map }
  }
  return null
}

/** The map mode of the same assistant: the chat on one side, every pick as a numbered pin on the other. */
function AskAiMapPage() {
  useAskAiViewportHeightSync()
  const assistant = useAssistant('map')
  const { turns, send, isSessionLoading } = assistant
  const [guestPrompt, setGuestPrompt] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const askedRef = useRef(false)

  // /ask-ai/maps?q=... asks right away (links from search and old bookmarks).
  useEffect(() => {
    if (askedRef.current || isSessionLoading) return
    const question = new URLSearchParams(window.location.search).get('q')?.trim()
    askedRef.current = true
    if (!question) return
    replaceWithPath('/ask-ai/maps')
    void send(question)
  }, [isSessionLoading, send])

  // The newest answer with places drives the map, including its live preview while it streams.
  const latest = latestPins(turns)
  const selected = latest?.places.find((card) => card.slug === active) ?? null

  return (
    <div className="a-mappage">
      <GuestAuthPrompt variant="ask-ai" mode="modal" isOpen={guestPrompt} onClose={() => setGuestPrompt(false)} />
      <section className="a-mappage-map" aria-label="Map">
        <AssistantMap places={latest?.places ?? []} map={latest?.map ?? null} active={active} onSelect={setActive} className="a-full-map" />
        {latest ? (
          <p className="a-map-count">
            {latest.places.length} {latest.places.length === 1 ? 'pick' : 'picks'} · GalaTayo-verified
          </p>
        ) : null}
        {selected ? (
          <div className="a-pin-card" role="dialog" aria-label={selected.name}>
            <InternalLink href={selected.path} className="a-pin-card-link">
              {selected.imageUrl ? <img src={selected.imageUrl} alt="" /> : null}
              <span>
                <span className="a-card-title">
                  {selected.n}. {selected.name}
                </span>
                <span className="a-card-meta">
                  {[selected.area || selected.city, selected.budgetLabel].filter(Boolean).join(' · ')}
                </span>
              </span>
            </InternalLink>
            <button type="button" className="a-act" aria-label="Close" onClick={() => setActive(null)}>
              <X aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </section>
      <AssistantPanel assistant={assistant} mode="map" onGuestUpgrade={() => setGuestPrompt(true)} className="a-mappage-chat" />
    </div>
  )
}

export default AskAiMapPage
