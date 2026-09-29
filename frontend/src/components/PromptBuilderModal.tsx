import { useEffect, useMemo, useRef, useState } from 'react'
import { AppIcon } from './AppIcon'
import MinimalBackNav from './navigation/MinimalBackNav'
import type { PromptBuilderFieldId, PromptBuilderState } from '../utils/promptBuilder'
import {
  buildPromptBuilderOutputs,
  createEmptyPromptBuilderState,
  getExternalAiLinks,
  getExternalSearchLinks,
  hasPromptBuilderInput,
  promptBuilderSections,
} from '../utils/promptBuilder'
import { navigateToPath } from '../utils/navigation'

type PromptBuilderModalProps = {
  isOpen: boolean
  initialState?: PromptBuilderState | null
  onClose: () => void
}

type CopyTarget = 'prompt' | 'keyword'

const primaryQuestionIds: PromptBuilderFieldId[] = ['plan', 'location', 'companion', 'vibe', 'budget']
const compactHelperText: Partial<Record<PromptBuilderFieldId, string>> = {
  plan: 'Not listed? Type your own.',
  location: 'Not listed? Type your own.',
  companion: 'Not listed? Type your own.',
  budget: 'Not listed? Type your own.',
}

function TrashIcon() {
  return <AppIcon name="trash" className="h-5 w-5" />
}

function GenerateIcon() {
  return <AppIcon name="promptBuilder" className="h-5 w-5" />
}

function CopyIcon() {
  return <AppIcon name="copy" className="h-5 w-5" />
}

function SearchIcon() {
  return <AppIcon name="search" className="h-5 w-5" />
}

function RefreshIcon() {
  return <AppIcon name="refresh" className="h-5 w-5" />
}

function SparkleIcon() {
  return <AppIcon name="askAi" className="h-5 w-5" />
}

function BotIcon() {
  return <AppIcon name="bot" className="h-5 w-5" />
}

function BackToHomeButton({ className = '' }: { className?: string }) {
  return <MinimalBackNav to="/" className={className} />
}

function getExternalLinkImageSrc(label: string) {
  switch (label) {
    case 'ChatGPT':
      return '/images/prompt-builder-icons/ChatGPT.webp'
    case 'Claude':
      return '/images/prompt-builder-icons/Claude.webp'
    case 'Gemini':
      return '/images/prompt-builder-icons/Gemini.webp'
    case 'Perplexity':
      return '/images/prompt-builder-icons/Perplexity.webp'
    case 'Facebook':
      return '/images/prompt-builder-icons/Facebook.webp'
    case 'TikTok':
      return '/images/prompt-builder-icons/Tiktok.webp'
    case 'Instagram':
      return '/images/prompt-builder-icons/Instagram.webp'
    case 'X':
      return '/images/prompt-builder-icons/X.webp'
    default:
      return ''
  }
}

function ExternalLinkBadge({ label }: { label: string }) {
  const imageSrc = getExternalLinkImageSrc(label)

  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt=""
        className="h-7 w-7 shrink-0 object-contain"
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.display = 'none'
        }}
      />
    )
  }

  return (
    <span className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[rgba(27,26,23,0.1)] bg-white">
      <span className="text-[9px] font-bold tracking-[0.04em] text-slate-500">
        {label.slice(0, 2).toUpperCase()}
      </span>
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
  const questionsPanelRef = useRef<HTMLDivElement | null>(null)
  const generationTimeoutRef = useRef<number | null>(null)
  const showClearAll = hasGeneratedPrompt || hasInput

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

    requestAnimationFrame(() => {
      const scrollContainer = questionsPanelRef.current?.closest('.overflow-y-auto') as HTMLElement | null
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        questionsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
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
      className="gala-page-background flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-builder-title"
    >
      <div
        ref={outputPanelRef}
        className="prompt-builder-shell mx-auto flex h-full min-h-0 w-full min-w-0 flex-col overflow-y-auto overscroll-contain px-3 pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] pt-3 sm:px-4 sm:pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] sm:pt-4 lg:px-8 lg:pt-6"
      >
        <div className="flex w-full justify-start">
          <BackToHomeButton />
        </div>

        {isGeneratingPrompt ? (
          <div className="mt-4 rounded-2xl border border-[rgba(27,26,23,0.08)] bg-white px-4 py-5 shadow-[0_8px_24px_rgba(27,26,23,0.03)] sm:px-5 sm:py-6">
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-40 rounded-full bg-slate-200" />
              <div className="h-4 w-64 rounded-full bg-slate-200" />
              <div className="grid gap-3">
                <div className="h-56 rounded-[16px] bg-slate-100" />
                <div className="h-56 rounded-[16px] bg-slate-100" />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="prompt-hero mt-1 flex flex-col items-center gap-2 overflow-visible text-center lg:mt-2 lg:flex-row lg:items-center lg:justify-start lg:gap-8 lg:text-left">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-3 lg:items-start">
                <div className="min-w-0 max-w-2xl lg:self-center">
                  <h1
                    id="prompt-builder-title"
                    className="text-[2rem] font-black tracking-[-0.05em] text-slate-950 sm:text-[2.5rem] lg:text-[2.15rem]"
                  >
                    Prompt ready <span className="inline-flex text-amber-400"><SparkleIcon /></span>
                  </h1>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-600 sm:text-[14px]">
                    Your stronger gala prompt is ready to copy and use anywhere.
                  </p>
                </div>
              </div>

            </div>

            <div className="prompt-result-layout mt-4 lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
              <section className="min-w-0 p-1 sm:p-0.5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(47,116,232,0.1)] text-[var(--accent-deep)]">
                    <CopyIcon />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[1rem] font-bold text-slate-950 sm:text-[1.1rem]">Copy-ready AI prompt</h2>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">Copy this prompt and use it in any AI app.</p>
                  </div>
                </div>

                <pre className="mt-3 max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-[14px] border border-[rgba(27,26,23,0.1)] bg-[linear-gradient(180deg,#fcfdff,#f7f9fc)] p-3 text-[13px] leading-relaxed text-slate-800 sm:text-[14px] lg:max-h-[240px]">
                  {aiPrompt}
                </pre>
                <button
                  type="button"
                  onClick={() => handleCopy('prompt', aiPrompt)}
                  disabled={!aiPrompt}
                  className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--accent)] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_10px_22px_rgba(47,116,232,0.22)] transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CopyIcon />
                  <span>{copiedTarget === 'prompt' ? 'Copied' : 'Copy full prompt'}</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[14px] border border-[rgba(27,26,23,0.08)] bg-slate-100 px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  <BotIcon />
                  <span>Back to GalaTayo AI</span>
                </button>
              </section>

              <div
                aria-hidden="true"
                className="my-4 h-px w-full bg-[rgba(27,26,23,0.08)] lg:hidden"
              />

              <aside className="prompt-preview-panel">
                <div className="preview-card p-1 sm:p-0.5">
                  <section>
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(var(--accent-rgb),0.1)] text-[var(--accent)]">
                        <RefreshIcon />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-[1rem] font-bold text-slate-950 sm:text-[1.1rem]">Search again in GalaTayo</h2>
                        <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">
                          Use your refined prompt to find better matching places.
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-[14px] border border-[rgba(27,26,23,0.1)] bg-[linear-gradient(180deg,#fbfdff,#f7fbff)] px-3 py-3 text-[13px] leading-relaxed text-slate-800 sm:text-[14px]">
                      {galaTayoSearchPhrase}
                    </div>

                    <button
                      type="button"
                      onClick={handleSearchInGalaTayo}
                      className="mt-3 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--accent)] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)] transition hover:bg-[var(--accent-deep)]"
                    >
                      <SearchIcon />
                      <span>Search in GalaTayo</span>
                    </button>
                  </section>

                  <div className="my-4 border-t border-[rgba(27,26,23,0.08)]" />

                  <section>
                    <h3 className="text-[0.96rem] font-bold text-slate-950">Use this in another AI</h3>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">
                      Copy the prompt first, then paste it into your app.
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {aiLinks.map((link) => (
                        <a
                          key={link.label}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${link.label} in a new tab`}
                          className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[rgba(27,26,23,0.1)] bg-white px-2.5 py-2.5 text-[12px] font-medium text-slate-900 transition hover:border-[rgba(27,26,23,0.22)] hover:bg-slate-50"
                        >
                          <ExternalLinkBadge label={link.label} />
                          <span>{link.label}</span>
                        </a>
                      ))}
                    </div>
                  </section>

                  <div className="my-4 border-t border-[rgba(27,26,23,0.08)]" />

                  <section>
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(168,85,247,0.1)] text-[rgb(147,51,234)]">
                        <SearchIcon />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-[1rem] font-bold text-slate-950 sm:text-[1.1rem]">Short search keyword</h2>
                        <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">Use for videos, posts, and reviews.</p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-[14px] border border-[rgba(168,85,247,0.16)] bg-[rgba(168,85,247,0.06)] px-3 py-3 text-[13px] leading-relaxed text-slate-800 sm:text-[14px]">
                      {searchKeyword}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy('keyword', searchKeyword)}
                      disabled={!searchKeyword}
                      className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[14px] border border-[rgb(168,85,247)] bg-white px-4 py-2.5 text-[13px] font-semibold text-[rgb(147,51,234)] transition hover:bg-[rgba(168,85,247,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CopyIcon />
                      <span>{copiedTarget === 'keyword' ? 'Copied' : 'Copy keyword'}</span>
                    </button>

                    <h3 className="mt-4 text-[0.96rem] font-bold text-slate-950">Search manually</h3>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">
                      Use the keyword across your social apps.
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {searchLinks.map((link) => (
                        <a
                          key={link.label}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${link.label} in a new tab`}
                          className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[rgba(27,26,23,0.1)] bg-white px-2.5 py-2.5 text-[12px] font-medium text-slate-900 transition hover:border-[rgba(27,26,23,0.22)] hover:bg-slate-50"
                        >
                          <ExternalLinkBadge label={link.label} />
                          <span>{link.label}</span>
                        </a>
                      ))}
                    </div>
                  </section>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-transparent px-3 py-2.5 text-[13px] font-semibold text-[var(--accent)] transition hover:bg-[rgba(47,116,232,0.06)]"
                    >
                      <RefreshIcon />
                      <span>Start over</span>
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </section>
  ) : (
    <section
      className="gala-page-background flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-builder-title"
    >
      <div
        ref={questionsPanelRef}
        className="prompt-builder-shell mx-auto flex h-full min-h-0 w-full min-w-0 flex-col overflow-y-auto overscroll-contain px-3 pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] pt-3 sm:px-4 sm:pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] sm:pt-4 lg:px-8 lg:pt-6"
      >
        <div className="flex w-full justify-start">
          <BackToHomeButton />
        </div>

        <div className="prompt-hero lg:mt-2 lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-3 text-center lg:text-left">
            <div className="mt-0 flex flex-col items-center gap-2 px-1 text-center sm:px-2 lg:items-start lg:text-left lg:px-0">
              <div className="min-w-0">
                <h1 id="prompt-builder-title" className="text-[1.45rem] font-black tracking-[-0.05em] text-slate-950 sm:text-[1.8rem] lg:text-[2rem]">
                  Prompt Builder
                </h1>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-600 sm:text-[13px] lg:text-[14px]">
                  Build a stronger gala prompt without using GalaTayo AI credits.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="prompt-builder-layout mt-4 sm:mt-5 lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
          <div className="prompt-steps flex flex-col">
            {questionSections.map((section, index) => (
              <section
                key={section.id}
                className="prompt-step-card min-w-0 rounded-2xl border border-[rgba(27,26,23,0.1)] bg-white p-3 shadow-[0_8px_22px_rgba(27,26,23,0.03)] sm:p-4 lg:p-5"
              >
                <div className="step-header flex min-w-0 items-center justify-between gap-2.5">
                  <div className="step-title-group flex min-w-0 items-center gap-2.5">
                    <span className="step-number inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[rgba(27,26,23,0.12)] bg-slate-50 text-[13px] font-bold text-slate-900 sm:h-8 sm:w-8 sm:text-[14px] lg:h-9 lg:w-9 lg:text-[15px]">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-[1rem] font-black tracking-[-0.03em] text-slate-950 sm:text-[1.1rem] lg:text-[1.15rem]">
                        {section.title}
                      </h2>
                    </div>
                  </div>

                </div>

                <div className="mt-2.5 flex min-w-0 flex-wrap gap-1.5 lg:gap-2">
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
                        className={`prompt-chip max-w-full rounded-[999px] border px-2.5 py-1 text-[11px] transition sm:px-3 sm:text-[12px] lg:px-3.5 lg:py-1.5 lg:text-[13px] ${
                          isSelected
                            ? 'selected border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                            : 'border-[rgba(27,26,23,0.12)] bg-white text-slate-700 hover:border-slate-400'
                        }`}
                      >
                        <span className="block max-w-full truncate">{chip}</span>
                      </button>
                    )
                  })}

                  <span className="inline-flex max-w-full rounded-[999px] border border-dashed border-[rgba(27,26,23,0.12)] px-2.5 py-1 text-[11px] text-slate-400 sm:px-3 sm:text-[12px] lg:px-3.5 lg:py-1.5 lg:text-[13px]">
                    <span className="block max-w-full truncate">{`${section.customLabel}...`}</span>
                  </span>
                </div>

                <p className="mt-2 text-[11px] leading-relaxed text-slate-500 sm:text-[12px] lg:text-[13px]">
                  {compactHelperText[section.id] ?? section.helperText}
                </p>

                <input
                  id={`prompt-builder-${section.id}`}
                  value={state.custom[section.id]}
                  onChange={(event) => handleCustomChange(section.id, event.target.value)}
                  placeholder={section.placeholder}
                  className="prompt-custom-input mt-2 block min-h-[38px] w-full min-w-0 max-w-full rounded-xl border border-[rgba(27,26,23,0.12)] bg-[rgba(248,250,252,0.9)] px-3 py-2 text-[13px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200 sm:text-[14px] lg:min-h-[44px] lg:text-[15px]"
                />
              </section>
            ))}

            <div className="mx-auto mt-4 grid w-full max-w-[560px] grid-cols-1 gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:mt-5">
              <button
                type="button"
                onClick={handleReset}
                disabled={!showClearAll || isGeneratingPrompt}
                className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-full border border-[rgba(27,26,23,0.12)] bg-white px-4 py-2 text-[0.84rem] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(27,26,23,0.04)] transition hover:border-[rgba(27,26,23,0.2)] hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-[rgba(27,26,23,0.08)] disabled:bg-slate-50 disabled:text-slate-400 lg:min-h-[44px] lg:text-[0.88rem]"
              >
                <TrashIcon />
                <span>Clear all</span>
              </button>

              <button
                type="button"
                onClick={handleGeneratePrompt}
                disabled={isGeneratingPrompt || !hasInput}
                className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-full bg-[var(--accent-deep)] px-4 py-2 text-[0.86rem] font-semibold tracking-[-0.01em] text-white shadow-[0_8px_18px_rgba(23,45,107,0.22)] transition hover:bg-[#0f1f4d] disabled:cursor-not-allowed disabled:bg-slate-500 lg:min-h-[44px] lg:text-[0.9rem]"
              >
                <GenerateIcon />
                <span>{isGeneratingPrompt ? 'Generating...' : 'Generate'}</span>
              </button>
            </div>
          </div>

          <aside className="hidden lg:flex lg:flex-col lg:gap-4 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-2xl border border-[rgba(27,26,23,0.08)] bg-white p-5 shadow-[0_8px_22px_rgba(27,26,23,0.03)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(47,116,232,0.1)] text-[var(--accent-deep)]">
                  <SparkleIcon />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[0.95rem] font-bold text-slate-950">Quick tips</h3>
                  <p className="text-[12px] text-slate-500">Get better results</p>
                </div>
              </div>
              <ul className="mt-4 space-y-3 text-[13px] leading-relaxed text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  <span>Fill in at least 2-3 fields for stronger prompts.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  <span>Use specific locations for better place matches.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  <span>Select your companion type for vibe-matched spots.</span>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
