import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy } from '@phosphor-icons/react/dist/csr/Copy'
import { ArrowCounterClockwise as RotateCcw } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise'
import { MagnifyingGlass as Search } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { Trash as Trash2 } from '@phosphor-icons/react/dist/csr/Trash'
import MinimalBackNav from './navigation/MinimalBackNav'
import { Button, Chip, Panel, Skeleton, buttonClass } from './ui'
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

const externalLinkIcons: Record<string, string> = {
  ChatGPT: '/images/prompt-builder-icons/ChatGPT.webp',
  Claude: '/images/prompt-builder-icons/Claude.webp',
  Gemini: '/images/prompt-builder-icons/Gemini.webp',
  Perplexity: '/images/prompt-builder-icons/Perplexity.webp',
  Facebook: '/images/prompt-builder-icons/Facebook.webp',
  TikTok: '/images/prompt-builder-icons/Tiktok.webp',
  Instagram: '/images/prompt-builder-icons/Instagram.webp',
  X: '/images/prompt-builder-icons/X.webp',
}

const scrollerClass = 'mx-auto flex h-full min-h-0 w-full max-w-[1240px] flex-col overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px)+1.5rem)] lg:px-8 lg:pt-6 lg:pb-12'
const textBoxClass = 'g-sm mt-3 whitespace-pre-wrap break-words rounded-[var(--r-2)] bg-[var(--fill)] p-3 leading-relaxed'

function ExternalLinks({ links }: { links: Array<{ label: string; href: string }> }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {links.map((link) => (
        <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${link.label} in a new tab`} className={buttonClass({ variant: 'line', size: 'sm' })}>
          {externalLinkIcons[link.label] ? (
            <img
              src={externalLinkIcons[link.label]}
              alt=""
              className="h-5 w-5 object-contain"
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = 'none'
              }}
            />
          ) : null}
          {link.label}
        </a>
      ))}
    </div>
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

function toggleFieldValue(state: PromptBuilderState, fieldId: PromptBuilderFieldId, value: string, multiSelect: boolean): PromptBuilderState {
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

export default function PromptBuilderModal({ isOpen, initialState, onClose }: PromptBuilderModalProps) {
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
    if (!isOpen) return
    setState(initialState ?? createEmptyPromptBuilderState())
    setCopiedTarget(null)
    setHasGeneratedPrompt(false)
    setIsGeneratingPrompt(false)
  }, [initialState, isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!copiedTarget) return
    const timeoutId = window.setTimeout(() => setCopiedTarget(null), 1800)
    return () => window.clearTimeout(timeoutId)
  }, [copiedTarget])

  useEffect(() => {
    return () => {
      if (generationTimeoutRef.current !== null) window.clearTimeout(generationTimeoutRef.current)
    }
  }, [])

  if (!isOpen) return null

  const handleCustomChange = (fieldId: PromptBuilderFieldId, value: string) => {
    setState((currentState) => ({ ...currentState, custom: { ...currentState.custom, [fieldId]: value } }))
  }

  const handleCopy = async (target: CopyTarget, text: string) => {
    if (!text.trim()) return
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
      questionsPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
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

  if (hasGeneratedPrompt || isGeneratingPrompt) {
    return (
      <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="prompt-builder-title">
        <div ref={outputPanelRef} className={scrollerClass}>
          <MinimalBackNav to="/" />

          {isGeneratingPrompt ? (
            <div className="mt-6 grid gap-3" aria-live="polite">
              <span className="sr-only">Building your prompt…</span>
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <>
              <span className="g-ai-badge mt-4">
                <Sparkles aria-hidden="true" />
                Prompt builder
              </span>
              <h1 id="prompt-builder-title" className="g-h1 mt-2">
                Prompt ready
              </h1>
              <p className="g-mut mt-1">Your stronger gala prompt is ready to copy and use anywhere.</p>

              <div className="g-split mt-6">
                <Panel as="section" className="min-w-0">
                  <h2 className="g-h3">Copy-ready AI prompt</h2>
                  <p className="g-sm g-mut mt-0.5">Copy this prompt and use it in any AI app.</p>
                  <pre className={`${textBoxClass} max-h-[240px] overflow-auto font-[inherit]`}>{aiPrompt}</pre>
                  <div className="mt-3 grid gap-2">
                    <Button variant="ink" block onClick={() => void handleCopy('prompt', aiPrompt)} disabled={!aiPrompt}>
                      <Copy aria-hidden="true" />
                      {copiedTarget === 'prompt' ? 'Copied' : 'Copy full prompt'}
                    </Button>
                    <Button variant="soft" block onClick={onClose}>
                      <Sparkles aria-hidden="true" />
                      Back to GalaTayo AI
                    </Button>
                  </div>
                </Panel>

                <aside className="g-side">
                  <Panel>
                    <h2 className="g-h3">Search again in GalaTayo</h2>
                    <p className="g-sm g-mut mt-0.5">Use your refined prompt to find better matching places.</p>
                    <div className={textBoxClass}>{galaTayoSearchPhrase}</div>
                    <Button variant="line" block className="mt-3" onClick={handleSearchInGalaTayo}>
                      <Search aria-hidden="true" />
                      Search in GalaTayo
                    </Button>

                    <hr className="g-sep my-4" />
                    <h3 className="g-h3">Use this in another AI</h3>
                    <p className="g-sm g-mut mt-0.5">Copy the prompt first, then paste it into your app.</p>
                    <ExternalLinks links={aiLinks} />

                    <hr className="g-sep my-4" />
                    <h3 className="g-h3">Short search keyword</h3>
                    <p className="g-sm g-mut mt-0.5">Use for videos, posts, and reviews.</p>
                    <div className={textBoxClass}>{searchKeyword}</div>
                    <Button variant="line" block className="mt-3" onClick={() => void handleCopy('keyword', searchKeyword)} disabled={!searchKeyword}>
                      <Copy aria-hidden="true" />
                      {copiedTarget === 'keyword' ? 'Copied' : 'Copy keyword'}
                    </Button>

                    <h3 className="g-h3 mt-4">Search manually</h3>
                    <p className="g-sm g-mut mt-0.5">Use the keyword across your social apps.</p>
                    <ExternalLinks links={searchLinks} />
                    <p className="g-xs g-fnt mt-2">These names and logos belong to their owners. GalaTayo is not affiliated with them.</p>

                    <Button variant="text" block className="mt-3" onClick={handleReset}>
                      <RotateCcw aria-hidden="true" />
                      Start over
                    </Button>
                  </Panel>
                </aside>
              </div>
            </>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="prompt-builder-title">
      <div ref={questionsPanelRef} className={scrollerClass}>
        <MinimalBackNav to="/" />

        <span className="g-ai-badge mt-4">
          <Sparkles aria-hidden="true" />
          No AI credits used
        </span>
        <h1 id="prompt-builder-title" className="g-h1 mt-2">
          Prompt builder
        </h1>
        <p className="g-mut mt-1">Build a stronger gala prompt without using GalaTayo AI credits.</p>

        <div className="g-split mt-6">
          <div className="flex min-w-0 flex-col gap-3">
            {questionSections.map((section, index) => (
              <Panel as="section" key={section.id} className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="g-num">{index + 1}</span>
                  <h2 className="g-h3">{section.title}</h2>
                </div>

                <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                  {section.chips.map((chip) => (
                    <Chip
                      key={chip}
                      on={state[section.id].includes(chip)}
                      className="max-w-full"
                      onClick={() => setState((currentState) => toggleFieldValue(currentState, section.id, chip, section.multiSelect))}
                    >
                      <span className="truncate">{chip}</span>
                    </Chip>
                  ))}
                </div>

                <label htmlFor={`prompt-builder-${section.id}`} className="g-hint mt-3 block">
                  {compactHelperText[section.id] ?? section.helperText}
                </label>
                <input
                  id={`prompt-builder-${section.id}`}
                  value={state.custom[section.id]}
                  onChange={(event) => handleCustomChange(section.id, event.target.value)}
                  placeholder={section.placeholder}
                  className="g-input mt-1.5"
                />
              </Panel>
            ))}

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Button variant="line" onClick={handleReset} disabled={!showClearAll || isGeneratingPrompt}>
                <Trash2 aria-hidden="true" />
                Clear all
              </Button>
              <Button variant="tara" onClick={handleGeneratePrompt} disabled={isGeneratingPrompt || !hasInput}>
                <Sparkles aria-hidden="true" />
                Generate
              </Button>
            </div>
          </div>

          <aside className="g-side g-only-desk">
            <Panel>
              <h3 className="g-h3">Quick tips</h3>
              <ul className="g-sm g-mut mt-3 list-disc space-y-2 pl-5">
                <li>Fill in at least 2–3 fields for stronger prompts.</li>
                <li>Use specific locations for better place matches.</li>
                <li>Pick who you're with for vibe-matched spots.</li>
              </ul>
            </Panel>
          </aside>
        </div>
      </div>
    </section>
  )
}
