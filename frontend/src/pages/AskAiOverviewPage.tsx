import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { MapTrifold as MapIcon } from '@phosphor-icons/react/dist/csr/MapTrifold'
import { ChatCircleDots } from '@phosphor-icons/react/dist/csr/ChatCircleDots'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import InternalLink from '../components/InternalLink'
import { TaraAvatar } from '../components/home/ask-ai/AskAiComponents'
import { Page } from '../components/ui'

const tools: Array<{ href: string; title: string; description: string; icon: PhosphorIcon; tint: 'tara' | 'sea' | 'warn' }> = [
  { href: '/plan-with-ai', title: 'Plan with AI', description: 'One sentence in, a full-day draft out.', icon: Sparkles, tint: 'tara' },
  { href: '/ask-ai/chatbot', title: 'Chat with Tara', description: 'Ask gala questions and get ideas.', icon: ChatCircleDots, tint: 'sea' },
  { href: '/ask-ai/maps', title: 'Ask the map', description: 'Find places on a map, by vibe.', icon: MapIcon, tint: 'warn' },
]

function AskAiOverviewPage() {
  return (
    <Page narrow>
      <div className="m-art-head">
        <TaraAvatar large />
        <h1 className="g-h1 mt-4">Hi, I&apos;m Tara. How can I help?</h1>
        <p className="g-mut mt-2">Pick a tool. Lahat libre, may daily limit lang.</p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {tools.map(({ href, title, description, icon: Icon, tint }) => (
          <InternalLink key={href} href={href} className="m-ctile">
            <span className="flex items-start justify-between">
              <span className="m-ctile-ic" data-tint={tint} aria-hidden="true">
                <Icon weight="light" />
              </span>
              <ChevronRight className="g-ic g-fnt" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="g-h3 block">{title}</span>
              <span className="g-sm g-mut mt-0.5 block">{description}</span>
            </span>
          </InternalLink>
        ))}
      </div>
    </Page>
  )
}

export default AskAiOverviewPage
