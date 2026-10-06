import type { MonthlyWrapped } from '../../utils/galaWrapped'
import { BODY_FONT, DISPLAY_FONT, STORY_H, STORY_INK, STORY_MINT, STORY_SAND, STORY_W, drawWordmark, loadStoryFonts, renderStory, wrapLines } from '../../utils/storyCanvas'

const PAD = 80
const MUTED = '#595959'
const FOREST = '#00553A'
const STAMP_R = 104

export type WrappedStory = { wrapped: MonthlyWrapped; plans: number | null; handle: string | null; link: string }

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many
}

function drawStamp(ctx: CanvasRenderingContext2D, x: number, y: number, city: string, isNew: boolean, tilt: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((tilt * Math.PI) / 180)
  ctx.lineWidth = 4
  if (isNew) {
    ctx.fillStyle = FOREST
    ctx.beginPath()
    ctx.arc(0, 0, STAMP_R, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.strokeStyle = STORY_INK
    ctx.setLineDash([10, 9])
    ctx.beginPath()
    ctx.arc(0, 0, STAMP_R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.strokeStyle = isNew ? 'rgba(255,255,255,0.5)' : 'rgba(17,17,17,0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, STAMP_R - 14, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = isNew ? '#FFFFFF' : STORY_INK
  ctx.textAlign = 'center'
  ctx.font = `700 28px ${DISPLAY_FONT}`
  const rows = wrapLines(ctx, city.toUpperCase(), STAMP_R * 1.5, 2)
  rows.forEach((row, index) => ctx.fillText(row, 0, 8 - (rows.length - 1) * 16 + index * 32))
  ctx.font = `600 18px ${BODY_FONT}`
  ctx.letterSpacing = '2px'
  ctx.fillText(isNew ? 'NEW STAMP' : 'STAMPED', 0, 8 + (rows.length - 1) * 16 + 40)
  ctx.letterSpacing = '0px'
  ctx.textAlign = 'left'
  ctx.restore()
}

function draw(ctx: CanvasRenderingContext2D, story: WrappedStory) {
  const { wrapped } = story
  const [month, year] = wrapped.label.split(' ')
  ctx.fillStyle = STORY_SAND
  ctx.fillRect(0, 0, STORY_W, STORY_H)
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = STORY_MINT
  ctx.beginPath()
  ctx.arc(PAD + 9, 219, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = STORY_INK
  ctx.font = `700 30px ${BODY_FONT}`
  ctx.letterSpacing = '5px'
  ctx.fillText('GALA WRAPPED', PAD + 32, 230)
  ctx.letterSpacing = '0px'

  ctx.font = `600 168px ${DISPLAY_FONT}`
  ctx.letterSpacing = '-5px'
  ctx.fillText(month, PAD - 6, 410)
  ctx.letterSpacing = '0px'
  ctx.fillStyle = MUTED
  ctx.font = `500 40px ${BODY_FONT}`
  ctx.fillText([year, story.handle ? `@${story.handle}` : null].filter(Boolean).join(' · '), PAD, 480)

  const rows: Array<{ value: number; top: string; bottom: string; note?: string }> = [
    { value: wrapped.places, top: plural(wrapped.places, 'place', 'places'), bottom: 'checked in' },
    {
      value: wrapped.cities.length,
      top: plural(wrapped.cities.length, 'city', 'cities'),
      bottom: 'stamped',
      note: wrapped.newCities.length > 0 ? `${wrapped.newCities.length} new` : undefined,
    },
  ]
  if (story.plans !== null) rows.push({ value: story.plans, top: plural(story.plans, 'plan', 'plans'), bottom: 'made' })

  const rowH = 190
  // Fewer stat rows: spread the rest out so the card never has one big gap.
  const firstRow = 700 + (3 - rows.length) * 60
  rows.forEach((row, index) => {
    const baseline = firstRow + index * rowH
    ctx.fillStyle = STORY_INK
    ctx.font = `600 180px ${DISPLAY_FONT}`
    ctx.letterSpacing = '-6px'
    const text = String(row.value)
    ctx.fillText(text, PAD - 8, baseline)
    const numberW = ctx.measureText(text).width
    ctx.letterSpacing = '0px'
    const labelX = PAD + numberW + 36
    ctx.font = `500 46px ${BODY_FONT}`
    ctx.fillText(row.top, labelX, baseline - 68)
    const topW = ctx.measureText(row.top).width
    ctx.fillStyle = MUTED
    ctx.fillText(row.bottom, labelX, baseline - 14)
    if (row.note) {
      ctx.font = `700 28px ${BODY_FONT}`
      const noteW = ctx.measureText(row.note).width + 36
      const noteX = labelX + topW + 20
      ctx.fillStyle = STORY_MINT
      ctx.beginPath()
      ctx.roundRect(noteX, baseline - 110, noteW, 50, 25)
      ctx.fill()
      ctx.fillStyle = STORY_INK
      ctx.fillText(row.note, noteX + 18, baseline - 75)
    }
  })

  const stampsY = firstRow + rows.length * rowH - 90 + (3 - rows.length) * 60
  const cities = wrapped.cities.slice(0, 4)
  const gap = (STORY_W - PAD * 2 - STAMP_R * 2) / Math.max(1, 3)
  cities.forEach((city, index) => {
    const x = PAD + STAMP_R + index * gap
    const y = stampsY + STAMP_R + (index % 2 ? 26 : 0)
    drawStamp(ctx, x, y, city, wrapped.newCities.includes(city), [-8, 6, -3, 9][index])
  })

  if (wrapped.topCategory) {
    const y = 1690
    ctx.fillStyle = MUTED
    ctx.font = `700 26px ${BODY_FONT}`
    ctx.letterSpacing = '4px'
    ctx.fillText('TOP VIBE', PAD, y - 70)
    ctx.letterSpacing = '0px'
    ctx.fillStyle = STORY_INK
    ctx.font = `600 76px ${DISPLAY_FONT}`
    ctx.fillText(wrapped.topCategory.name, PAD - 2, y + 4)
  }

  ctx.strokeStyle = 'rgba(17,17,17,0.14)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, 1752)
  ctx.lineTo(STORY_W - PAD, 1752)
  ctx.stroke()
  drawWordmark(ctx, PAD, 1846, { color: STORY_INK, tileColor: STORY_INK, accent: STORY_MINT, ink: STORY_SAND })
  ctx.fillStyle = MUTED
  ctx.font = `500 28px ${BODY_FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(story.link, STORY_W - PAD, 1836)
  ctx.textAlign = 'left'
}

export async function renderWrappedStory(story: WrappedStory) {
  await loadStoryFonts()
  return renderStory((ctx) => draw(ctx, story))
}
