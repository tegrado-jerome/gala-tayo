import { useEffect, useRef, useState } from 'react'

type TapGalaPinGameProps = {
  isLoading: boolean
  isAnswerReady?: boolean
  onViewAnswer?: () => void
  className?: string
  chibiImage?: string
}

type GameItemKind = 'pin' | 'bonus' | 'traffic'

type GameItem = {
  id: number
  kind: GameItemKind
  x: number
  y: number
  spawnAt: number
}

type ScoreBurst = {
  id: number
  x: number
  y: number
  value: string
  tone: 'good' | 'bad'
}

const loadingMessages = [
  'AI answer is generating...',
  'Keeping your gala plan loading...',
  'Almost ready. Keep playing.',
]

function getRandomPosition() {
  return {
    x: 18 + Math.random() * 64,
    y: 22 + Math.random() * 52,
  }
}

function getRandomItemKind(): GameItemKind {
  const roll = Math.random()

  if (roll < 0.72) {
    return 'pin'
  }

  if (roll < 0.88) {
    return 'bonus'
  }

  return 'traffic'
}

function createItem(id: number): GameItem {
  return {
    id,
    kind: getRandomItemKind(),
    ...getRandomPosition(),
    spawnAt: Date.now(),
  }
}

function getItemLabel(kind: GameItemKind) {
  if (kind === 'bonus') {
    return 'Bonus pin'
  }

  if (kind === 'traffic') {
    return 'Traffic pin'
  }

  return 'Gala pin'
}

function getComboLabel(combo: number) {
  if (combo <= 0) {
    return '0 combo'
  }

  if (combo === 1) {
    return '1 combo'
  }

  return `${combo} combo`
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-slate-500 animate-pulse" />
      <span className="h-2.5 w-2.5 rounded-full bg-slate-500 animate-pulse" style={{ animationDelay: '120ms' }} />
      <span className="h-2.5 w-2.5 rounded-full bg-slate-500 animate-pulse" style={{ animationDelay: '240ms' }} />
    </span>
  )
}

function MarkerGlyph({ kind }: { kind: GameItemKind }) {
  if (kind === 'bonus') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5">
        <path d="m12 3.8 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L12 3.8Z" />
      </svg>
    )
  }

  if (kind === 'traffic') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5">
        <path d="M12 4.5 20 18H4L12 4.5Z" />
        <path d="M12 9v4.5" />
        <path d="M12 16.5h.01" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5">
      <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  )
}

export default function TapGalaPinGame({
  isLoading,
  isAnswerReady = false,
  onViewAnswer,
  className = '',
  chibiImage,
}: TapGalaPinGameProps) {
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [messageIndex, setMessageIndex] = useState(0)
  const [activeItem, setActiveItem] = useState<GameItem>(() => createItem(1))
  const [scorePulse, setScorePulse] = useState(0)
  const [bursts, setBursts] = useState<ScoreBurst[]>([])
  const nextItemId = useRef(2)
  const nextBurstId = useRef(1)
  const itemTimeoutRef = useRef<number | null>(null)
  const messageTimerRef = useRef<number | null>(null)

  const loadingMessage = loadingMessages[messageIndex]
  const completed = score >= 5
  const progressValue = Math.min(100, Math.round((score / 5) * 100))

  useEffect(() => {
    if (itemTimeoutRef.current !== null) {
      window.clearTimeout(itemTimeoutRef.current)
      itemTimeoutRef.current = null
    }

    if (messageTimerRef.current !== null) {
      window.clearInterval(messageTimerRef.current)
      messageTimerRef.current = null
    }

    if (!isLoading || isAnswerReady) {
      return
    }

    messageTimerRef.current = window.setInterval(() => {
      setMessageIndex((index) => (index + 1) % loadingMessages.length)
    }, 1800)

    const scheduleNextItem = (delay: number) => {
      itemTimeoutRef.current = window.setTimeout(() => {
        setCombo(0)
        setActiveItem(createItem(nextItemId.current++))
        scheduleNextItem(1000)
      }, delay)
    }

    scheduleNextItem(900)

    return () => {
      if (itemTimeoutRef.current !== null) {
        window.clearTimeout(itemTimeoutRef.current)
        itemTimeoutRef.current = null
      }

      if (messageTimerRef.current !== null) {
        window.clearInterval(messageTimerRef.current)
        messageTimerRef.current = null
      }
    }
  }, [isLoading, isAnswerReady])

  useEffect(() => {
    if (!isLoading || isAnswerReady || bursts.length === 0) {
      return
    }

    const timer = window.setTimeout(() => {
      setBursts((current) => current.slice(1))
    }, 620)

    return () => window.clearTimeout(timer)
  }, [bursts, isLoading, isAnswerReady])

  const handleTap = () => {
    if (!isLoading || isAnswerReady) {
      return
    }

    if (itemTimeoutRef.current !== null) {
      window.clearTimeout(itemTimeoutRef.current)
      itemTimeoutRef.current = null
    }

    if (activeItem.kind === 'traffic') {
      setScore((current) => Math.max(0, current - 1))
      setCombo(0)
      setScorePulse((current) => current + 1)
      setBursts((current) => [
        ...current,
        {
          id: nextBurstId.current++,
          x: activeItem.x,
          y: activeItem.y,
          value: '-1',
          tone: 'bad',
        },
      ])
    } else {
      const points = activeItem.kind === 'bonus' ? 2 : 1
      setScore((current) => current + points)
      setCombo((current) => current + 1)
      setScorePulse((current) => current + 1)
      setBursts((current) => [
        ...current,
        {
          id: nextBurstId.current++,
          x: activeItem.x,
          y: activeItem.y,
          value: `+${points}`,
          tone: activeItem.kind === 'bonus' ? 'good' : 'good',
        },
      ])
    }

    setActiveItem(createItem(nextItemId.current++))

    itemTimeoutRef.current = window.setTimeout(() => {
      setCombo(0)
      setActiveItem(createItem(nextItemId.current++))
    }, 1000)
  }

  if (!isLoading && !isAnswerReady) {
    return null
  }

  if (isAnswerReady) {
    return (
      <div className={`rounded-[22px] border border-[rgba(20,35,58,0.12)] bg-white/92 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)] ${className}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#e0537b]">Mini game</p>
            <p className="mt-1 text-[15px] font-black text-slate-950">Answer ready</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
              Final score: {score} points. {completed ? 'Nice.' : 'Warm-up only.'}
            </p>
          </div>
          <span className="rounded-full border border-[rgba(20,35,58,0.1)] bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-600">
            {score} pts
          </span>
        </div>

        {onViewAnswer ? (
          <button
            type="button"
            onClick={onViewAnswer}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[14px] border border-[rgba(20,35,58,0.12)] bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-[0_10px_18px_rgba(15,23,42,0.12)] transition hover:brightness-105"
          >
            View answer
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-[rgba(20,35,58,0.12)] bg-white/92 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)] lg:p-5 ${className}`}>
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#e0537b]">Mini game</p>
          <p className="mt-1 text-[15px] font-black leading-tight text-slate-950">Tap while AI generates</p>
          <div className="mt-1 flex h-5 items-center gap-2 overflow-hidden text-[12px] leading-5 text-[var(--muted)]">
            <LoadingDots />
            <span className="truncate">{loadingMessage}</span>
          </div>
        </div>
        <span
          key={scorePulse}
          className="inline-flex h-8 w-[52px] shrink-0 items-center justify-center rounded-full border border-[rgba(20,35,58,0.1)] bg-slate-50 text-[11px] font-black text-slate-600 animate-[gala-score-pop_260ms_ease-out]"
        >
          {score} pts
        </span>
      </div>

      <div className="mt-3 grid shrink-0 grid-cols-3 gap-2 text-center text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)] sm:text-[11px]">
        <span className="inline-flex h-8 items-center justify-center rounded-full border border-[rgba(20,35,58,0.08)] bg-[linear-gradient(180deg,#fffdfb,#f9fbff)] px-2 text-slate-700">
          Goal {score}/5
        </span>
        <span className="inline-flex h-8 items-center justify-center rounded-full border border-[rgba(20,35,58,0.08)] bg-[linear-gradient(180deg,#fffdfb,#f9fbff)] px-2 text-slate-700">
          {getComboLabel(combo)}
        </span>
        <span className="inline-flex h-8 items-center justify-center rounded-full border border-[rgba(20,35,58,0.08)] bg-[linear-gradient(180deg,#fffdfb,#f9fbff)] px-2 text-slate-700">
          {completed ? 'Ready soon' : 'Keep tapping'}
        </span>
      </div>

      <div className="mt-3 shrink-0 rounded-[14px] border border-[rgba(47,116,232,0.12)] bg-[linear-gradient(180deg,#f8fbff,#fffdfd)] px-3 py-2">
        <div className="flex h-5 items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--accent-deep)]">
          <span className="truncate">AI output loading</span>
          <LoadingDots />
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-2/3 rounded-full bg-[linear-gradient(90deg,#2f74e8,#ff6f9d,#5ed6c7)] motion-safe:animate-[gala-loading-slide_1.45s_ease-in-out_infinite]" />
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 rounded-[18px] border border-[rgba(20,35,58,0.08)] bg-[linear-gradient(180deg,#fffdfb,#f7fbff)] p-2.5 lg:p-3">
        <div className="relative h-full min-h-[260px] overflow-hidden rounded-[16px] bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.8),transparent_24%),radial-gradient(circle_at_84%_24%,rgba(255,222,232,0.8),transparent_22%),linear-gradient(180deg,#f8fbff,#fff7fa)] sm:min-h-[300px] lg:min-h-[420px] xl:min-h-[500px]">
          <div className="absolute inset-0">
            <div className="absolute inset-x-8 top-[18%] h-[10px] rounded-full bg-[linear-gradient(90deg,rgba(71,128,235,0.14),rgba(71,128,235,0.42),rgba(255,111,157,0.2))]" />
            <div className="absolute inset-x-8 top-[44%] h-[12px] rounded-full bg-[linear-gradient(90deg,rgba(255,196,87,0.16),rgba(255,196,87,0.46),rgba(98,206,193,0.22))]" />
            <div className="absolute inset-x-8 top-[68%] h-[10px] rounded-full bg-[linear-gradient(90deg,rgba(124,179,255,0.14),rgba(124,179,255,0.42),rgba(255,158,186,0.2))]" />
            <div className="absolute left-[16%] top-0 h-full w-[10px] bg-[linear-gradient(180deg,rgba(255,255,255,0.4),rgba(84,105,128,0.12),rgba(255,255,255,0.3))]" />
            <div className="absolute left-[55%] top-0 h-full w-[12px] bg-[linear-gradient(180deg,rgba(255,255,255,0.36),rgba(82,93,124,0.12),rgba(255,255,255,0.28))]" />
            <div className="absolute left-[82%] top-0 h-full w-[10px] bg-[linear-gradient(180deg,rgba(255,255,255,0.38),rgba(84,105,128,0.12),rgba(255,255,255,0.3))]" />

            <div className="absolute left-[8%] top-[18%] h-5 w-5 rounded-full border border-[rgba(20,35,58,0.08)] bg-white/90 shadow-sm" />
            <div className="absolute left-[28%] top-[40%] h-4 w-4 rounded-full border border-[rgba(20,35,58,0.08)] bg-white/90 shadow-sm" />
            <div className="absolute left-[63%] top-[26%] h-5 w-5 rounded-full border border-[rgba(20,35,58,0.08)] bg-white/90 shadow-sm" />
            <div className="absolute left-[76%] top-[60%] h-4 w-4 rounded-full border border-[rgba(20,35,58,0.08)] bg-white/90 shadow-sm" />

            <div className="absolute left-[18%] top-[70%] h-2 w-2 rounded-full bg-[#5ed6c7] shadow-[0_0_0_6px_rgba(94,214,199,0.18)]" />
            <div className="absolute left-[48%] top-[58%] h-2 w-2 rounded-full bg-[#ffcc4d] shadow-[0_0_0_6px_rgba(255,204,77,0.18)]" />
            <div className="absolute left-[71%] top-[38%] h-2 w-2 rounded-full bg-[#ff6f9d] shadow-[0_0_0_6px_rgba(255,111,157,0.18)]" />

            <div className="absolute inset-0 animate-[gala-map-breathe_4s_ease-in-out_infinite] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.15),transparent_58%)]" />
          </div>

          {bursts.map((burst) => (
            <span
              key={burst.id}
              className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 text-[13px] font-black tracking-[-0.02em] ${
                burst.tone === 'bad' ? 'text-[#ff5f8b]' : 'text-[#1f7ab8]'
              } animate-[gala-burst-pop_620ms_ease-out]`}
              style={{ left: `${burst.x}%`, top: `${burst.y}%` }}
            >
              {burst.value}
            </span>
          ))}

          {chibiImage ? (
            <div className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/80 bg-white shadow-sm">
              <img src={chibiImage} alt="" className="h-full w-full object-contain" loading="lazy" />
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleTap}
            className="absolute flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/90 bg-white text-[#e0537b] shadow-[0_12px_24px_rgba(15,23,42,0.12)] transition-transform duration-150 hover:scale-110 active:scale-95"
            style={{ left: `${activeItem.x}%`, top: `${activeItem.y}%` }}
            aria-label={`Tap the ${getItemLabel(activeItem.kind)}`}
          >
            <span
              className="absolute rounded-full border border-[rgba(224,83,123,0.24)] animate-[gala-ring-pulse_900ms_ease-out_infinite]"
              style={{
                inset: '-18px',
              }}
            />
            <span
              className="absolute rounded-full border border-[rgba(255,111,157,0.18)] animate-[gala-ring-pulse_900ms_ease-out_infinite]"
              style={{
                inset: '-30px',
                animationDelay: '180ms',
              }}
            />
            <MarkerGlyph kind={activeItem.kind} />
          </button>
        </div>
      </div>

      <div className="mt-3 flex h-5 shrink-0 items-center gap-3 text-[12px] text-[var(--muted)]">
        <span className="w-16 shrink-0">{getComboLabel(combo)}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#ffcc4d,#ff6f9d,#5ed6c7)] transition-all duration-300"
            style={{ width: `${Math.max(16, progressValue)}%` }}
          />
        </div>
        <span className="w-10 shrink-0 text-right">{completed ? 'Ready' : '5 taps'}</span>
      </div>
    </div>
  )
}
