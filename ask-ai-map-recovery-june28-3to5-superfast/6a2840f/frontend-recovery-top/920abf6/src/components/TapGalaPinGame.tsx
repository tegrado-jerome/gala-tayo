import { useEffect, useRef, useState } from 'react'

type TapGalaPinGameProps = {
  isLoading: boolean
  isAnswerReady?: boolean
  onViewAnswer?: () => void
  onClose?: () => void
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
  tone: 'good' | 'bad' | 'bonus'
}

const charmTargetSteps = [8, 10, 12, 14, 16, 18]

const loadingMessages = [
  'AI answer is generating...',
  'Keeping your gala plan loading...',
  'Almost ready. Keep playing.',
]

const charmNames = ['Cafe run', 'Park walk', 'Food trip', 'Museum day', 'Arcade stop', 'Sunset view']
const itemLifetimeMs = 1400

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

function getCharmName(level: number) {
  return charmNames[(level - 1) % charmNames.length]
}

function getCharmTarget(level: number) {
  const loop = Math.floor((level - 1) / charmTargetSteps.length)
  const baseTarget = charmTargetSteps[(level - 1) % charmTargetSteps.length]
  return baseTarget + loop * 2
}

function getLevelProgress(score: number) {
  let level = 1
  let remainingScore = score
  let currentTarget = getCharmTarget(level)

  while (remainingScore >= currentTarget) {
    remainingScore -= currentTarget
    level += 1
    currentTarget = getCharmTarget(level)
  }

  return {
    level,
    levelScore: remainingScore,
    currentTarget,
    progressValue: Math.round((remainingScore / currentTarget) * 100),
  }
}

function getMarkerTone(kind: GameItemKind) {
  if (kind === 'bonus') {
    return {
      button: 'bg-[#fff8df] text-[#c77a00]',
      ring: 'border-[rgba(255,196,87,0.34)]',
      ringSoft: 'border-[rgba(255,196,87,0.2)]',
      label: 'Bonus',
    }
  }

  if (kind === 'traffic') {
    return {
      button: 'bg-[#fff1f5] text-[#e24d78]',
      ring: 'border-[rgba(255,95,139,0.36)]',
      ringSoft: 'border-[rgba(255,95,139,0.2)]',
      label: 'Avoid',
    }
  }

  return {
    button: 'bg-white text-[#2563eb]',
    ring: 'border-[rgba(37,99,235,0.34)]',
    ringSoft: 'border-[rgba(37,99,235,0.18)]',
    label: 'Tap',
  }
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
  onClose,
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
  const { level, levelScore, currentTarget, progressValue } = getLevelProgress(score)
  const markerTone = getMarkerTone(activeItem.kind)
  const nextCharmName = getCharmName(level + 1)
  const currentCharmName = getCharmName(level)
  const feverValue = Math.min(100, combo * 18)

  useEffect(() => {
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
    if (itemTimeoutRef.current !== null) {
      window.clearTimeout(itemTimeoutRef.current)
      itemTimeoutRef.current = null
    }

    if (!isLoading || isAnswerReady) {
      return
    }

    itemTimeoutRef.current = window.setTimeout(() => {
      setCombo(0)
      setActiveItem(createItem(nextItemId.current++))
    }, itemLifetimeMs)

    return () => {
      if (itemTimeoutRef.current !== null) {
        window.clearTimeout(itemTimeoutRef.current)
        itemTimeoutRef.current = null
      }
    }
  }, [activeItem.id, isLoading, isAnswerReady])

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
      const nextCombo = combo + 1
      const streakBonus = Math.min(4, Math.floor(nextCombo / 3))
      const points = (activeItem.kind === 'bonus' ? 2 : 1) + streakBonus
      setScore((current) => current + points)
      setCombo(nextCombo)
      setScorePulse((current) => current + 1)
      setBursts((current) => [
        ...current,
        {
          id: nextBurstId.current++,
          x: activeItem.x,
          y: activeItem.y,
          value: streakBonus > 0 ? `+${points} streak` : `+${points}`,
          tone: activeItem.kind === 'bonus' || streakBonus > 0 ? 'bonus' : 'good',
        },
      ])
    }

    setActiveItem(createItem(nextItemId.current++))
  }

  if (!isLoading && !isAnswerReady) {
    return null
  }

  if (isAnswerReady) {
    return (
      <div className={`relative flex min-h-0 flex-col overflow-hidden bg-[#f8fbff] p-5 text-slate-950 ${className}`}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(94,214,199,0.22),transparent_28%),radial-gradient(circle_at_82%_16%,rgba(255,111,157,0.18),transparent_24%),linear-gradient(180deg,#ffffff,#f5f9ff_52%,#fff8fb)]" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[1.3rem] font-black leading-tight text-slate-950">Answer ready</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">Final score: {score} points.</p>
          </div>
          <span className="rounded-full bg-white/72 px-3 py-1 text-[11px] font-black text-slate-700">
            {score} pts
          </span>
        </div>

        {onViewAnswer ? (
          <button
            type="button"
            onClick={onViewAnswer}
            className="relative mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:brightness-105"
          >
            View answer
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`relative flex min-h-0 flex-col overflow-hidden bg-[#f8fbff] text-slate-950 ${className}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(94,214,199,0.24),transparent_24%),radial-gradient(circle_at_84%_14%,rgba(255,111,157,0.18),transparent_24%),radial-gradient(circle_at_54%_72%,rgba(37,99,235,0.16),transparent_32%),linear-gradient(180deg,#ffffff_0%,#f4f8ff_48%,#fff7fb_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(37,99,235,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.07)_1px,transparent_1px)] [background-size:28px_28px] animate-[gala-grid-drift_8s_linear_infinite]" />

      <div className="relative z-10 flex shrink-0 items-start justify-between gap-4 px-5 pb-2 pt-[max(18px,env(safe-area-inset-top))] sm:px-7 lg:px-8">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#2563eb]">Mini game</p>
          <h3 className="mt-1 text-[1.55rem] font-black leading-none text-slate-950 sm:text-[1.9rem]">Pin Rush</h3>
          <p className="mt-2 max-w-[34rem] text-sm leading-6 text-slate-600">Chain pins for streak boosts, grab stars, and unlock tiny gala charms while AI finishes.</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-white/70 px-4 text-sm font-black text-slate-700 backdrop-blur transition hover:bg-white hover:text-[#2563eb]"
          >
            Close
          </button>
        ) : null}
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-2 overflow-x-auto px-5 py-2 sm:px-7 lg:px-8">
        <span
          key={scorePulse}
          className="inline-flex h-9 shrink-0 items-center rounded-full bg-slate-950 px-4 text-[12px] font-black text-white animate-[gala-score-pop_260ms_ease-out]"
        >
          {score} pts
        </span>
        <span className="inline-flex h-9 shrink-0 items-center rounded-full bg-white/68 px-4 text-[12px] font-black text-slate-700 backdrop-blur">
          Lvl {level}
        </span>
        <span className="inline-flex h-9 shrink-0 items-center rounded-full bg-white/68 px-4 text-[12px] font-black text-slate-700 backdrop-blur">
          {getComboLabel(combo)}
        </span>
        <span className="inline-flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-white/54 px-4 text-[12px] font-bold text-slate-600 backdrop-blur">
          <span className="truncate">{loadingMessage}</span>
          <LoadingDots />
        </span>
      </div>

      <div className="relative z-10 grid shrink-0 grid-cols-[1fr_auto] items-center gap-3 px-5 py-2 sm:px-7 lg:px-8">
        <div className="min-w-0 rounded-full bg-white/48 px-3 py-2 backdrop-blur">
          <div className="flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">
            <span className="truncate">{currentCharmName}</span>
            <span>{Math.round(feverValue)}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/70">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb,#5ed6c7,#ffcc4d)] transition-all duration-300"
              style={{ width: `${Math.max(8, feverValue)}%` }}
            />
          </div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fff8df] text-[#c77a00] animate-[gala-charm-wiggle_1.8s_ease-in-out_infinite]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5">
            <path d="m12 3.8 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L12 3.8Z" />
          </svg>
        </div>
      </div>

      <div className="relative z-0 min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-x-6 top-[17%] h-[11px] rounded-full bg-[linear-gradient(90deg,transparent,rgba(37,99,235,0.42),rgba(255,111,157,0.22),transparent)] animate-[gala-lane-glide_5s_ease-in-out_infinite]" />
        <div className="absolute inset-x-5 top-[43%] h-[13px] rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,196,87,0.5),rgba(94,214,199,0.34),transparent)] animate-[gala-lane-glide_5.8s_ease-in-out_infinite]" />
        <div className="absolute inset-x-8 top-[69%] h-[10px] rounded-full bg-[linear-gradient(90deg,transparent,rgba(124,179,255,0.44),rgba(255,158,186,0.24),transparent)] animate-[gala-lane-glide_6.2s_ease-in-out_infinite]" />
        <div className="absolute left-[16%] top-0 h-full w-[10px] bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.08),transparent)]" />
        <div className="absolute left-[55%] top-0 h-full w-[12px] bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.07),transparent)]" />
        <div className="absolute left-[82%] top-0 h-full w-[10px] bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.07),transparent)]" />
        <div className="absolute left-[11%] top-[24%] h-3 w-3 rounded-full bg-white/86" />
        <div className="absolute left-[31%] top-[54%] h-2.5 w-2.5 rounded-full bg-[#5ed6c7]" />
        <div className="absolute left-[47%] top-[76%] h-2.5 w-2.5 rounded-full bg-[#ffcc4d]" />
        <div className="absolute left-[74%] top-[34%] h-2.5 w-2.5 rounded-full bg-[#ff6f9d]" />
        <div className="absolute inset-0 animate-[gala-map-breathe_4s_ease-in-out_infinite] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.2),transparent_54%)]" />

        <div className="relative h-full min-h-[390px]">
          {bursts.map((burst) => (
            <span
              key={burst.id}
              className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 text-[18px] font-black ${
                burst.tone === 'bad' ? 'text-[#e24d78]' : burst.tone === 'bonus' ? 'text-[#c77a00]' : 'text-[#0f62d6]'
              } animate-[gala-burst-pop_620ms_ease-out]`}
              style={{ left: `${burst.x}%`, top: `${burst.y}%` }}
            >
              {burst.value}
            </span>
          ))}

          {chibiImage ? (
            <div className="absolute left-5 top-5 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white/76 backdrop-blur">
              <img src={chibiImage} alt="" className="h-full w-full object-contain" loading="lazy" />
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleTap}
            className={`absolute flex h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ${markerTone.button} transition-transform duration-150 hover:scale-105 active:scale-95 animate-[gala-target-float_1.6s_ease-in-out_infinite]`}
            style={{ left: `${activeItem.x}%`, top: `${activeItem.y}%` }}
            aria-label={`Tap the ${getItemLabel(activeItem.kind)}`}
          >
            <span
              className={`absolute rounded-full border ${markerTone.ring} animate-[gala-ring-pulse_900ms_ease-out_infinite]`}
              style={{
                inset: '-18px',
              }}
            />
            <span
              className={`absolute rounded-full border ${markerTone.ringSoft} animate-[gala-ring-pulse_900ms_ease-out_infinite]`}
              style={{
                inset: '-30px',
                animationDelay: '180ms',
              }}
            />
            <span className="absolute -top-8 rounded-full bg-white/76 px-2.5 py-1 text-[11px] font-black text-slate-700 backdrop-blur">
              {markerTone.label}
            </span>
            <MarkerGlyph kind={activeItem.kind} />
          </button>
        </div>
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-3 px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-3 text-[12px] font-bold text-slate-600 sm:px-7 lg:px-8">
        <span className="w-24 shrink-0 truncate">{nextCharmName}</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/64">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#ffcc4d,#ff6f9d,#5ed6c7)] transition-all duration-300"
            style={{ width: `${Math.max(8, progressValue)}%` }}
          />
        </div>
        <span className="w-24 shrink-0 truncate text-right">{levelScore}/{currentTarget}</span>
      </div>
    </div>
  )
}
