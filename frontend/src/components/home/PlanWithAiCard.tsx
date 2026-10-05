import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowUp, MessageCircle, Sparkles } from 'lucide-react'
import { Button, Chip, Chips } from '../ui'
import { openFloatingChat } from '../../utils/floatingChat'
import { navigateToPath } from '../../utils/navigation'

const suggestions = [
  'Date night in BGC, ₱2,000',
  'Rainy day with the barkada',
  'Free museums in Manila',
]

function planWithAi(text: string) {
  navigateToPath(`/plan-with-ai?q=${encodeURIComponent(text)}`)
}

function PlanWithAiCard() {
  const [prompt, setPrompt] = useState('')
  const text = prompt.trim()

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    planWithAi(text || suggestions[0])
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      planWithAi(text || suggestions[0])
    }
  }

  return (
    <section aria-labelledby="home-ai-title">
      <form onSubmit={handleSubmit} className="g-ai">
        <div className="g-ai-badge" id="home-ai-title" style={{ color: 'var(--ink-2)' }}>
          <Sparkles />
          Plan with Tara AI
        </div>
        <label htmlFor="home-plan-with-ai" className="sr-only">
          Describe your gala
        </label>
        <textarea
          id="home-plan-with-ai"
          rows={2}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your gala… who, where, budget"
          className="mt-2"
        />
        <div className="g-ai-bar justify-between">
          <Button variant="text" size="sm" onClick={() => openFloatingChat(text)}>
            <MessageCircle />
            Or just ask Tara
          </Button>
          <Button type="submit" variant="tara" size="sm">
            Build my plan
            <ArrowUp />
          </Button>
        </div>
      </form>
      <Chips className="mt-3" aria-label="Try one of these">
        {suggestions.map((suggestion) => (
          <Chip key={suggestion} onClick={() => planWithAi(suggestion)}>
            {suggestion}
          </Chip>
        ))}
      </Chips>
    </section>
  )
}

export default PlanWithAiCard
