import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRotateLeft, faRobot } from '@fortawesome/free-solid-svg-icons'
import { AppIcon, type AppIconName } from '../../AppIcon'
import AskAiUsagePill from '../../AskAiUsagePill'
import { FeatureGuideModalTrigger, featureGuideContent } from '../../FeatureGuideModal'
import GoogleSignInButton from '../../GoogleSignInButton'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  HeartOutlineIcon,
  BuildingIcon,
  CafeIcon,
  MuseumIcon,
  SparkIcon,
} from '../HomeIcons'
import type { AskAiSource } from '../homeHelpers'
import { navigateBackWithFallback, navigateToPath } from '../../../utils/navigation'
import { cancelAskAiRuntimeRequest, type ChatMessage } from '../../../utils/askAiRuntime'
import { type AskAiUsageStatus } from '../../../utils/askAiUsage'
import { PageShellSkeleton } from '../../loading/SkeletonStates'
import { useTheme } from '../../../context/ThemeContext'

function formatResetAtCompact(resetAt: string) {
  const resetDate = new Date(resetAt)

  if (Number.isNaN(resetDate.getTime())) {
    return resetAt
  }

  const timePart = resetDate.toLocaleTimeString([], {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).replace(' ', '\u00A0')

  return timePart
}

void formatResetAtCompact

function getSourceHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return url
  }
}

function normalizeAskAiDisplayText(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢|ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢/g, 'Ã¢â‚¬Â¢')
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢/g, "'")
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ|ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â/g, '"')
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“/g, '-')
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦/g, '...')
    .replace(/ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¼Ãƒâ€¦Ã‚Â¡/g, ':')
}

function normalizeAskAiPresentationText(value: string) {
  return value
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/(^|[\s(])\*\*([^*\n]+)\*\*(?=[\s).,!?:;]|$)/g, '$1$2')
    .replace(/(^|[\s(])__([^_\n]+)__(?=[\s).,!?:;]|$)/g, '$1$2')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1$2')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^>\s+/gm, '')
}

function getAskAiDisplayLines(answer: string) {
  return normalizeAskAiPresentationText(normalizeAskAiDisplayText(answer))
    .split('\n')
    .map((line) => line.trim())
}

function AskAiAnswerBody({ answer }: { answer: string }) {
  const { resolvedTheme } = useTheme()
  const isDarkMode = resolvedTheme === 'dark'
  const lines = getAskAiDisplayLines(answer)

  return (
    <div className={`grid gap-2 text-[0.95rem] leading-7 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
      {lines.map((line, index) => {
        const key = `${index}-${line}`

        if (!line) {
          return <div key={key} className="h-1" aria-hidden="true" />
        }

        if (/^[A-Z][A-Za-z /]+(?: .+)?:$/.test(line)) {
          return (
            <p key={key} className={index === 0 ? 'font-semibold' : 'pt-2 font-semibold'}>
              {line}
            </p>
          )
        }

        if (/^(?:[-*]|Ã¢â‚¬Â¢)\s+/.test(line)) {
          return (
            <p key={key} className="pl-5 -indent-5 text-slate-800">
              <span aria-hidden="true" className="mr-2 text-slate-500">Ã¢â‚¬Â¢</span>
              {line.replace(/^(?:[-*]|Ã¢â‚¬Â¢)\s+/, '')}
            </p>
          )
        }

        return <p key={key}>{line}</p>
      })}
    </div>
  )
}

function AskAiBackButton({
  onClick,
  label = 'Back',
  className = '',
}: {
  onClick: () => void
  label?: string
  className?: string
}) {
  void onClick
  void label
  void className
  return null
}

function getAskAiLeadLine(answer: string) {
  const cleaned = normalizeAskAiPresentationText(normalizeAskAiDisplayText(answer)).trim()
  if (!cleaned) {
    return "Here's a practical gala plan for you."
  }

  const firstSentence = cleaned.match(/^.*?[.!?](?:\s|$)/)?.[0].trim()
  return firstSentence || "Here's a practical gala plan for you."
}

function getAskAiBestPlanLines(answer: string) {
  return getAskAiDisplayLines(answer)
    .filter((line) => /^(?:[-*]|Ã¢â‚¬Â¢)\s+/.test(line))
    .slice(0, 4)
    .map((line) => line.replace(/^(?:[-*]|Ã¢â‚¬Â¢)\s+/, ''))
}

function getAskAiParagraphs(answer: string) {
  return getAskAiDisplayLines(answer).filter((line) => line && !/^(?:[-*]|Ã¢â‚¬Â¢)\s+/.test(line) && !/^[A-Z][A-Za-z /]+(?: .+)?:$/.test(line))
}

type AskAiParsedSection = {
  title: string
  lines: string[]
}

type AskAiSectionBlock =
  | { type: 'paragraph'; content: string }
  | { type: 'bullet'; content: string }
  | { type: 'numbered'; content: string; marker: string }

function parseAskAiSections(answer: string): AskAiParsedSection[] {
  const lines = getAskAiDisplayLines(answer)
  const sections: AskAiParsedSection[] = []
  let currentSection: AskAiParsedSection | null = null

  for (const line of lines) {
    if (!line) {
      continue
    }

    if (/^[A-Z][A-Za-z /]+(?: .+)?:$/.test(line)) {
      currentSection = {
        title: line.replace(/:$/, ''),
        lines: [],
      }
      sections.push(currentSection)
      continue
    }

    if (!currentSection) {
      currentSection = {
        title: 'Answer',
        lines: [],
      }
      sections.push(currentSection)
    }

    currentSection.lines.push(line)
  }

  return sections.filter((section) => section.lines.length > 0)
}

function getAskAiSectionBlocks(lines: string[]): AskAiSectionBlock[] {
  return lines.flatMap<AskAiSectionBlock>((line) => {
    const trimmedLine = line.trim()

    if (!trimmedLine) {
      return []
    }

    const numberedMatch = trimmedLine.match(/^(\d+)[.)]\s+(.*)$/)
    if (numberedMatch) {
      return [{
        type: 'numbered',
        marker: numberedMatch[1],
        content: numberedMatch[2],
      }]
    }

    if (/^(?:[-*]|ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢)\s+/.test(trimmedLine)) {
      return [{
        type: 'bullet',
        content: trimmedLine.replace(/^(?:[-*]|ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢)\s+/, ''),
      }]
    }

    return [{
      type: 'paragraph',
      content: trimmedLine,
    }]
  })
}

function getAskAiSectionIcon(sectionTitle: string) {
  const normalizedTitle = sectionTitle.trim().toLowerCase()

  if (normalizedTitle.includes('quick answer')) {
    return SparkIcon
  }

  if (normalizedTitle.includes('best plan') || normalizedTitle.includes('best pick') || normalizedTitle.includes('best options')) {
    return HeartOutlineIcon
  }

  if (normalizedTitle.includes('why')) {
    return BuildingIcon
  }

  if (normalizedTitle.includes('tip')) {
    return CafeIcon
  }

  return SparkIcon
}

function AskAiStructuredSection({
  section,
  isPrimary = false,
}: {
  section: AskAiParsedSection
  isPrimary?: boolean
}) {
  const SectionIcon = getAskAiSectionIcon(section.title)
  const blocks = getAskAiSectionBlocks(section.lines)
  const paragraphBlocks = blocks.filter((block) => block.type === 'paragraph')
  const listBlocks = blocks.filter((block) => block.type !== 'paragraph')
  const containerClassName = isPrimary
    ? 'border-[rgba(var(--accent-rgb),0.12)] bg-[linear-gradient(180deg,#ffffff_0%,#f5f8ff_100%)] shadow-[0_10px_24px_rgba(var(--accent-rgb),0.05)]'
    : 'border-[rgba(15,23,42,0.08)] bg-white shadow-[0_8px_20px_rgba(15,23,42,0.04)]'

  return (
    <article
      className={`overflow-hidden rounded-3xl border px-4 py-4 sm:px-5 ${containerClassName}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(var(--accent-rgb),0.08)] text-[var(--accent-deep)]">
          <SectionIcon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[0.66rem] font-black uppercase tracking-[0.14em] text-slate-400">AI response</p>
          <h3 className="text-[0.94rem] font-black tracking-[-0.02em] text-slate-900">{section.title}</h3>
        </div>
      </div>

      <div className="mt-3.5 grid gap-3">
        {paragraphBlocks.length > 0 ? (
          <div className="grid gap-2.5 break-words text-[0.98rem] leading-7 text-slate-700 [overflow-wrap:anywhere]">
            {paragraphBlocks.map((block, index) => (
              <p key={`${section.title}-paragraph-${index}`}>{block.content}</p>
            ))}
          </div>
        ) : null}

        {listBlocks.length > 0 ? (
          <div className="grid gap-3">
            {listBlocks.map((block, index) => (
              <div
                key={`${section.title}-list-${index}`}
                className="flex items-start gap-3 rounded-2xl bg-slate-50 px-3.5 py-3"
              >
                {block.type === 'numbered' ? (
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[0.78rem] font-black text-slate-700">
                    {block.marker}
                  </span>
                ) : (
                  <span className="mt-[0.72rem] h-2 w-2 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                )}
                <p className="min-w-0 break-words text-[0.95rem] leading-7 text-slate-800 [overflow-wrap:anywhere]">{block.content}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )
}

function AskAiAnswerText({ answer }: { answer: string }) {
  const lines = normalizeAskAiPresentationText(normalizeAskAiDisplayText(answer)).split('\n')

  return (
    <div className="grid gap-1 text-sm leading-relaxed text-slate-800">
      {lines.map((line, index) => {
        const trimmedLine = line.trim()
        const key = `${index}-${trimmedLine}`

        if (!trimmedLine) {
          return <div key={key} className="h-1" aria-hidden="true" />
        }

        if (/^[A-Z][A-Za-z /]+(?: .+)?[:ÃƒÂ¯Ã‚Â¼Ã…Â¡]$/.test(trimmedLine)) {
          return (
            <p key={key} className={index === 0 ? 'font-semibold text-slate-950' : 'mt-2 font-semibold text-slate-950'}>
              {trimmedLine}
            </p>
          )
        }

        if (/^[-*]\s+/.test(trimmedLine)) {
          return (
            <p key={key} className="pl-4 text-slate-800">
              <span aria-hidden="true">ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ </span>
              {trimmedLine.replace(/^[-*]\s+/, '')}
            </p>
          )
        }

        return <p key={key}>{trimmedLine}</p>
      })}
    </div>
  )
}

function getAskAiAnswerLead(answer: string) {
  const cleaned = answer.replace(/\r\n/g, '\n').trim()
  if (!cleaned) {
    return 'Here\u2019s a practical gala plan for you.'
  }

  const firstSentence = cleaned.match(/^.*?[.!?](?:\s|$)/)?.[0].trim()
  return firstSentence || 'Here\u2019s a practical gala plan for you.'
}

function getAskAiBulletLines(answer: string) {
  return answer
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .slice(0, 4)
    .map((line) => line.replace(/^[-*]\s+/, ''))
}

function AskAiOutputStageLegacy({
  question,
  answer,
  sources,
  onStartOver,
  className = '',
}: {
  question: string
  answer: string
  sources: AskAiSource[]
  onStartOver: () => void
  className?: string
}) {
  const leadLine = getAskAiAnswerLead(answer)
  const bulletLines = getAskAiBulletLines(answer)

  return (
    <section
      className={`gala-page-background relative overflow-hidden px-4 py-4 text-[var(--text)] sm:px-5 sm:py-5 lg:px-8 lg:py-7 ${className} min-h-[calc(var(--ask-ai-viewport-height,100svh)-88px)]`}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-12 top-8 h-40 w-40 rounded-full bg-[rgba(160,201,255,0.24)] blur-3xl" />
        <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[rgba(192,202,255,0.22)] blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-36 w-36 rounded-full bg-[rgba(201,235,255,0.24)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(var(--ask-ai-viewport-height,100svh)-144px)] w-full max-w-[min(1500px,calc(100vw-96px))] flex-col gap-5 lg:gap-7">
        <div>
          <p className="text-[0.9rem] font-black uppercase tracking-[0.12em] text-slate-500">Your question</p>
          <div className="mt-2.5 inline-block max-w-full rounded-[16px] border border-[rgba(20,35,58,0.22)] bg-white/96 px-4 py-3.5 shadow-[0_12px_26px_rgba(15,23,42,0.045),inset_0_1px_0_rgba(255,255,255,0.9)] sm:px-5 sm:py-4 lg:max-w-[980px] xl:max-w-[1120px]">
            <p className="break-words text-[1.08rem] font-bold leading-7 tracking-[-0.01em] text-slate-950 [overflow-wrap:anywhere] sm:text-[1.18rem] sm:leading-8 lg:text-[1.12rem]">
              {question}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-5 lg:-mt-2">
          <div className="rounded-3xl border border-[rgba(83,146,241,0.16)] bg-white px-5 py-4 text-center shadow-[0_12px_24px_rgba(15,23,42,0.045)]">
            <p className="text-[1.1rem] font-black text-slate-900">Here\u2019s a practical</p>
            <p className="mt-1 text-[1.1rem] font-black text-slate-900">gala plan for you.</p>
          </div>
        </div>
        <div className="grid items-start gap-5 lg:mt-auto lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="w-full rounded-3xl border border-[rgba(83,146,241,0.16)] bg-white px-4 py-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)] sm:px-6 sm:py-6">
            <div className="grid gap-0">
              <div className="grid gap-3 border-b border-dashed border-[rgba(83,146,241,0.16)] py-4 first:pt-0">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                    <AppIcon name="info" className="h-5 w-5 text-[var(--accent-deep)]" strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[1.05rem] font-black text-[var(--accent-deep)]">Quick answer</p>
                    <div className="mt-2">
                      <AskAiAnswerText answer={answer} />
        </div>
      </div>
    </div>
              </div>

            <div className="grid gap-3 border-b border-dashed border-[rgba(83,146,241,0.16)] py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                  <HeartOutlineIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[1.05rem] font-black text-[var(--accent-deep)]">Best plan</p>
                  {bulletLines.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7 text-slate-800">
                      {bulletLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm leading-7 text-slate-800">
                      {leadLine}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-3 border-b border-dashed border-[rgba(83,146,241,0.16)] py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                  <AppIcon name="info" className="h-5 w-5 text-[var(--accent-deep)]" strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <p className="text-[1.05rem] font-black text-[var(--accent-deep)]">Why this works</p>
                  <p className="mt-2 text-sm leading-7 text-slate-800">
                    It keeps the plan practical, compact, and easy to follow without overcomplicating the outing.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                  <AppIcon name="info" className="h-5 w-5 text-[var(--accent-deep)]" strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <p className="text-[1.05rem] font-black text-[var(--accent-deep)]">Tip</p>
                  <p className="mt-2 text-sm leading-7 text-slate-800">
                    Add the area, budget, or vibe you want next time so the plan gets even tighter.
                  </p>
                </div>
              </div>
            </div>
            </div>
          </div>

          <aside className="grid gap-3 lg:sticky lg:top-6">
            <p className="text-[1.05rem] font-black text-slate-950">Other actions</p>
            <button
              type="button"
              onClick={onStartOver}
              className="group relative flex items-center gap-3 overflow-hidden rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(135deg,#0f172a,#1d4ed8)] px-4 py-4 text-left shadow-[0_18px_42px_rgba(29,78,216,0.24)] transition hover:-translate-y-[1px] hover:shadow-[0_24px_52px_rgba(29,78,216,0.28)]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/14 text-white ring-1 ring-white/16">
                <AppIcon name="info" className="h-6 w-6 text-white" strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/72">Reset GalaTayo AI</p>
                <p className="mt-1 text-base font-black text-white">Start over</p>
                <p className="mt-1 text-xs leading-5 text-white/78">
                  Clear this answer and ask a brand new question.
                </p>
              </div>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-white transition group-hover:translate-x-0.5" />
            </button>

          </aside>
        </div>

        {sources.length > 0 ? (
          <div className="rounded-[28px] border border-[rgba(83,146,241,0.16)] bg-white px-4 py-4 shadow-[0_14px_32px_rgba(15,23,42,0.045)] sm:px-5 sm:py-5">
            <div className="flex items-center gap-2">
              <p className="text-[1.05rem] font-black text-slate-950">Sources</p>
              <span className="rounded-full bg-[var(--accent-wash)] px-2 py-1 text-[11px] font-black text-[var(--accent-deep)]">
                Double-check when needed
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[76px] items-center justify-between gap-3 rounded-[20px] border border-[rgba(83,146,241,0.16)] bg-[linear-gradient(180deg,#ffffff,#f7fbff)] px-4 py-3 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{source.title}</p>
                    <p className="mt-1 truncate text-xs font-medium text-[var(--muted)]">{getSourceHostname(source.url)}</p>
                  </div>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-[var(--accent-deep)]" />
                </a>
              ))}
            </div>
          </div>
        ) : null}

      </div>
    </section>
  )
}

function AskAiThinkingStageLegacy({
  question,
  className = '',
}: {
  question: string
  className?: string
}) {
  const loadingMessageText = 'This may take a few seconds if current info is needed.'

  return (
    <section className={`gala-page-background relative overflow-hidden px-4 py-4 text-[var(--text)] sm:px-5 sm:py-5 lg:px-8 lg:py-7 ${className} min-h-[calc(var(--ask-ai-viewport-height,100svh)-88px)]`}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-12 top-8 h-40 w-40 rounded-full bg-[rgba(160,201,255,0.24)] blur-3xl" />
        <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[rgba(192,202,255,0.22)] blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-36 w-36 rounded-full bg-[rgba(201,235,255,0.24)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(var(--ask-ai-viewport-height,100svh)-144px)] w-full max-w-[min(1500px,calc(100vw-96px))] flex-col">
        <h1 className="mt-6 text-[3.1rem] font-black leading-none tracking-[-0.055em] text-slate-950 sm:text-[4rem] lg:mt-8 lg:text-[4.5rem]">
          GalaTayo AI
        </h1>

        <div className="mt-7 lg:mt-8">
          <p className="text-[0.9rem] font-black uppercase tracking-[0.12em] text-slate-500">Your question</p>
          <div className="mt-2.5 inline-block max-w-full rounded-[16px] border border-[rgba(20,35,58,0.22)] bg-white/96 px-4 py-3.5 shadow-[0_12px_26px_rgba(15,23,42,0.045),inset_0_1px_0_rgba(255,255,255,0.9)] sm:px-5 sm:py-4 lg:max-w-[980px] xl:max-w-[1120px]">
            <p className="break-words text-[1.08rem] font-bold leading-7 tracking-[-0.01em] text-slate-950 [overflow-wrap:anywhere] sm:text-[1.18rem] sm:leading-8 lg:text-[1.12rem]">
              {question}
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-1 flex-col items-center justify-center text-center sm:mt-10 lg:mt-5">
          <div className="relative w-full max-w-[370px] rounded-2xl border border-[rgba(20,35,58,0.34)] bg-white px-4 pb-4 pt-4 shadow-[0_12px_28px_rgba(15,23,42,0.045)] sm:max-w-[420px] sm:px-5 lg:max-w-[370px]">
            <span className="absolute left-1/2 top-0 h-4.5 w-4.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t border-[rgba(20,35,58,0.34)] bg-white" />
            <div className="relative flex flex-col items-center gap-2.5">
              <p className="text-[0.9rem] font-semibold uppercase tracking-[0.08em] text-slate-600 sm:text-[0.98rem] lg:text-[0.9rem]">
                GalaTayo AI is responding...
              </p>
            </div>
          </div>

          <p className="mt-7 max-w-[680px] text-[1.2rem] font-semibold italic leading-8 tracking-[-0.02em] text-slate-700 sm:text-[1.45rem] sm:leading-[2.25rem] lg:mt-6 lg:text-[1.3rem]">
            &quot;Generating your gala plan...&quot;
          </p>
        <p className="mt-3 text-[0.95rem] italic leading-6 text-slate-500 sm:text-[1.05rem] lg:text-[0.95rem]">
          {loadingMessageText}
        </p>
      </div>
      </div>
    </section>
  )
}

function AskAiPlaceholder({
  usageStatus,
  isUsageLoading,
  isRegistered,
  question,
  answer,
  sources,
  isSubmitting,
  answerError,
  onQuestionChange,
  onSubmit,
  onSwitchToPlaces,
  onStartOver,
  className = '',
}: {
  usageStatus: AskAiUsageStatus | null
  isUsageLoading: boolean
  isRegistered: boolean
  question: string
  answer: string
  sources: AskAiSource[]
  isSubmitting: boolean
  answerError: string | null
  onQuestionChange: (question: string) => void
  onSubmit: (questionOverride?: string) => void
  onSwitchToPlaces: () => void
  onStartOver: () => void
  className?: string
}) {
  void isUsageLoading
  const { resolvedTheme } = useTheme()
  const isDarkMode = resolvedTheme === 'dark'
  const isUsagePending = !usageStatus
  void isUsagePending
  const isLimitReached = usageStatus
    ? !usageStatus.allowed || usageStatus.remaining <= 0
    : false
  const [draftQuestion, setDraftQuestion] = useState(question)
  const questionTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    setDraftQuestion(question)
  }, [question])

  useEffect(() => {
    const syncTextareaHeight = (element: HTMLTextAreaElement | null, minHeight: number) => {
      if (!element) {
        return
      }

      element.style.height = '0px'
      element.style.height = `${Math.max(element.scrollHeight, minHeight)}px`
    }

    syncTextareaHeight(questionTextareaRef.current, 96)
  }, [draftQuestion])

  const updateDraftQuestion = (nextQuestion: string) => {
    setDraftQuestion(nextQuestion)
    startTransition(() => {
      onQuestionChange(nextQuestion)
    })
  }
  void updateDraftQuestion

  const handleSubmit = (text?: string) => {
    const finalQuestion = (text ?? draftQuestion).trim()
    if (!finalQuestion || isSubmitting) return
    onQuestionChange(finalQuestion)
    onSubmit(finalQuestion)
  }

  if (isSubmitting) {
    return <AskAiThinkingStageNext question={draftQuestion} className={className} />
  }

  if (answer) {
    return (
      <AskAiOutputStageNext
        question={question}
        answer={answer}
        sources={sources}
        onStartOver={onStartOver}
        className={className}
      />
    )
  }

  const promptChips = [
    { id: 'date', label: 'Date', prompt: 'Plan a date gala' },
    { id: 'food', label: 'Food', prompt: 'Plan a food trip' },
    { id: 'itinerary', label: 'Itinerary', prompt: 'Create a quick itinerary' },
    { id: 'find', label: 'Find', prompt: 'Find places on map' },
  ]

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Chat header */}
      <div className="shrink-0 border-b border-[var(--line)] bg-white px-4 py-3 sm:px-5">
        <div className="mx-auto flex w-full max-w-[768px] items-center gap-3">
          <button
            type="button"
            onClick={onSwitchToPlaces}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 lg:hidden"
            aria-label="Back"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[1.05rem] font-bold leading-tight text-slate-900 sm:text-[1.15rem]">GalaTayo AI</h1>
            <p className="text-[0.78rem] leading-tight text-[var(--muted)]">Plan your gala.</p>
          </div>
          <AskAiUsagePill label="Chatbot AI" usageStatus={usageStatus} className="ml-auto shrink-0" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigateToPath('/ask-ai/maps')}
              className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)] sm:inline-flex items-center gap-1"
            >
              <AppIcon name="map" className="h-3 w-3" />
              <span className="hidden sm:inline">Map</span>
            </button>
          </div>
        </div>
      </div>

      {/* Chat messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        <div className="mx-auto flex w-full max-w-[768px] flex-col gap-5">
          {/* AI greeting bubble */}
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#dbeafe,#bfdbfe)] text-sm shadow-[0_2px_8px_rgba(var(--accent-rgb),0.10)]">
              <AppIcon name="info" className="h-4 w-4 text-[var(--accent-deep)]" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 max-w-[82%] rounded-2xl rounded-tl-[6px] border border-[rgba(15,23,42,0.06)] bg-white px-4 py-3 shadow-[0_2px_8px_rgba(15,23,42,0.03)]">
              <p className="text-[0.94rem] leading-relaxed text-slate-800">Hi! What kind of gala are you planning today?</p>
            </div>
          </div>

          {/* Starter chips */}
          <div className="flex flex-wrap gap-2 pl-10">
            {promptChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                disabled={isLimitReached && isRegistered}
                onClick={() => handleSubmit(chip.prompt)}
                className="rounded-full border border-[rgba(var(--accent-rgb),0.16)] bg-[var(--accent-wash)] px-3.5 py-2 text-[0.82rem] font-semibold text-[var(--accent-deep)] transition hover:border-[var(--accent)] hover:bg-[rgba(var(--accent-rgb),0.18)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {chip.label}
              </button>
            ))}
            <button
              type="button"
              disabled={isLimitReached && isRegistered}
              onClick={() => navigateToPath('/ask-ai/maps')}
              className="rounded-full border border-[rgba(15,23,42,0.08)] bg-slate-50 px-3.5 py-2 text-[0.82rem] font-semibold text-slate-600 transition hover:border-[rgba(15,23,42,0.16)] hover:bg-white sm:hidden"
            >
              <span className="inline-flex items-center gap-1">
                <AppIcon name="map" className="h-3.5 w-3.5" />
                Maps
              </span>
            </button>
          </div>

          {isLimitReached && !isSubmitting && (
            <ChatbotLimitWarning />
          )}

        </div>
      </div>

      {/* Hidden state keeper */}
      {answerError ? (
        <div className={`shrink-0 border-t px-4 py-2.5 text-center ${
          isDarkMode ? 'border-[rgba(248,113,113,0.14)] bg-[rgba(15,23,42,0.66)]' : 'border-red-100 bg-red-50/50'
        }`}>
          <p className={`text-[0.82rem] ${isDarkMode ? 'text-rose-200' : 'text-red-600'}`}>{answerError}</p>
        </div>
      ) : null}
    </div>
  )
}

void AskAiPlaceholder

function ChatbotLimitWarning({ className = '' }: { className?: string }) {
  const { resolvedTheme } = useTheme()
  const isDarkMode = resolvedTheme === 'dark'

  return (
    <div className={`${className} flex w-full justify-center px-1`}>
      <div className={`inline-flex w-fit max-w-full items-start gap-3 rounded-2xl px-4 py-3 text-left shadow-[0_10px_24px_rgba(127,29,29,0.10)] ${
        isDarkMode
          ? 'border border-[rgba(248,113,113,0.18)] bg-[rgba(15,23,42,0.82)]'
          : 'border border-red-200 bg-red-50'
      }`}>
        <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${
          isDarkMode
            ? 'bg-[rgba(127,29,29,0.44)] text-rose-200 ring-[rgba(248,113,113,0.18)]'
            : 'bg-red-100 text-red-700 ring-red-200'
        }`}>
          <AppIcon name="bot" className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <p className={`text-[0.84rem] font-bold leading-relaxed ${isDarkMode ? 'text-rose-100' : 'text-red-800'}`}>
            Na-consume mo na ang Chatbot AI usage mo ngayong araw.
          </p>
        </div>
      </div>
    </div>
  )
}

function AskAiGateLoadingState({
  className = '',
}: {
  className?: string
}) {
  return <PageShellSkeleton className={className} />
}

void AskAiSignInRequired

function AskAiSignInRequired({
  className = '',
  onBack,
}: {
  className?: string
  onBack?: () => void
}) {
  return (
    <section className={`gala-page-background relative overflow-hidden px-4 py-5 ${className}`}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-12 top-8 h-40 w-40 rounded-full bg-[rgba(160,201,255,0.24)] blur-3xl" />
        <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[rgba(192,202,255,0.36)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.82fr)] lg:items-center">
        {onBack ? <AskAiBackButton onClick={onBack} className="w-fit lg:col-span-2" /> : null}
        <div className="overflow-hidden rounded-[32px] border border-[rgba(83,146,241,0.16)] bg-white/88 p-5 shadow-[0_22px_60px_rgba(15,23,42,0.08)] sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(83,146,241,0.18)] bg-[rgba(242,247,255,0.96)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-deep)]">
                <AppIcon name="info" className="h-4 w-4" strokeWidth={2.2} />
                GalaTayo AI
              </div>
              <p className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-[2.5rem]">
                Sign in to unlock <span className="text-[var(--accent-deep)]">GalaTayo AI</span>.
              </p>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--muted)] sm:text-[15px]">
                <span className="font-semibold text-[var(--accent-deep)]">GalaTayo AI</span> is reserved for <span className="font-semibold text-slate-800">GalaTayo members</span>.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-700">
                <span className="rounded-full border border-[rgba(83,146,241,0.16)] bg-[rgba(247,251,255,0.96)] px-3 py-1.5">
                  Private chats
                </span>
                <span className="rounded-full border border-[rgba(191,205,255,0.26)] bg-[rgba(242,246,255,0.95)] px-3 py-1.5">
                  Saved usage limit
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <GoogleSignInButton className="inline-flex" />
          </div>
        </div>

        <div className="overflow-hidden rounded-[32px] border border-[rgba(191,205,255,0.22)] bg-[linear-gradient(180deg,rgba(248,250,255,0.96),rgba(241,246,255,0.94))] p-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgba(123,146,255,0.12)] text-[#4969c8]">
              <BuildingIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-black text-slate-950">Not signed in yet?</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                You can browse the rest of GalaTayo without logging in, and come back here when you are ready to use GalaTayo AI.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

void AskAiOutputStageLegacy
void AskAiThinkingStageLegacy
void AskAiOutputStageNextLegacy
void AskAiGateLoadingState

function AskAiOutputStageNextLegacy({
  question,
  answer,
  sources,
  onStartOver,
  className = '',
}: {
  question: string
  answer: string
  sources: AskAiSource[]
  onStartOver: () => void
  className?: string
}) {
  const leadLine = getAskAiLeadLine(answer)
  const bulletLines = getAskAiBestPlanLines(answer)
  const paragraphs = getAskAiParagraphs(answer)
  const parsedSections = parseAskAiSections(answer)
  const quickAnswer = paragraphs[0] ?? leadLine
  const whyThisWorks = paragraphs[1] ?? 'It keeps the plan easy, relaxed, and not too tiring.'
  const tipLine = paragraphs[2] ?? 'Add your area, budget, or vibe so GalaTayo can make the next answer more specific.'

  return (
    <section className={`gala-page-background relative overflow-hidden px-5 py-5 text-[var(--text)] ${className} min-h-[calc(var(--ask-ai-viewport-height,100svh)-88px)]`}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-12 top-8 h-40 w-40 rounded-full bg-[rgba(160,201,255,0.24)] blur-3xl" />
        <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[rgba(192,202,255,0.22)] blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-36 w-36 rounded-full bg-[rgba(201,235,255,0.24)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(var(--ask-ai-viewport-height,100svh)-128px)] w-full max-w-[820px] flex-col gap-5 lg:max-w-[900px]">
        <div>
          <p className="text-[0.9rem] font-black uppercase tracking-[0.12em] text-slate-500">Your question</p>
          <div className="mt-2.5 w-full rounded-2xl border border-[rgba(20,35,58,0.14)] bg-white/88 px-4 py-3.5">
            <p className="break-words text-[1rem] font-bold leading-7 tracking-[-0.01em] text-slate-950 [overflow-wrap:anywhere]">{question}</p>
          </div>
        </div>

        <div className="grid gap-4 border-t border-[rgba(20,35,58,0.08)] pt-4">
          {parsedSections.length >= 2 ? parsedSections.map((section, index) => {
            const SectionIcon = getAskAiSectionIcon(section.title)
            const bulletOnlyLines = section.lines
              .filter((line) => /^(?:[-*]|ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢)\s+/.test(line))
              .map((line) => line.replace(/^(?:[-*]|ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢)\s+/, ''))
            const plainLines = section.lines.filter((line) => line && !/^(?:[-*]|ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢)\s+/.test(line))

            return (
              <div key={`${section.title}-${index}`} className={`grid gap-2 ${index === 0 ? '' : 'border-t border-[rgba(20,35,58,0.08)] pt-4'}`}>
                <p className="flex items-center gap-2 text-[0.98rem] font-black text-slate-950">
                  <SectionIcon className="h-4 w-4 text-[var(--accent-deep)]" />
                  {section.title}
                </p>
                {bulletOnlyLines.length > 0 ? (
                  <ul className="space-y-2 pl-5 text-[0.95rem] leading-7 text-slate-800">
                    {bulletOnlyLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {plainLines.length > 0 ? (
                  <div className="grid gap-2 text-[0.95rem] leading-7 text-slate-800">
                    {plainLines.map((line, lineIndex) => (
                      <p key={`${section.title}-${lineIndex}`}>{line}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          }) : (
            <>
              <div className="grid gap-2">
                <p className="flex items-center gap-2 text-[0.98rem] font-black text-slate-950">
                  <AppIcon name="info" className="h-4 w-4 text-[var(--accent-deep)]" strokeWidth={2.2} />
                  Quick answer
                </p>
                <p className="text-[0.95rem] leading-7 text-slate-800">{quickAnswer}</p>
              </div>

              <div className="grid gap-2 border-t border-[rgba(20,35,58,0.08)] pt-4">
                <p className="flex items-center gap-2 text-[0.98rem] font-black text-slate-950">
                  <HeartOutlineIcon className="h-4 w-4 text-[var(--accent-deep)]" />
                  Best plan
                </p>
                {bulletLines.length > 0 ? (
                  <ul className="space-y-2 pl-5 text-[0.95rem] leading-7 text-slate-800">
                    {bulletLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <AskAiAnswerBody answer={answer} />
                )}
              </div>

              <div className="grid gap-2 border-t border-[rgba(20,35,58,0.08)] pt-4">
                <p className="flex items-center gap-2 text-[0.98rem] font-black text-slate-950">
                  <BuildingIcon className="h-4 w-4 text-[var(--accent-deep)]" />
                  Why this works
                </p>
                <p className="text-[0.95rem] leading-7 text-slate-800">{whyThisWorks}</p>
              </div>

              <div className="grid gap-2 border-t border-[rgba(20,35,58,0.08)] pt-4">
                <p className="flex items-center gap-2 text-[0.98rem] font-black text-slate-950">
                  <CafeIcon className="h-4 w-4 text-[var(--accent-deep)]" />
                  Tip
                </p>
                <p className="text-[0.95rem] leading-7 text-slate-800">{tipLine}</p>
              </div>
            </>
          )}

          <div className="grid gap-2 border-t border-[rgba(20,35,58,0.08)] pt-4">
            <p className="flex items-center gap-2 text-[0.98rem] font-black text-slate-950">
              <MuseumIcon className="h-4 w-4 text-[var(--accent-deep)]" />
              Other actions
            </p>
            <button
              type="button"
              onClick={onStartOver}
              className="group flex items-center justify-between gap-3 rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(135deg,#0f172a,#1d4ed8)] px-4 py-4 text-left shadow-[0_18px_42px_rgba(29,78,216,0.22)] transition hover:-translate-y-[1px] hover:shadow-[0_22px_48px_rgba(29,78,216,0.28)]"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/72">Reset GalaTayo AI</p>
                <p className="mt-1 text-sm font-black text-white">Start over</p>
                <p className="mt-1 text-xs leading-5 text-white/78">Ask a new question or rewrite this one.</p>
              </div>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-white transition group-hover:translate-x-0.5" />
            </button>

          </div>

          {sources.length > 0 ? (
            <div className="grid gap-2 border-t border-[rgba(20,35,58,0.08)] pt-4">
              <p className="text-[0.98rem] font-black text-slate-950">Sources</p>
              <div className="grid gap-2.5">
                {sources.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[64px] items-center justify-between gap-3 rounded-2xl border border-[rgba(83,146,241,0.14)] bg-[rgba(255,255,255,0.7)] px-4 py-3 transition hover:border-[var(--accent)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{source.title}</p>
                      <p className="mt-1 truncate text-xs font-medium text-[var(--muted)]">{getSourceHostname(source.url)}</p>
                    </div>
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-[var(--accent-deep)]" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function AskAiOutputStageNext({
  question,
  answer,
  sources,
  onStartOver,
  className = '',
}: {
  question: string
  answer: string
  sources: AskAiSource[]
  onStartOver: () => void
  className?: string
}) {
  const parsedSections = parseAskAiSections(answer)
  const displaySections = parsedSections.length > 0
    ? parsedSections
    : [{ title: 'Plan', lines: getAskAiDisplayLines(answer).filter(Boolean) }]

  return (
    <div className={`flex h-full min-h-0 w-full flex-col ${className}`}>
      {/* Chat messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5 lg:px-8">
        <div className="flex w-full flex-col gap-5">

          {/* User message bubble */}
          <div className="flex justify-end">
            <div className="min-w-0 max-w-[82%] rounded-2xl rounded-tr-[6px] bg-[var(--accent)] px-4 py-3 shadow-[0_4px_14px_rgba(var(--accent-rgb),0.16)]">
              <p className="break-words text-[0.94rem] leading-relaxed text-white [overflow-wrap:anywhere]">{question}</p>
            </div>
          </div>

          {/* AI response bubble */}
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#dbeafe,#bfdbfe)] shadow-[0_2px_8px_rgba(var(--accent-rgb),0.10)]">
              <FontAwesomeIcon icon={faRobot} className="h-4 w-4 text-[var(--accent-deep)]" />
            </div>
            <div className="min-w-0 w-full max-w-[88%] sm:max-w-[82%]">
              {displaySections.map((section, index) => (
                <div key={`${section.title}-${index}`}>
                  <AskAiStructuredSection
                    section={section}
                    isPrimary={index === 0}
                  />
                  {index < displaySections.length - 1 && <div className="h-3" />}
                </div>
              ))}

              {sources.length > 0 && (
                <div className="mt-3 rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white/70 px-4 py-3">
                  <p className="text-[0.7rem] font-black uppercase tracking-[0.1em] text-slate-400">Sources</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {sources.map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-[rgba(15,23,42,0.06)] bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-[rgba(var(--accent-rgb),0.18)] hover:bg-white hover:text-[var(--accent-deep)]"
                      >
                        {source.title.length > 28 ? `${source.title.slice(0, 28)}...` : source.title}
                        <ChevronRightIcon className="h-3 w-3 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onStartOver}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2 text-[0.78rem] font-semibold text-slate-500 transition hover:border-[rgba(15,23,42,0.16)] hover:text-slate-700"
                >
                  <FontAwesomeIcon icon={faArrowRotateLeft} className="h-3.5 w-3.5" />
                  Start over
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ThinkingLoadingBar({ className = '' }: { className?: string }) {
  const { resolvedTheme } = useTheme()
  const isDarkMode = resolvedTheme === 'dark'

  return (
    <div className={`h-1.5 overflow-hidden rounded-full ${isDarkMode ? 'bg-slate-700/80' : 'bg-slate-100'} ${className}`}>
      <div
        className={`h-full w-2/3 rounded-full motion-safe:animate-[gala-loading-slide_1.6s_ease-in-out_infinite] ${
          isDarkMode ? 'bg-slate-200' : 'bg-[linear-gradient(90deg,var(--accent),var(--accent-deep))]'
        }`}
      />
    </div>
  )
}

function isChatbotDailyLimitMessage(message: string | null) {
  if (!message) {
    return false
  }

  const normalized = message.trim().toLowerCase()
  return (
    normalized === 'you have reached your chatbot ai daily limit.' ||
    normalized === 'daily_ai_limit_reached'
  )
}

function isChatbotUsageLimitReached(usageStatus: AskAiUsageStatus | null, isRegistered: boolean) {
  return usageStatus
    ? isRegistered
      ? !usageStatus.allowed || usageStatus.remaining <= 0
      : !usageStatus.allowed
    : false
}

function AskAiThinkingStageNext({
  question,
  className = '',
}: {
  question: string
  className?: string
}) {
  const { resolvedTheme } = useTheme()
  const isDarkMode = resolvedTheme === 'dark'

  return (
    <div className={`flex h-full min-h-0 w-full flex-col ${className}`}>
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5 lg:px-8">
        <div className="mx-auto flex w-full max-w-[820px] flex-col gap-5 lg:max-w-[900px]">
          <div className="flex justify-end">
            <div className="min-w-0 max-w-[82%] rounded-2xl rounded-tr-[6px] bg-[var(--accent)] px-4 py-3 shadow-[0_4px_14px_rgba(var(--accent-rgb),0.16)]">
              <p className="break-words text-[0.94rem] leading-relaxed text-white [overflow-wrap:anywhere]">{question}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-[0_2px_8px_rgba(var(--accent-rgb),0.10)] ${
                isDarkMode
                  ? 'bg-[linear-gradient(135deg,rgba(30,58,138,0.38),rgba(59,130,246,0.26))]'
                  : 'bg-[linear-gradient(135deg,#dbeafe,#bfdbfe)]'
              }`}
            >
              <FontAwesomeIcon icon={faRobot} className="h-4 w-4 text-[var(--accent-deep)]" />
            </div>
            <div
              className={`min-w-0 w-full max-w-[88%] rounded-2xl rounded-tl-[6px] px-4 py-3.5 sm:max-w-[82%] ${
                isDarkMode
                  ? 'border border-[rgba(96,165,250,0.16)] bg-[rgba(15,23,42,0.76)] shadow-[0_12px_30px_rgba(2,8,23,0.32)]'
                  : 'border border-[rgba(15,23,42,0.06)] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.03)]'
              }`}
            >
              <div className="flex items-center gap-2">
                <p className={`text-[0.78rem] font-semibold tracking-[-0.02em] ${isDarkMode ? 'text-slate-100' : 'text-slate-950'}`}>
                  Thinking
                </p>
              </div>
              <p className={`mt-1 text-[12px] font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                Shaping your GalaTayo AI reply.
              </p>
              <ThinkingLoadingBar className="mt-3" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AskAiModePanel({
  isRegistered,
  isSessionLoading,
  usageStatus,
  isUsageLoading,
  usageError,
  answer,
  sources,
  isSubmitting,
  answerError,
  messages,
  onRetryUsage,
  onSubmit,
  onStartOver,
  onGuestUpgradePrompt,
  className = '',
}: {
  isRegistered: boolean
  isSessionLoading: boolean
  usageStatus: AskAiUsageStatus | null
  isUsageLoading: boolean
  usageError: string | null
  answer: string
  sources: AskAiSource[]
  isSubmitting: boolean
  answerError: string | null
  messages: ChatMessage[]
  onRetryUsage: () => void
  onSubmit: (questionOverride?: string) => void
  onStartOver: () => void
  onGuestUpgradePrompt: () => void
  className?: string
}) {
  void isUsageLoading
  const isUsagePending = !usageStatus
  const isLimitReached = isChatbotUsageLimitReached(usageStatus, isRegistered)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const messageScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const scrollContainer = messageScrollRef.current
    if (!scrollContainer) {
      return
    }

    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: 'smooth',
    })
  }, [answer, isSubmitting, messages])

  const [draftQuestion, setDraftQuestion] = useState('')
  const draftQuestionRef = useRef('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    draftQuestionRef.current = draftQuestion
  }, [draftQuestion])

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [draftQuestion])

  const updateDraftQuestion = useCallback((nextQuestion: string) => {
    draftQuestionRef.current = nextQuestion
    setDraftQuestion(nextQuestion)
  }, [])

  const handleSend = useCallback((text?: string) => {
    const finalQuestion = (text ?? draftQuestionRef.current).trim()
    if (isSubmitting || isUsagePending) return

    if (isLimitReached && !isRegistered) {
      onGuestUpgradePrompt()
      return
    }

    if (!finalQuestion) return

    if (isLimitReached) return

    updateDraftQuestion('')
    onSubmit(finalQuestion)
  }, [isLimitReached, isRegistered, isSubmitting, isUsagePending, onGuestUpgradePrompt, onSubmit, updateDraftQuestion])

  return (
    <div className={`relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[var(--bg)] ${className}`}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(23,37,84,0.08),transparent_62%)] blur-3xl" />
        <div className="absolute -top-20 left-1/4 h-[320px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(30,58,138,0.06),transparent_62%)] blur-3xl" />
        <div className="absolute -top-16 right-1/4 h-[320px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(23,37,84,0.05),transparent_62%)] blur-3xl" />
      </div>

      <div className="relative shrink-0 mb-4 px-4 pt-5 sm:mb-5 sm:px-5 md:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AskAiUsagePill label="Chatbot AI" usageStatus={usageStatus} className="shrink-0" />
            <FeatureGuideModalTrigger content={featureGuideContent.chatbot} />
          </div>
          <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onStartOver}
              aria-label="New chat"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--panel)] text-slate-600 ring-1 ring-inset ring-[var(--line)] shadow-[var(--shadow-soft)] transition hover:text-[var(--accent-deep)]"
            >
              <AppIcon name="newChat" size={24} strokeWidth={2} />
            </button>
          )}
          <button
            type="button"
            onClick={() => navigateBackWithFallback('/home')}
            aria-label="Go back"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#dbeafe,#bfdbfe)] text-[var(--accent-deep)] ring-1 ring-inset ring-[rgba(var(--accent-rgb),0.14)] shadow-[0_6px_18px_-8px_rgba(59,130,246,0.28)] transition hover:bg-[linear-gradient(135deg,#bfdbfe,#dbeafe)] hover:text-[var(--accent-deep)]"
          >
            <FontAwesomeIcon icon={faRobot} className="h-6 w-6" />
          </button>
          </div>
        </div>
      </div>

      <div ref={messageScrollRef} className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 [overflow-anchor:none] sm:px-5 md:px-6 lg:px-8">
        <div className="flex min-h-full w-full flex-col gap-4 py-4 sm:py-5">
          <ChatMessageList
            isSessionLoading={isSessionLoading}
            isRegistered={isRegistered}
            usageError={usageError}
            messages={messages}
            isSubmitting={isSubmitting}
            answer={answer}
            sources={sources}
            answerError={answerError}
            isLimitReached={isLimitReached}
            onSend={handleSend}
            onRetryUsage={onRetryUsage}
          />
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="relative shrink-0 px-4 pb-[max(env(safe-area-inset-bottom,0px),0.35rem)] pt-2 sm:px-5 md:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[920px]">
          <div className="group/composer relative flex items-end gap-1.5 rounded-[24px] border border-[var(--line)] bg-[var(--panel)] p-1.5 shadow-[var(--shadow-soft)] transition focus-within:border-[var(--line-strong)]">
            <textarea
              ref={textareaRef}
              value={draftQuestion}
              onChange={(e) => updateDraftQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Message GalaTayo AI..."
              rows={1}
              disabled={isSubmitting || isUsagePending || (isLimitReached && isRegistered)}
              className="ask-ai-composer-input min-h-[40px] max-h-[120px] flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2 text-[15px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-300"
            />
            <button
              type="button"
              onClick={() => (isSubmitting ? cancelAskAiRuntimeRequest() : handleSend())}
              disabled={!isSubmitting && (isUsagePending || (!draftQuestion.trim() && !isLimitReached) || (isLimitReached && isRegistered))}
              aria-label={isSubmitting ? 'Cancel request' : 'Send message'}
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full bg-[var(--accent-deep)] text-white shadow-[0_8px_18px_rgba(23,37,84,0.24)] transition hover:bg-[var(--accent)] active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {isSubmitting ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="11" fill="#172554" />
                  <rect x="5.5" y="5.5" width="13" height="13" rx="2" fill="white" />
                </svg>
              ) : (
                <AppIcon name="send" className="h-4 w-4" strokeWidth={2.25} />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-slate-400">
            GalaTayo AI can make mistakes. Check important info.
          </p>
        </div>
      </div>
    </div>
  )
}

const ChatMessageList = memo(function ChatMessageList({
  isSessionLoading,
  isRegistered,
  usageError,
  messages,
  isSubmitting,
  answer,
  sources,
  answerError,
  isLimitReached,
  onSend,
  onRetryUsage,
}: {
  isSessionLoading: boolean
  isRegistered: boolean
  usageError: string | null
  messages: ChatMessage[]
  isSubmitting: boolean
  answer: string
  sources: AskAiSource[]
  answerError: string | null
  isLimitReached: boolean
  onSend: (text?: string) => void
  onRetryUsage: () => void
}) {
  const { resolvedTheme } = useTheme()
  const isDarkMode = resolvedTheme === 'dark'
  const answerCardClassName = isDarkMode
    ? 'w-full min-w-0 overflow-hidden rounded-2xl border border-[rgba(96,165,250,0.16)] bg-[rgba(15,23,42,0.76)] p-4 shadow-[0_12px_30px_rgba(2,8,23,0.32)] backdrop-blur-sm'
    : 'w-full min-w-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-[rgba(255,255,255,0.88)] p-4 shadow-[var(--shadow-soft)] backdrop-blur-sm'
  const responseTextClassName = isDarkMode ? 'text-slate-200' : 'text-slate-800'
  const responseStrongClassName = isDarkMode ? 'text-slate-50' : 'text-slate-900'
  const responseMutedClassName = isDarkMode ? 'text-slate-400' : 'text-slate-500'

  if (!isSessionLoading && usageError) {
    return (
      <AskAiUsageErrorContent
        usageError={usageError}
        onRetryUsage={onRetryUsage}
      />
    )
  }

  if (messages.length === 0 && !isSubmitting && !answer) {
    const promptChips: Array<{ id: string; label: string; description: string; prompt: string; icon: AppIconName }> = [
      { id: 'date', label: 'Date', description: 'Cozy date ideas.', prompt: 'Plan a date gala', icon: 'calendarDays' },
      { id: 'food', label: 'Food', description: 'Sulit food spots.', prompt: 'Plan a food trip', icon: 'cafe' },
      { id: 'itinerary', label: 'Itinerary', description: 'Morning to night.', prompt: 'Create a quick itinerary', icon: 'galaPlan' },
      { id: 'budget', label: 'Budget', description: 'Low-cost picks.', prompt: 'Suggest budget-friendly places to visit', icon: 'wallet' },
    ]

    return (
      <div className="flex w-full flex-1 items-end justify-center px-0 pb-2 pt-2 sm:pb-3 sm:pt-3">
        <div className="mx-auto flex w-full max-w-[820px] flex-col items-center text-center lg:max-w-[900px]">
          <div className="mb-4 flex w-full flex-col items-center gap-1.5 sm:mb-5">
            <h1 className="text-[1.3rem] font-semibold leading-tight tracking-[-0.02em] text-slate-900 sm:text-[1.9rem]">Ano ang plano today?</h1>
            <p className="max-w-md text-[14px] leading-relaxed text-slate-500 sm:text-[14.5px]">
              Places, food, dates, at iba pa.
            </p>
          </div>

          <div className="mb-3 flex items-center gap-2 sm:mb-4">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10.5px] font-black uppercase tracking-[0.14em] text-slate-600">
              Picks
            </span>
            <p className="text-[12px] leading-relaxed text-slate-500 sm:text-[12.5px]">
              Pili ka lang.
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:gap-2.5">
          {promptChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              disabled={isLimitReached && isRegistered}
              onClick={() => onSend(chip.prompt)}
              className="group flex w-full items-center gap-2.5 rounded-2xl border border-slate-200/70 bg-white/80 p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.03)] backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.12)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 sm:items-start sm:gap-3 sm:p-3.5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-alt)] text-slate-500 ring-1 ring-inset ring-[var(--line)] transition group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent-deep)] sm:h-9 sm:w-9">
                <AppIcon name={chip.icon} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold text-slate-800 sm:text-[13.5px]">{chip.label}</div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{chip.description}</div>
              </div>
            </button>
          ))}
          </div>

          {isRegistered && isLimitReached && !isSubmitting && (
            <ChatbotLimitWarning className="mt-5" />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-5 md:mx-auto md:max-w-[820px] lg:max-w-[900px]">
      {messages.map((msg, index) => {
        if (msg.role === 'user') {
          return (
            <div key={index} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-md border border-[rgba(23,37,84,0.2)] bg-[var(--accent-deep)] px-4 py-2.5 shadow-[0_8px_18px_rgba(23,37,84,0.22)]">
                <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-white [overflow-wrap:anywhere]">{msg.content}</p>
              </div>
            </div>
          )
        }

        return (
          <div key={index} className={answerCardClassName}>
            <div className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-md shadow-[0_8px_16px_rgba(23,37,84,0.18)] ${
                  isDarkMode ? 'bg-[rgba(96,165,250,0.2)]' : 'bg-[var(--accent-deep)]'
                }`}
              >
                <AppIcon name="info" className="h-3 w-3 text-white" strokeWidth={2.2} />
              </div>
              <span className={`text-[12px] font-semibold tracking-wide ${responseMutedClassName}`}>GalaTayo AI</span>
            </div>
            <div className="pl-8">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => (
                    <p className={`mb-3 last:mb-0 whitespace-pre-wrap text-[15px] leading-[1.7] break-words [overflow-wrap:anywhere] ${responseTextClassName}`}>
                      {children}
                    </p>
                  ),
                  strong: ({ children }) => (
                    <strong className={`break-words font-semibold ${responseStrongClassName}`}>{children}</strong>
                  ),
                  ul: ({ children }) => (
                    <ul
                      className={`my-3 list-disc space-y-1.5 pl-5 text-[15px] leading-[1.7] ${
                        isDarkMode ? 'text-slate-200 marker:text-slate-500' : 'text-slate-800 marker:text-slate-400'
                      }`}
                    >
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol
                      className={`my-3 list-decimal space-y-1.5 pl-5 text-[15px] leading-[1.7] ${
                        isDarkMode ? 'text-slate-200 marker:text-slate-500' : 'text-slate-800 marker:text-slate-400'
                      }`}
                    >
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className={`leading-[1.7] break-words [overflow-wrap:anywhere] ${responseTextClassName}`}>{children}</li>
                  ),
                  em: ({ children }) => (
                    <em className={`italic ${responseTextClassName}`}>{children}</em>
                  ),
                  a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-deep)] underline decoration-[rgba(var(--accent-rgb),0.18)] underline-offset-2 transition hover:text-[var(--accent)] hover:decoration-[rgba(var(--accent-rgb),0.38)]">{children}</a>
                  ),
                  code: ({ children }) => (
                    <code
                      className={`whitespace-pre-wrap break-all rounded-md px-1.5 py-0.5 font-mono text-[13px] ${
                        isDarkMode ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre
                      className={`my-3 overflow-x-auto rounded-xl p-3 text-[13px] leading-relaxed ${
                        isDarkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {children}
                    </pre>
                  ),
                  h1: ({ children }) => (
                    <h1 className={`mb-2 mt-4 text-[20px] font-semibold tracking-[-0.01em] first:mt-0 ${responseStrongClassName}`}>
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className={`mb-2 mt-4 text-[17px] font-semibold tracking-[-0.01em] first:mt-0 ${responseStrongClassName}`}>
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className={`mb-1.5 mt-3 text-[15px] font-semibold first:mt-0 ${responseStrongClassName}`}>{children}</h3>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote
                      className={`my-3 border-l-2 pl-4 italic ${
                        isDarkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {children}
                    </blockquote>
                  ),
                  table: ({ children }) => (
                    <div className="my-3 max-w-full overflow-x-auto">
                      <table className={`min-w-max border-collapse text-[14px] leading-[1.6] ${responseTextClassName}`}>
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className={isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-600'}>{children}</thead>
                  ),
                  tbody: ({ children }) => (
                    <tbody className={isDarkMode ? 'divide-y divide-slate-700' : 'divide-y divide-slate-200'}>{children}</tbody>
                  ),
                  tr: ({ children }) => (
                    <tr className={isDarkMode ? 'border-b border-slate-700 last:border-b-0' : 'border-b border-slate-200 last:border-b-0'}>
                      {children}
                    </tr>
                  ),
                  th: ({ children }) => (
                    <th
                      className={`whitespace-nowrap border px-3 py-2 text-left font-semibold ${
                        isDarkMode ? 'border-slate-700 text-slate-200' : 'border-slate-200 text-slate-700'
                      }`}
                    >
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td
                      className={`border px-3 py-2 align-top ${
                        isDarkMode ? 'border-slate-700 text-slate-200' : 'border-slate-200 text-slate-800'
                      }`}
                    >
                      {children}
                    </td>
                  ),
                }}
              >
                {msg.content}
              </ReactMarkdown>
              {sources.length > 0 && (
                <div className={`mt-4 flex flex-wrap items-center gap-1.5 pt-3 ${isDarkMode ? 'border-t border-slate-700/80' : 'border-t border-slate-200/70'}`}>
                  <span className={`mr-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] ${responseMutedClassName}`}>
                    Sources
                  </span>
                  {sources.map((source) => (
                    <a
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`group inline-flex max-w-[200px] items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ${
                        isDarkMode
                          ? 'border border-slate-700 bg-slate-900/80 text-slate-300 hover:border-[rgba(var(--accent-rgb),0.3)] hover:bg-[rgba(var(--accent-rgb),0.12)] hover:text-slate-100'
                          : 'border border-[var(--line)] bg-white text-slate-600 hover:border-[rgba(var(--accent-rgb),0.22)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-deep)]'
                      }`}
                    >
                      <span className="truncate">{source.title.length > 32 ? `${source.title.slice(0, 32)}\u2026` : source.title}</span>
                      <ChevronRightIcon className={`h-3 w-3 shrink-0 transition ${isDarkMode ? 'text-slate-500 group-hover:text-slate-200' : 'text-slate-400 group-hover:text-[var(--accent)]'}`} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {isSubmitting && !answer && (
        <div
          className={`w-full rounded-2xl p-4 backdrop-blur-sm ${
            isDarkMode
              ? 'border border-[rgba(96,165,250,0.16)] bg-[rgba(15,23,42,0.76)] shadow-[0_12px_30px_rgba(2,8,23,0.32)]'
              : 'border border-[var(--line)] bg-[rgba(255,255,255,0.88)] shadow-[var(--shadow-soft)]'
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-md shadow-[0_8px_16px_rgba(23,37,84,0.18)] ${
                isDarkMode ? 'bg-[rgba(96,165,250,0.2)]' : 'bg-[var(--accent-deep)]'
              }`}
            >
              <AppIcon name="info" className="h-3 w-3 text-white" strokeWidth={2.2} />
            </div>
            <span className={`text-[12px] font-semibold tracking-wide ${responseMutedClassName}`}>GalaTayo AI</span>
          </div>
          <div className="pl-8">
            <div className="flex items-center gap-2">
              <span className={`text-[11.5px] font-semibold uppercase tracking-[0.08em] ${isDarkMode ? 'text-slate-100' : 'text-slate-700'}`}>
                Thinking
              </span>
            </div>
            <p className={`mt-1 text-[12px] font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>
              Shaping your GalaTayo AI reply.
            </p>
            <ThinkingLoadingBar className="mt-3" />
          </div>
        </div>
      )}

      {answerError && !isSubmitting && messages.length > 0 && !isChatbotDailyLimitMessage(answerError) && (
        <div className={`rounded-2xl px-4 py-3 shadow-[0_8px_18px_rgba(127,29,29,0.08)] ${
          isDarkMode
            ? 'border border-[rgba(248,113,113,0.18)] bg-[rgba(15,23,42,0.78)]'
            : 'border border-red-200 bg-red-50'
        }`}>
          <p className={`text-[13px] ${isDarkMode ? 'text-rose-200' : 'text-red-800'}`}>{answerError}</p>
        </div>
      )}

      {isRegistered && isLimitReached && !isSubmitting && messages.length > 0 && (
        <ChatbotLimitWarning />
      )}
    </div>
  )
})

function AskAiUsageErrorContent({
  usageError,
  onRetryUsage,
}: {
  usageError: string | null
  onRetryUsage: () => void
}) {
  return (
    <div className="flex w-full flex-col items-center justify-center py-8 text-center">
      <div className="relative mb-5">
        <div className="pointer-events-none absolute -inset-4 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.18),transparent_65%)] blur-2xl" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-[0_10px_28px_-6px_rgba(245,158,11,0.4),inset_0_1px_0_rgba(255,255,255,0.25)]">
          <AppIcon name="warning" className="h-6 w-6 text-white" />
        </div>
      </div>
      <h2 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-slate-900 sm:text-[1.7rem]">
        <span>GalaTayo </span>
        <span className="bg-gradient-to-r from-[var(--accent)] via-[var(--accent-deep)] to-[#0f172a] bg-clip-text text-transparent">AI</span>
        <span> is unavailable</span>
      </h2>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-slate-500">
        {usageError ?? 'Try checking your daily GalaTayo AI status again.'}
      </p>
      <div className="mt-6 flex items-center gap-2.5">
        <button
          type="button"
          onClick={onRetryUsage}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-slate-900 to-slate-700 px-4 py-2 text-[13px] font-semibold text-white shadow-[0_4px_12px_-2px_rgba(15,23,42,0.3)] transition hover:from-slate-800 hover:to-slate-700"
        >
          Retry
        </button>
      </div>
    </div>
  )
}

export {
  formatResetAtCompact,
  getSourceHostname,
  normalizeAskAiDisplayText,
  normalizeAskAiPresentationText,
  getAskAiDisplayLines,
  AskAiAnswerBody,
  AskAiBackButton,
  getAskAiLeadLine,
  getAskAiBestPlanLines,
  getAskAiParagraphs,
  parseAskAiSections,
  getAskAiSectionBlocks,
  getAskAiSectionIcon,
  AskAiStructuredSection,
  AskAiAnswerText,
  getAskAiAnswerLead,
  getAskAiBulletLines,
  AskAiOutputStageLegacy,
  AskAiThinkingStageLegacy,
  AskAiPlaceholder,
  AskAiGateLoadingState,
  AskAiSignInRequired,
  AskAiOutputStageNextLegacy,
  AskAiOutputStageNext,
  ThinkingLoadingBar,
  AskAiThinkingStageNext,
  AskAiModePanel,
  ChatMessageList,
  AskAiUsageErrorContent,
}
