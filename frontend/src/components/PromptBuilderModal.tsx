import { useEffect, useMemo, useRef, useState } from 'react'
import type { PromptBuilderFieldId, PromptBuilderState } from '../types/promptBuilder'
import {
  buildPromptBuilderOutputs,
  createEmptyPromptBuilderState,
  getExternalAiLinks,
  getExternalSearchLinks,
  hasPromptBuilderInput,
  promptBuilderSections,
} from '../utils/promptBuilder'
import { navigateToPath } from '../utils/navigation'
import promptBuilderOutputChibi from '../assets/chibis/features/prompt-builder/chibi-prompt-builder-output.webp'
import promptBuilderQuestionsChibi from '../assets/chibis/features/prompt-builder/chibi-prompt-builder-questions.webp'

type PromptBuilderModalProps = {
  isOpen: boolean
  initialState?: PromptBuilderState | null
  onClose: () => void
}

type CopyTarget = 'prompt' | 'keyword'

const primaryQuestionIds: PromptBuilderFieldId[] = ['plan', 'location', 'companion', 'vibe', 'budget']

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M19 12H5m0 0 6-6m-6 6 6 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="m6 9 6 6 6-6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M4 7h16m-10 4v5m4-5v5M9 4h6l1 2H8l1-2Zm1 16h4c2.1 0 3.15 0 3.8-.66.66-.65.66-1.7.66-3.8V7H5v8.54c0 2.1 0 3.15.66 3.8.65.66 1.7.66 3.8.66Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  )
}

function GenerateIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M12 3c.26 1.91.86 3.33 1.82 4.28.95.96 2.38 1.56 4.28 1.82-1.9.26-3.33.86-4.28 1.82-.96.95-1.56 2.37-1.82 4.28-.26-1.91-.86-3.33-1.82-4.28-.95-.96-2.38-1.56-4.28-1.82 1.9-.26 3.33-.86 4.28-1.82C11.14 6.33 11.74 4.91 12 3Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M18.5 14.5c.13.94.43 1.64.9 2.11.46.47 1.17.77 2.1.9-.93.13-1.64.43-2.1.9-.47.46-.77 1.17-.9 2.1-.13-.93-.43-1.64-.9-2.1-.47-.47-1.17-.77-2.1-.9.93-.13 1.63-.43 2.1-.9.47-.47.77-1.17.9-2.11Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <rect x="9" y="9" width="10" height="10" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M20 12a8 8 0 1 1-2.3-5.7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path d="M20 4v5h-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M12 3c.2 2.1.8 3.7 1.9 4.8 1.1 1.1 2.7 1.7 4.8 1.9-2.1.2-3.7.8-4.8 1.9-1.1 1.1-1.7 2.7-1.9 4.8-.2-2.1-.8-3.7-1.9-4.8-1.1-1.1-2.7-1.7-4.8-1.9 2.1-.2 3.7-.8 4.8-1.9C11.2 6.7 11.8 5.1 12 3Z"
        fill="currentColor"
      />
    </svg>
  )
}

function LogoPlaceholder() {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[rgba(15,23,42,0.12)] bg-[linear-gradient(180deg,#ffffff,#f4f7fb)] text-[10px] font-bold tracking-[0.08em] text-slate-400">
      Logo
    </span>
  )
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

function toggleFieldValue(
  state: PromptBuilderState,
  fieldId: PromptBuilderFieldId,
  value: string,
  multiSelect: boolean
): PromptBuilderState {
  const currentValues = state[fieldId]
  const isSelected = currentValues.includes(value)
  const nextValues = multiSelect
    ? isSelected
      ? currentValues.filter((currentValue) => currentValue !== value)
      : [...currentValues, value]
    : isSelected
      ? []
      : [value]

  return { ...state, [fieldId]: nextValues }
}

export default function PromptBuilderModal({
  isOpen,
  initialState,
  onClose,
}: PromptBuilderModalProps) {
  const [state, setState] = useState<PromptBuilderState>(() => initialState ?? createEmptyPromptBuilderState())
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null)
  const [hasGeneratedPrompt, setHasGeneratedPrompt] = useState(false)
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const outputs = useMemo(() => buildPromptBuilderOutputs(state), [state])
  const hasInput = hasPromptBuilderInput(state)
  const aiPrompt = hasInput ? outputs.aiPrompt : ''
  const searchKeyword = hasInput ? outputs.searchKeyword : ''
  const galaTayoSearchPhrase = hasInput ? outputs.galaTayoSearchPhrase : ''
  const aiLinks = useMemo(() => getExternalAiLinks(), [])
  const searchLinks = useMemo(() => getExternalSearchLinks(searchKeyword), [searchKeyword])
  const outputPanelRef = useRef<HTMLDivElement | null>(null)
  const generationTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setState(initialState ?? createEmptyPromptBuilderState())
    setCopiedTarget(null)
    setHasGeneratedPrompt(false)
    setIsGeneratingPrompt(false)
  }, [initialState, isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (!copiedTarget) {
      return
    }

    const timeoutId = window.setTimeout(() => setCopiedTarget(null), 1800)
    return () => window.clearTimeout(timeoutId)
  }, [copiedTarget])

  useEffect(() => {
    return () => {
      if (generationTimeoutRef.current !== null) {
        window.clearTimeout(generationTimeoutRef.current)
      }
    }
  }, [])

  if (!isOpen) {
    return null
  }

  const handleCustomChange = (fieldId: PromptBuilderFieldId, value: string) => {
    setState((currentState) => ({
      ...currentState,
      custom: {
        ...currentState.custom,
        [fieldId]: value,
      },
    }))
  }

  const handleCopy = async (target: CopyTarget, text: string) => {
    if (!text.trim()) {
      return
    }

    await copyText(text)
    setCopiedTarget(target)
  }

  const handleReset = () => {
    setState(createEmptyPromptBuilderState())
    setCopiedTarget(null)
    setHasGeneratedPrompt(false)
    setIsGeneratingPrompt(false)

    if (generationTimeoutRef.current !== null) {
      window.clearTimeout(generationTimeoutRef.current)
      generationTimeoutRef.current = null
    }
  }

  const handleGeneratePrompt = () => {
    if (!hasGeneratedPrompt && !isGeneratingPrompt) {
      setIsGeneratingPrompt(true)

      generationTimeoutRef.current = window.setTimeout(() => {
        setHasGeneratedPrompt(true)
        setIsGeneratingPrompt(false)
        generationTimeoutRef.current = null
        outputPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 650)

      return
    }

    outputPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleSearchInGalaTayo = () => {
    onClose()
    navigateToPath('/search')
  }

  const questionSections = promptBuilderSections.filter((section) => primaryQuestionIds.includes(section.id))

  return hasGeneratedPrompt || isGeneratingPrompt ? (
    <section
      className="min-h-screen overflow-y-auto bg-[linear-gradient(180deg,#f8fbff,#edf4ff)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-builder-title"
    >
      <div ref={outputPanelRef} className="min-w-0 px-4 py-4 sm:px-5 sm:py-5 lg:px-6">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 text-[14px] font-medium text-slate-900 transition hover:text-slate-700 sm:text-[15px]"
        >
          <BackArrowIcon />
          <span>Back</span>
        </button>

        {isGeneratingPrompt ? (
          <div className="mt-6 rounded-[22px] border border-[rgba(15,23,42,0.12)] bg-white px-4 py-6 shadow-[0_8px_24px_rgba(15,23,42,0.03)] sm:px-6 sm:py-8">
            <div className="animate-pulse space-y-4">
              <div className="h-8 w-56 rounded-full bg-slate-200" />
              <div className="h-5 w-80 rounded-full bg-slate-200" />
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="h-72 rounded-[20px] bg-slate-100" />
                <div className="h-72 rounded-[20px] bg-slate-100" />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 max-w-2xl">
                <h1
                  id="prompt-builder-title"
                  className="text-[2.8rem] font-black tracking-[-0.06em] text-slate-950 sm:text-[3.6rem]"
                >
                  Prompt ready <span className="inline-flex text-amber-400"><SparkleIcon /></span>
                </h1>
                <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-slate-600 sm:text-[17px]">
                  Your stronger gala prompt is ready to copy and use anywhere.
                </p>
              </div>

              <div className="flex shrink-0 items-center justify-center self-center lg:self-end lg:pr-2">
                <img
                  src={promptBuilderOutputChibi}
                  alt=""
                  className="h-60 w-60 object-contain sm:h-72 sm:w-72 lg:h-[30rem] lg:w-[30rem]"
                  loading="lazy"
                />
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              <section className="min-w-0 rounded-[28px] border border-[rgba(15,23,42,0.10)] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgba(47,116,232,0.12)] text-[var(--accent-deep)]">
                    <CopyIcon />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[1.15rem] font-bold text-slate-950 sm:text-[1.3rem]">Copy-ready AI prompt</h2>
                    <p className="mt-1 text-[14px] leading-relaxed text-slate-600">Copy this prompt and use it in any AI app.</p>
                  </div>
                </div>

                <pre className="mt-4 max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-[16px] border border-[rgba(15,23,42,0.16)] bg-[linear-gradient(180deg,#fbfdff,#f6f9ff)] p-4 text-[15px] leading-relaxed text-slate-800 sm:p-5 sm:text-[16px]">
                  {aiPrompt}
                </pre>
                <button
                  type="button"
                  onClick={() => handleCopy('prompt', aiPrompt)}
                  disabled={!aiPrompt}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[16px] bg-[var(--accent)] px-4 py-3 text-[15px] font-semibold text-white shadow-[0_10px_24px_rgba(47,116,232,0.24)] transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CopyIcon />
                  <span>{copiedTarget === 'prompt' ? 'Copied' : 'Copy full prompt'}</span>
                </button>

                <div className="my-5 border-t border-[rgba(15,23,42,0.10)]" />

                <h3 className="text-[1.05rem] font-bold text-slate-950">Use this in another AI:</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-slate-600">
                  Copy the prompt first, then paste it into your app.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {aiLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${link.label} in a new tab`}
                      className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-[rgba(15,23,42,0.16)] bg-white px-3 py-3 text-[13px] font-medium text-slate-900 transition hover:border-[rgba(15,23,42,0.28)] hover:bg-slate-50"
                    >
                      <LogoPlaceholder />
                      <span>{link.label}</span>
                    </a>
                  ))}
                </div>
              </section>

              <section className="min-w-0 rounded-[28px] border border-[rgba(15,23,42,0.10)] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgba(168,85,247,0.12)] text-[rgb(147,51,234)]">
                    <SearchIcon />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[1.15rem] font-bold text-slate-950 sm:text-[1.3rem]">Short search keyword</h2>
                    <p className="mt-1 text-[14px] leading-relaxed text-slate-600">Use for maps, videos, posts, and reviews.</p>
                  </div>
                </div>

                <div className="mt-4 rounded-[16px] border border-[rgba(168,85,247,0.20)] bg-[rgba(168,85,247,0.08)] px-4 py-4 text-[15px] leading-relaxed text-slate-800 sm:text-[16px]">
                  {searchKeyword}
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy('keyword', searchKeyword)}
                  disabled={!searchKeyword}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[16px] border border-[rgb(168,85,247)] bg-white px-4 py-3 text-[14px] font-semibold text-[rgb(147,51,234)] transition hover:bg-[rgba(168,85,247,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CopyIcon />
                  <span>{copiedTarget === 'keyword' ? 'Copied' : 'Copy keyword'}</span>
                </button>

                <div className="my-5 border-t border-[rgba(15,23,42,0.10)]" />

                <h3 className="text-[1.05rem] font-bold text-slate-950">Search manually:</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-slate-600">
                  Use the keyword for maps, videos, posts, and reviews.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {searchLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${link.label} in a new tab`}
                      className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-[rgba(15,23,42,0.16)] bg-white px-3 py-3 text-[13px] font-medium text-slate-900 transition hover:border-[rgba(15,23,42,0.28)] hover:bg-slate-50"
                    >
                      <LogoPlaceholder />
                      <span>{link.label}</span>
                    </a>
                  ))}
                </div>
              </section>
            </div>

            <section className="mt-4 rounded-[28px] border border-[rgba(15,23,42,0.10)] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgba(16,185,129,0.12)] text-[rgb(16,185,129)]">
                    <RefreshIcon />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[1.15rem] font-bold text-slate-950 sm:text-[1.3rem]">Search again in GalaTayo</h2>
                    <p className="mt-1 text-[14px] leading-relaxed text-slate-600">
                      Use your refined prompt to find better matching places.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSearchInGalaTayo}
                  className="inline-flex items-center justify-center gap-2 rounded-[16px] bg-[rgb(16,185,129)] px-5 py-4 text-[15px] font-semibold text-white shadow-[0_10px_24px_rgba(16,185,129,0.24)] transition hover:bg-[rgb(5,150,105)]"
                >
                  <SearchIcon />
                  <span>Search in GalaTayo</span>
                </button>
              </div>

              <div className="mt-4 rounded-[16px] border border-[rgba(15,23,42,0.14)] bg-[linear-gradient(180deg,#fbfdff,#f7fbff)] px-4 py-4 text-[15px] leading-relaxed text-slate-800 sm:text-[16px]">
                {galaTayoSearchPhrase}
              </div>

              <button
                type="button"
                onClick={() => handleCopy('keyword', galaTayoSearchPhrase)}
                disabled={!galaTayoSearchPhrase}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[16px] border border-[rgba(15,23,42,0.16)] bg-white px-4 py-3 text-[14px] font-medium text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CopyIcon />
                <span>Copy refined search</span>
              </button>
            </section>

            <button
              type="button"
              onClick={handleReset}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[16px] bg-transparent px-4 py-3 text-[15px] font-semibold text-[var(--accent)] transition hover:bg-[rgba(47,116,232,0.06)]"
            >
              <RefreshIcon />
              <span>Start over</span>
            </button>
          </>
        )}
      </div>
    </section>
  ) : (
    <section
      className="min-h-screen overflow-y-auto bg-[linear-gradient(180deg,#f8fbff,#edf4ff)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-builder-title"
    >
      <div className="min-w-0 px-3 py-3 sm:px-5 sm:py-5 lg:px-8">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 text-[14px] font-medium text-slate-900 transition hover:text-slate-700 sm:text-[15px]"
        >
          <BackArrowIcon />
          <span>Back</span>
        </button>

        <header className="mt-4 min-w-0 rounded-[20px] border border-[rgba(15,23,42,0.12)] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.03)] sm:px-5 sm:py-5">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 id="prompt-builder-title" className="text-[1.75rem] font-black tracking-[-0.05em] text-slate-950 sm:text-[2.35rem]">
                Prompt Builder
              </h1>
              <p className="mt-2 max-w-[430px] text-[14px] leading-relaxed text-slate-600 sm:text-[15px]">
                Build a stronger gala prompt without using Ask AI credits.
              </p>
            </div>

            <div className="relative hidden shrink-0 sm:block">
              <img
                src={promptBuilderQuestionsChibi}
                alt=""
                className="h-24 w-24 object-contain"
                loading="lazy"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3 rounded-[16px] border border-[rgba(15,23,42,0.1)] bg-slate-50 px-3 py-2.5 sm:hidden">
            <img
              src={promptBuilderQuestionsChibi}
              alt=""
              className="h-12 w-12 shrink-0 object-contain"
              loading="lazy"
            />
            <p className="text-[12px] leading-relaxed text-slate-600">
              Pick a few quick details and GalaTayo will turn them into a ready-to-use prompt.
            </p>
          </div>
        </header>

        <div className="mt-5 grid gap-3.5 sm:mt-6 sm:gap-4">
          {questionSections.map((section, index) => (
            <section
              key={section.id}
              className="min-w-0 rounded-[20px] border border-[rgba(15,23,42,0.14)] bg-white p-3.5 shadow-[0_6px_18px_rgba(15,23,42,0.025)] sm:p-4"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[rgba(15,23,42,0.18)] bg-slate-50 text-[15px] font-bold text-slate-900 sm:h-9 sm:w-9 sm:text-base">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[1.08rem] font-black tracking-[-0.04em] text-slate-950 sm:text-[1.35rem]">
                      {section.title}
                    </h2>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 text-[12px] text-slate-500 sm:text-[14px]">
                  <span>(Optional)</span>
                  <ChevronDownIcon />
                </div>
              </div>

              <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                {section.chips.map((chip) => {
                  const isSelected = state[section.id].includes(chip)

                  return (
                    <button
                      key={chip}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() =>
                        setState((currentState) =>
                          toggleFieldValue(currentState, section.id, chip, section.multiSelect)
                        )
                      }
                      className={`max-w-full rounded-[15px] border px-3 py-1.5 text-[12px] text-slate-900 transition sm:px-3.5 sm:py-1.5 sm:text-[13px] ${
                        isSelected
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-[rgba(15,23,42,0.14)] bg-white hover:border-slate-900'
                      }`}
                    >
                      <span className="block max-w-full truncate">{chip}</span>
                    </button>
                  )
                })}

                <span className="inline-flex max-w-full rounded-[15px] border border-dashed border-[rgba(15,23,42,0.14)] px-3 py-1.5 text-[12px] text-slate-400 sm:px-3.5 sm:text-[13px]">
                  <span className="block max-w-full truncate">{`${section.customLabel}...`}</span>
                </span>
              </div>

              <p className="mt-3 text-[12px] leading-relaxed text-slate-600 sm:text-[13px]">{section.helperText}</p>

              <input
                id={`prompt-builder-${section.id}`}
                value={state.custom[section.id]}
                onChange={(event) => handleCustomChange(section.id, event.target.value)}
                placeholder={section.placeholder}
                className="mt-3 block w-full min-w-0 max-w-full rounded-[14px] border border-[rgba(15,23,42,0.16)] bg-white px-3.5 py-2.5 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </section>
          ))}
        </div>

        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex min-w-[108px] items-center justify-center gap-2 rounded-[14px] border border-[rgba(15,23,42,0.14)] bg-white px-3.5 py-2 text-[13px] font-medium text-slate-900 transition hover:bg-slate-50"
          >
            <TrashIcon />
            <span>Clear all</span>
          </button>
          <button
            type="button"
            onClick={handleGeneratePrompt}
            disabled={isGeneratingPrompt}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-[14px] bg-slate-800 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-500"
          >
            {isGeneratingPrompt ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
            ) : (
              <GenerateIcon />
            )}
            <span>{isGeneratingPrompt ? 'Generating...' : 'Generate prompt'}</span>
          </button>
        </div>
      </div>
    </section>
  )
}
