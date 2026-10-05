import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { MapTrifold as MapIcon } from '@phosphor-icons/react/dist/csr/MapTrifold'
import { ChatCircle as MessageCircle } from '@phosphor-icons/react/dist/csr/ChatCircle'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { Page, Row } from '../components/ui'

const tools: Array<{ href: string; title: string; description: string; icon: PhosphorIcon }> = [
  { href: '/plan-with-ai', title: 'Plan with AI', description: 'One sentence in, a full-day draft out.', icon: Sparkles },
  { href: '/ask-ai/chatbot', title: 'Ask AI chat', description: 'Ask gala questions and get ideas.', icon: MessageCircle },
  { href: '/ask-ai/maps', title: 'AI map', description: 'Find places on a map, by vibe.', icon: MapIcon },
]

function AskAiOverviewPage() {
  return (
    <Page narrow>
      <span className="g-ai-badge">
        <Sparkles aria-hidden="true" />
        GalaTayo AI
      </span>
      <h1 className="g-h1 mt-2">How can AI help today?</h1>
      <p className="g-mut mt-2">Pick a tool. Lahat libre, may daily limit lang.</p>

      <div className="g-list mt-6">
        {tools.map(({ href, title, description, icon: Icon }) => (
          <Row key={href} href={href} action={<ChevronRight className="g-ic g-fnt" aria-hidden="true" />}>
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-2)] bg-[var(--fill)]">
                <Icon className="g-ic" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="g-h3 block">{title}</span>
                <span className="g-sm g-mut block">{description}</span>
              </span>
            </div>
          </Row>
        ))}
      </div>
    </Page>
  )
}

export default AskAiOverviewPage
