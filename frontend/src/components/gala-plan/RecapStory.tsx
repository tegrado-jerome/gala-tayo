import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FilmStrip as Film } from '@phosphor-icons/react/dist/csr/FilmStrip'
import { ShareNetwork as Share2 } from '@phosphor-icons/react/dist/csr/ShareNetwork'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { Button, buttonClass, cx } from '../ui'
import type { GalaPlanDetail } from '../../utils/galaPlansApi'
import { estimatePerHead, formatPeso, getPlanDate } from '../../utils/galaPlanTrip'
import { lockBodyScroll, unlockBodyScroll } from '../../utils/bodyScrollLock'

const W = 1080
const H = 1920
const PIN_R = 64
const ROUTE_BOX = { left: 170, right: 910, top: 780, bottom: 1440 }
const MAX_PINS = 8

type Pin = { x: number; y: number; n: number; imageUrl: string | null }

type Story = {
  eyebrow: string
  lines: string[]
  pins: Pin[]
  city: string | null
  stampLines: string[]
  stampSize: number
  caption: string
  fileName: string
  summary: string
}

function mostCommon(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>()
  for (const value of values) {
    const key = value?.trim()
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

function zigzag(count: number) {
  const { left, right, top, bottom } = ROUTE_BOX
  const midY = (top + bottom) / 2
  return Array.from({ length: count }, (_, index) => ({
    x: count === 1 ? W / 2 : left + (index * (right - left)) / (count - 1),
    y: count === 1 ? midY : midY + (index % 2 ? -1 : 1) * 170,
  }))
}

/** Projects stop coordinates into the route box, keeping the real shape of the route. */
function placePins(items: GalaPlanDetail['items']) {
  const stops = items.slice(0, MAX_PINS)
  const coords = stops.map((item) => (item.place.latitude != null && item.place.longitude != null ? { lat: item.place.latitude, lng: item.place.longitude } : null))
  const known = coords.filter((coord): coord is { lat: number; lng: number } => coord !== null)
  const meanLat = known.reduce((sum, coord) => sum + coord.lat, 0) / Math.max(1, known.length)
  const flat = known.map((coord) => ({ x: coord.lng * Math.cos((meanLat * Math.PI) / 180), y: -coord.lat }))
  const minX = Math.min(...flat.map((p) => p.x))
  const maxX = Math.max(...flat.map((p) => p.x))
  const minY = Math.min(...flat.map((p) => p.y))
  const maxY = Math.max(...flat.map((p) => p.y))
  const spread = Math.max(maxX - minX, maxY - minY)

  let positions: Array<{ x: number; y: number }>
  if (known.length !== stops.length || stops.length < 2 || spread < 1e-6) {
    positions = zigzag(stops.length)
  } else {
    const { left, right, top, bottom } = ROUTE_BOX
    const scale = Math.min((right - left) / Math.max(maxX - minX, 1e-9), (bottom - top) / Math.max(maxY - minY, 1e-9))
    const offsetX = left + (right - left - (maxX - minX) * scale) / 2
    const offsetY = top + (bottom - top - (maxY - minY) * scale) / 2
    positions = flat.map((p) => ({ x: offsetX + (p.x - minX) * scale, y: offsetY + (p.y - minY) * scale }))
  }

  return stops.map((item, index) => ({ ...positions[index], n: index + 1, imageUrl: item.place.image_url ?? null }))
}

function buildStory(plan: GalaPlanDetail, friends: number): Story {
  const stopCount = plan.items.length
  const perHead = estimatePerHead(plan.items, Math.max(1, friends))
  const city = mostCommon(plan.items.map((item) => item.place.city))
  const date = getPlanDate(plan)
  const day = date ? date.toLocaleDateString('en', { weekday: 'short' }) : null
  const lines = [
    `${stopCount} ${stopCount === 1 ? 'stop' : 'stops'}.`,
    friends > 1 ? `${friends} friends.` : null,
    perHead > 0 ? `${formatPeso(perHead)} each.` : 'All free.',
  ].filter((line): line is string => Boolean(line))
  const stampLines = city ? city.toUpperCase().split(/\s+/).slice(0, 2) : []
  const longest = Math.max(1, ...stampLines.map((line) => line.length))

  return {
    eyebrow: ([day, city].filter(Boolean).join(' · ') || 'Gala recap').toUpperCase(),
    lines,
    pins: placePins(plan.items),
    city,
    stampLines,
    stampSize: Math.min(28, Math.floor(150 / (longest * 0.7))),
    caption: truncate(plan.title, 30),
    fileName: `galatayo-${(plan.slug || 'gala').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'gala'}.png`,
    summary: `${lines.join(' ')}${city ? ` ${city}.` : ''} ${plan.title}`,
  }
}

function token(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    const timer = window.setTimeout(() => resolve(null), 8000)
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => {
      window.clearTimeout(timer)
      resolve(image)
    }
    image.onerror = () => {
      window.clearTimeout(timer)
      resolve(null)
    }
    image.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function drawStory(ctx: CanvasRenderingContext2D, story: Story, images: Array<HTMLImageElement | null>) {
  const ink = token('--ink')
  const tara = token('--tara')
  const sea = token('--sea')
  const white = token('--on-ink')
  const fill2 = token('--fill-2')
  const display = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || '"Plus Jakarta Sans", sans-serif'
  const body = getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim() || 'sans-serif'

  ctx.fillStyle = ink
  ctx.fillRect(0, 0, W, H)

  const segment = (W - 120 - 32) / 3
  for (let index = 0; index < 3; index += 1) {
    ctx.globalAlpha = index === 0 ? 1 : 0.3
    ctx.fillStyle = white
    roundRect(ctx, 60 + index * (segment + 16), 72, segment, 8, 4)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = tara
  ctx.font = `700 34px ${body}`
  ctx.letterSpacing = '3px'
  ctx.fillText(story.eyebrow, 60, 210)

  ctx.fillStyle = white
  ctx.font = `700 112px ${display}`
  ctx.letterSpacing = '-3px'
  story.lines.forEach((line, index) => ctx.fillText(line, 56, 340 + index * 122))
  ctx.letterSpacing = '0px'

  if (story.pins.length > 1) {
    ctx.save()
    ctx.strokeStyle = tara
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.setLineDash([2, 24])
    ctx.beginPath()
    story.pins.forEach((pin, index) => (index === 0 ? ctx.moveTo(pin.x, pin.y) : ctx.lineTo(pin.x, pin.y)))
    ctx.stroke()
    ctx.restore()
  }

  story.pins.forEach((pin, index) => {
    ctx.fillStyle = white
    ctx.beginPath()
    ctx.arc(pin.x, pin.y, PIN_R, 0, Math.PI * 2)
    ctx.fill()

    const image = images[index]
    const inner = PIN_R - 8
    ctx.save()
    ctx.beginPath()
    ctx.arc(pin.x, pin.y, inner, 0, Math.PI * 2)
    ctx.clip()
    if (image) {
      const side = Math.min(image.naturalWidth, image.naturalHeight)
      ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, pin.x - inner, pin.y - inner, inner * 2, inner * 2)
    } else {
      ctx.fillStyle = fill2
      ctx.fillRect(pin.x - inner, pin.y - inner, inner * 2, inner * 2)
    }
    ctx.restore()

    const bx = pin.x + PIN_R * 0.72
    const by = pin.y - PIN_R * 0.72
    ctx.fillStyle = white
    ctx.beginPath()
    ctx.arc(bx, by, 27, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = tara
    ctx.beginPath()
    ctx.arc(bx, by, 23, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = ink
    ctx.font = `700 26px ${body}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(pin.n), bx, by + 1)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  })

  if (story.city) {
    const cx = 150
    const cy = 1640
    ctx.globalAlpha = 0.25
    ctx.fillStyle = sea
    ctx.beginPath()
    ctx.arc(cx, cy, 104, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(cx, cy, 90, 0, Math.PI * 2)
    ctx.fill()
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((-10 * Math.PI) / 180)
    ctx.fillStyle = white
    ctx.font = `800 ${story.stampSize}px ${display}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lh = story.stampSize * 1.1
    story.stampLines.forEach((line, index) => ctx.fillText(line, 0, (index - (story.stampLines.length - 1) / 2) * lh))
    ctx.restore()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    ctx.fillStyle = white
    ctx.font = `700 44px ${display}`
    ctx.fillText('New stamp!', 280, 1630)
    ctx.globalAlpha = 0.75
    ctx.font = `500 30px ${body}`
    ctx.fillText(story.caption, 280, 1680)
    ctx.globalAlpha = 1
  } else {
    ctx.fillStyle = white
    ctx.font = `700 44px ${display}`
    ctx.fillText(story.caption, 60, 1660)
  }

  ctx.fillStyle = white
  roundRect(ctx, 60, 1782, 60, 60, 16)
  ctx.fill()
  ctx.fillStyle = tara
  ctx.beginPath()
  ctx.arc(90, 1816, 13, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = ink
  roundRect(ctx, 72, 1820, 36, 5, 2.5)
  ctx.fill()
  roundRect(ctx, 79, 1830, 22, 5, 2.5)
  ctx.fill()
  ctx.fillStyle = white
  ctx.font = `700 42px ${display}`
  ctx.letterSpacing = '-1px'
  ctx.fillText('galatayo', 138, 1826)
  ctx.letterSpacing = '0px'
}

function toBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
}

/** Renders the story card to a PNG. Photos that fail to load (or block CORS) are skipped, never breaking the export. */
async function renderStoryPng(story: Story) {
  try {
    await Promise.all([document.fonts.load('800 112px "Plus Jakarta Sans"'), document.fonts.load('800 28px "Plus Jakarta Sans"'), document.fonts.load('700 34px "Plus Jakarta Sans"')])
  } catch {
    // Fallback fonts are fine.
  }
  const images = await Promise.all(story.pins.map((pin) => (pin.imageUrl ? loadImage(pin.imageUrl) : Promise.resolve(null))))
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  drawStory(ctx, story, images)
  try {
    return await toBlob(canvas)
  } catch {
    drawStory(ctx, story, [])
    return toBlob(canvas)
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

function StoryCard({ story }: { story: Story }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const reduceMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const routePoints = story.pins.map((pin) => `${pin.x},${pin.y}`).join(' ')
  const segment = (W - 120 - 32) / 3

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-full w-full" role="img" aria-label={story.summary}>
      <defs>
        {story.pins.map((pin) => (
          <clipPath key={pin.n} id={`${uid}c${pin.n}`}>
            <circle cx={pin.x} cy={pin.y} r={PIN_R - 8} />
          </clipPath>
        ))}
        <mask id={`${uid}m`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <polyline points={routePoints} fill="none" stroke="#fff" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={reduceMotion ? 0 : 1}>
            {reduceMotion ? null : <animate attributeName="stroke-dashoffset" from="1" to="0" dur="1.4s" begin="0.2s" fill="freeze" calcMode="spline" keySplines="0.2 0.7 0.2 1" keyTimes="0;1" />}
          </polyline>
        </mask>
      </defs>

      <rect width={W} height={H} style={{ fill: 'var(--ink)' }} />
      {[0, 1, 2].map((index) => (
        <rect key={index} x={60 + index * (segment + 16)} y={72} width={segment} height={8} rx={4} style={{ fill: 'var(--on-ink)' }} opacity={index === 0 ? 1 : 0.3} />
      ))}

      <text x={60} y={210} style={{ fill: 'var(--tara)', font: '700 34px var(--font-body)', letterSpacing: '3px' }}>
        {story.eyebrow}
      </text>
      {story.lines.map((line, index) => (
        <text key={line} x={56} y={340 + index * 122} style={{ fill: 'var(--on-ink)', font: '700 112px var(--font-display)', letterSpacing: '-3px' }}>
          {line}
        </text>
      ))}

      {story.pins.length > 1 ? (
        <polyline
          points={routePoints}
          fill="none"
          style={{ stroke: 'var(--tara)' }}
          strokeWidth={8}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="2 24"
          mask={`url(#${uid}m)`}
        />
      ) : null}

      {story.pins.map((pin, index) => (
        <g key={pin.n} className="motion-safe:animate-[g-fade_400ms_var(--ease-g)_both]" style={{ animationDelay: `${200 + index * 160}ms` }}>
          <circle cx={pin.x} cy={pin.y} r={PIN_R} style={{ fill: 'var(--on-ink)' }} />
          <circle cx={pin.x} cy={pin.y} r={PIN_R - 8} style={{ fill: 'var(--fill-2)' }} />
          {pin.imageUrl ? (
            <image href={pin.imageUrl} x={pin.x - PIN_R + 8} y={pin.y - PIN_R + 8} width={(PIN_R - 8) * 2} height={(PIN_R - 8) * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${uid}c${pin.n})`} />
          ) : null}
          <circle cx={pin.x + PIN_R * 0.72} cy={pin.y - PIN_R * 0.72} r={27} style={{ fill: 'var(--on-ink)' }} />
          <circle cx={pin.x + PIN_R * 0.72} cy={pin.y - PIN_R * 0.72} r={23} style={{ fill: 'var(--tara)' }} />
          <text x={pin.x + PIN_R * 0.72} y={pin.y - PIN_R * 0.72 + 1} textAnchor="middle" dominantBaseline="central" style={{ fill: 'var(--ink)', font: '700 26px var(--font-body)' }}>
            {pin.n}
          </text>
        </g>
      ))}

      {story.city ? (
        <>
          <circle cx={150} cy={1640} r={104} style={{ fill: 'var(--sea)' }} opacity={0.25} />
          <circle cx={150} cy={1640} r={90} style={{ fill: 'var(--sea)' }} />
          <g transform="translate(150 1640) rotate(-10)">
            {story.stampLines.map((line, index) => (
              <text
                key={line + index}
                x={0}
                y={(index - (story.stampLines.length - 1) / 2) * story.stampSize * 1.1}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fill: 'var(--on-ink)', font: `800 ${story.stampSize}px var(--font-display)` }}
              >
                {line}
              </text>
            ))}
          </g>
          <text x={280} y={1630} style={{ fill: 'var(--on-ink)', font: '700 44px var(--font-display)' }}>
            New stamp!
          </text>
          <text x={280} y={1680} opacity={0.75} style={{ fill: 'var(--on-ink)', font: '500 30px var(--font-body)' }}>
            {story.caption}
          </text>
        </>
      ) : (
        <text x={60} y={1660} style={{ fill: 'var(--on-ink)', font: '700 44px var(--font-display)' }}>
          {story.caption}
        </text>
      )}

      <rect x={60} y={1782} width={60} height={60} rx={16} style={{ fill: 'var(--on-ink)' }} />
      <path d="M77 1816a13 13 0 0 1 26 0Z" style={{ fill: 'var(--tara)' }} />
      <rect x={72} y={1820} width={36} height={5} rx={2.5} style={{ fill: 'var(--ink)' }} />
      <rect x={79} y={1830} width={22} height={5} rx={2.5} style={{ fill: 'var(--ink)' }} />
      <text x={138} y={1826} style={{ fill: 'var(--on-ink)', font: '700 42px var(--font-display)', letterSpacing: '-1px' }}>
        galatayo
      </text>
    </svg>
  )
}

/** Full-screen 9:16 recap of a gala, shareable as a PNG story. */
export default function RecapStory({ plan, friends = 0, onClose }: { plan: GalaPlanDetail; friends?: number; onClose: () => void }) {
  const story = useMemo(() => buildStory(plan, friends), [plan, friends])
  const pngRef = useRef<Promise<Blob | null> | null>(null)
  const shareRef = useRef<HTMLButtonElement | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    pngRef.current = renderStoryPng(story)
  }, [story])

  useEffect(() => {
    lockBodyScroll()
    shareRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      unlockBodyScroll()
    }
  }, [onClose])

  const share = async () => {
    setIsSharing(true)
    setMessage(null)
    try {
      const blob = await (pngRef.current ?? renderStoryPng(story))
      if (!blob) {
        setMessage('Hindi nagawa ang image. Try again.')
        return
      }
      const file = new File([blob], story.fileName, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: plan.title })
        } catch (error) {
          if ((error as Error).name !== 'AbortError') {
            downloadBlob(blob, story.fileName)
            setMessage('Saved the story image to your downloads.')
          }
        }
      } else {
        downloadBlob(blob, story.fileName)
        setMessage('Saved the story image to your downloads.')
      }
    } finally {
      setIsSharing(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[7500] flex flex-col items-center justify-center gap-4 bg-[var(--ink-hover)] px-4 pt-[max(env(safe-area-inset-top,0px),16px)] pb-[max(env(safe-area-inset-bottom,0px),16px)] motion-safe:animate-[g-fade_200ms_var(--ease-g)_both]"
      role="dialog"
      aria-modal="true"
      aria-label="Gala recap story"
    >
      <div
        className="overflow-hidden rounded-[var(--r-4)] shadow-[var(--sh-3)] ring-1 ring-[color-mix(in_srgb,var(--on-ink)_14%,transparent)] motion-safe:animate-[g-up_320ms_var(--ease-g)_both]"
        style={{ aspectRatio: '9 / 16', height: 'min(calc(100dvh - 120px), calc((100vw - 32px) * 16 / 9), 860px)' }}
      >
        <StoryCard story={story} />
      </div>
      <div className="flex w-full max-w-[420px] gap-3">
        <Button variant="soft" className="flex-1" onClick={onClose}>
          <X aria-hidden="true" />
          Close
        </Button>
        <button
          ref={shareRef}
          type="button"
          className={cx(buttonClass({ variant: 'tara' }), 'flex-[2]')}
          onClick={() => void share()}
          data-loading={isSharing || undefined}
          aria-busy={isSharing || undefined}
          disabled={isSharing}
        >
          <Share2 aria-hidden="true" />
          Share story
        </button>
      </div>
      <p className="g-xs min-h-4 text-center text-[var(--on-ink)]" aria-live="polite">
        {message}
      </p>
    </div>,
    document.body,
  )
}

/** Drop-in button that opens the recap story for a plan. */
export function RecapStoryButton({ plan, friends, className }: { plan: GalaPlanDetail; friends?: number; className?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const close = useCallback(() => {
    setIsOpen(false)
    requestAnimationFrame(() => openerRef.current?.focus())
  }, [])

  return (
    <>
      <button ref={openerRef} type="button" className={cx(buttonClass({ variant: 'soft' }), className)} onClick={() => setIsOpen(true)} disabled={plan.items.length === 0}>
        <Film aria-hidden="true" />
        Recap story
      </button>
      {isOpen ? <RecapStory plan={plan} friends={friends} onClose={close} /> : null}
    </>
  )
}
