import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowUp } from '@phosphor-icons/react/dist/csr/ArrowUp'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { Button, cx } from '../ui'
import { navigateToPath } from '../../utils/navigation'

const fallbackPrompt = 'Date night in BGC, ₱2,000'

// One line of 16px / 1.4 text; anything taller means the prompt wrapped.
const LINE_HEIGHT = 22

function planWithAi(text: string) {
  navigateToPath(`/plan-with-ai?q=${encodeURIComponent(text)}`)
}

/** Mist pill that opens into a 3-line box while typing. */
function PlanWithAiCard() {
  const [prompt, setPrompt] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isWrapped, setIsWrapped] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const text = prompt.trim()
  const isOpen = isFocused || isWrapped

  const measure = () => {
    const el = textareaRef.current
    if (!el) return
    const rows = el.rows
    el.rows = 1
    const style = getComputedStyle(el)
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    setIsWrapped(el.scrollHeight - padding > LINE_HEIGHT * 1.5)
    el.rows = rows
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    planWithAi(text || fallbackPrompt)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      planWithAi(text || fallbackPrompt)
    }
  }

  return (
    <section aria-label="Plan with Tara AI" className="md:max-w-[640px]">
      <form
        onSubmit={handleSubmit}
        className={cx(
          'flex gap-3 border pl-4 pr-1.5 transition-[border-radius] duration-200',
          isOpen ? 'items-end rounded-[var(--r-4)] border-[var(--ink)] bg-[var(--surface)] py-1.5' : 'h-[52px] items-center rounded-full border-transparent bg-[var(--fill)]',
        )}
      >
        <Sparkles aria-hidden="true" className={cx('h-[18px] w-[18px] shrink-0 text-[var(--ink-2)]', isOpen && 'mt-2.5 self-start')} />
        <label htmlFor="home-plan-with-ai" className="sr-only">
          Describe your gala
        </label>
        <textarea
          id="home-plan-with-ai"
          ref={textareaRef}
          rows={isOpen ? 3 : 1}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value)
            measure()
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false)
            measure()
          }}
          onKeyDown={handleKeyDown}
          placeholder="Plan a gala…"
          className={cx(
            'min-w-0 flex-1 resize-none border-0 bg-transparent text-[16px] leading-[22px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)] focus:shadow-none focus-visible:outline-none',
            isOpen ? 'py-2' : 'h-[22px] overflow-hidden',
          )}
        />
        <Button type="submit" variant="tara" size="sm" iconOnly className="!h-10 !w-10 shrink-0" aria-label="Build my plan">
          <ArrowUp />
        </Button>
      </form>
    </section>
  )
}

export default PlanWithAiCard
