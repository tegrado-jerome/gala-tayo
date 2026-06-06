import { useEffect, useMemo, useState } from 'react'
import type { PromptBuilderFieldId, PromptBuilderState } from '../types/promptBuilder'
import {
  buildPromptBuilderOutputs,
  createEmptyPromptBuilderState,
  getExternalAiLinks,
  hasPromptBuilderInput,
  promptBuilderSections,
} from '../utils/promptBuilder'

type PromptBuilderModalProps = {
  isOpen: boolean
  initialState?: PromptBuilderState | null
  onClose: () => void
}

type CopyTarget = 'prompt'

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
  const outputs = useMemo(() => buildPromptBuilderOutputs(state), [state])
  const hasInput = hasPromptBuilderInput(state)
  const aiPrompt = hasInput ? outputs.aiPrompt : ''
  const aiLinks = useMemo(() => getExternalAiLinks(), [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setState(initialState ?? createEmptyPromptBuilderState())
    setCopiedTarget(null)
  }, [initialState, isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
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
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-end bg-slate-950/48 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="prompt-builder-title">
      <div className="max-h-[94vh] w-full overflow-hidden rounded-t-2xl border border-[var(--line)] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] sm:mx-auto sm:max-w-6xl sm:rounded-xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-4 py-4 sm:px-5">
          <div>
            <p id="prompt-builder-title" className="text-lg font-semibold text-slate-950">Prompt Builder</p>
            <p className="mt-1 max-w-[720px] text-sm leading-relaxed text-[var(--muted)]">
              Build a copy-ready prompt for another AI app. Prompt Builder does not use your Ask AI credits.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="grid max-h-[calc(94vh-86px)] overflow-y-auto lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <div className="grid gap-4 border-b border-[var(--line)] p-4 lg:border-b-0 lg:border-r lg:p-5">
            {promptBuilderSections.map((section) => (
              <section key={section.id} className="rounded-lg border border-[var(--line)] bg-[var(--soft)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{section.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{section.helperText}</p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                    Optional
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
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
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                          isSelected
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_8px_16px_rgba(47,116,232,0.18)]'
                            : 'border-[var(--line)] bg-white text-slate-700 hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)]'
                        }`}
                      >
                        {chip}
                      </button>
                    )
                  })}
                </div>

                <label className="mt-3 block text-xs font-semibold text-slate-800" htmlFor={`prompt-builder-${section.id}`}>
                  {section.customLabel}
                </label>
                <input
                  id={`prompt-builder-${section.id}`}
                  value={state.custom[section.id]}
                  onChange={(event) => handleCustomChange(section.id, event.target.value)}
                  placeholder={section.placeholder}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(47,116,232,0.12)]"
                />
              </section>
            ))}
          </div>

          <aside className="grid gap-4 bg-white p-4 lg:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-950">Generated outputs</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {hasInput ? 'Your prompt updates live as you choose chips or type details.' : 'Choose any chip or type anything optional to generate a prompt.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Delete prompt
              </button>
            </div>

            <section className="rounded-lg border border-[var(--line)] bg-[var(--soft)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-950">Copy-ready AI prompt</p>
                <button
                  type="button"
                  onClick={() => handleCopy('prompt', aiPrompt)}
                  disabled={!aiPrompt}
                  className="rounded-full border border-[var(--accent)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--accent-deep)] transition hover:bg-[var(--accent-wash)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  {copiedTarget === 'prompt' ? 'Copied' : 'Copy prompt'}
                </button>
              </div>
              <pre className="mt-3 max-h-[280px] overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-white p-3 text-xs leading-relaxed text-slate-800">
                {aiPrompt || 'No prompt yet. Add any chip or custom detail to generate one.'}
              </pre>
            </section>

            <section className="rounded-lg border border-[var(--line)] bg-white p-3">
              <p className="text-sm font-semibold text-slate-950">Open in another AI app</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">Copy the prompt first, then paste it into your preferred AI app.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {aiLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${link.label} in a new tab`}
                    className="rounded-lg border border-[var(--line)] bg-[var(--soft)] px-3 py-2 text-center text-xs font-semibold text-slate-800 transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)]"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
