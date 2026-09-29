import { useState, type FormEvent } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRight, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons'
import { navigateToPath } from '../../utils/navigation'

const examplePrompt = 'Date sa BGC, ₱2k total, dinner tapos sine'

function PlanWithAiCard() {
  const [prompt, setPrompt] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const text = prompt.trim() || examplePrompt
    navigateToPath(`/plan-with-ai?q=${encodeURIComponent(text)}`)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[20px] bg-[var(--ink)] p-4 text-[var(--bg)] sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-data inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--primary)]">
          <FontAwesomeIcon icon={faWandMagicSparkles} className="h-3 w-3" />
          Plan with AI
        </span>
        <span className="text-[11px] opacity-60">One sentence → full day</span>
      </div>

      <label htmlFor="home-plan-with-ai" className="sr-only">
        Describe your gala
      </label>
      <div className="mt-3 flex items-center gap-2">
        <input
          id="home-plan-with-ai"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={`“${examplePrompt}…”`}
          className="font-display min-w-0 flex-1 bg-transparent text-[17px] italic text-[var(--bg)] outline-none placeholder:text-[var(--bg)] placeholder:opacity-55"
        />
        <button
          type="submit"
          aria-label="Build my gala plan"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-white transition-transform hover:scale-105 active:scale-95"
        >
          <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4" />
        </button>
      </div>
    </form>
  )
}

export default PlanWithAiCard
