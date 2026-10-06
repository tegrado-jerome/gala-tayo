import type { PlaceStoryText } from '../../utils/placeStory'
import {
  BODY_FONT,
  DISPLAY_FONT,
  STORY_H,
  STORY_INK,
  STORY_MINT,
  STORY_W,
  STORY_WHITE,
  drawCover,
  drawWordmark,
  fitText,
  loadStoryFonts,
  loadStoryImage,
  renderStory,
  wrapLines,
  type StoryImage,
} from '../../utils/storyCanvas'

const PAD = 72
const TEXT_W = STORY_W - PAD * 2

export type PlaceStory = PlaceStoryText & { photos: Array<{ url: string; credit: string | null }> }

function draw(ctx: CanvasRenderingContext2D, story: PlaceStory, photo: StoryImage, credit: string | null) {
  ctx.fillStyle = STORY_INK
  ctx.fillRect(0, 0, STORY_W, STORY_H)
  if (photo) drawCover(ctx, photo, 0, 0, STORY_W, STORY_H)

  // Shade the top a little for the phone's story bar, and the bottom fully for the text.
  const top = ctx.createLinearGradient(0, 0, 0, 320)
  top.addColorStop(0, 'rgba(17,17,17,0.45)')
  top.addColorStop(1, 'rgba(17,17,17,0)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, STORY_W, 320)

  // Measure the text block bottom-up so it always sits just above the footer.
  ctx.textBaseline = 'alphabetic'
  const name = fitText(ctx, story.name, (size) => `600 ${size}px ${DISPLAY_FONT}`, [128, 112, 96, 84, 72], TEXT_W, 3)
  const nameLineH = Math.round(name.size * 1.04)
  ctx.font = `400 40px ${BODY_FONT}`
  const lineRows = story.line ? wrapLines(ctx, story.line, TEXT_W, 4) : []
  const lineH = 56

  const footerTop = 1700
  const lineBlock = lineRows.length ? (story.lineLabel ? 56 : 0) + lineRows.length * lineH : 0
  const nameBlock = name.lines.length * nameLineH
  const kickerBlock = story.kicker ? 64 : 0
  const gap = lineRows.length ? 44 : 0
  const startY = footerTop - 56 - lineBlock - gap - nameBlock - kickerBlock

  const shade = ctx.createLinearGradient(0, startY - 420, 0, startY + 160)
  shade.addColorStop(0, 'rgba(17,17,17,0)')
  shade.addColorStop(1, 'rgba(17,17,17,0.92)')
  ctx.fillStyle = shade
  ctx.fillRect(0, startY - 420, STORY_W, 580)
  ctx.fillStyle = 'rgba(17,17,17,0.92)'
  ctx.fillRect(0, startY + 160, STORY_W, STORY_H - startY - 160)

  let y = startY
  if (story.kicker) {
    ctx.fillStyle = STORY_MINT
    ctx.font = `700 30px ${BODY_FONT}`
    ctx.letterSpacing = '4px'
    ctx.fillText(story.kicker, PAD, y + 30)
    ctx.letterSpacing = '0px'
    y += kickerBlock
  }

  ctx.fillStyle = STORY_WHITE
  ctx.font = `600 ${name.size}px ${DISPLAY_FONT}`
  ctx.letterSpacing = `${-Math.round(name.size * 0.02)}px`
  name.lines.forEach((row, index) => ctx.fillText(row, PAD - 4, y + name.size * 0.86 + index * nameLineH))
  ctx.letterSpacing = '0px'
  y += nameBlock + gap

  if (lineRows.length) {
    if (story.lineLabel) {
      ctx.fillStyle = STORY_MINT
      ctx.font = `700 28px ${BODY_FONT}`
      ctx.letterSpacing = '3px'
      ctx.fillText(story.lineLabel.toUpperCase(), PAD, y + 28)
      ctx.letterSpacing = '0px'
      y += 56
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = `400 40px ${BODY_FONT}`
    lineRows.forEach((row, index) => ctx.fillText(row, PAD, y + 40 + index * lineH))
  }

  if (credit && photo) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = `400 22px ${BODY_FONT}`
    ctx.fillText(credit, PAD, footerTop)
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, footerTop + 40)
  ctx.lineTo(STORY_W - PAD, footerTop + 40)
  ctx.stroke()

  drawWordmark(ctx, PAD, 1836)
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  let linkSize = 28
  ctx.font = `500 ${linkSize}px ${BODY_FONT}`
  while (linkSize > 20 && ctx.measureText(story.link).width > 560) {
    linkSize -= 2
    ctx.font = `500 ${linkSize}px ${BODY_FONT}`
  }
  ctx.textAlign = 'right'
  ctx.fillText(story.link, STORY_W - PAD, 1826, 600)
  ctx.textAlign = 'left'
}

export async function renderPlaceStory(story: PlaceStory) {
  const [loaded] = await Promise.all([loadStoryImage(story.photos.map((photo) => photo.url)), loadStoryFonts()])
  // The credit always belongs to the photo that actually loaded.
  const credit = loaded ? story.photos[loaded.index].credit : null
  return renderStory((ctx, withPhotos) => draw(ctx, story, withPhotos && loaded ? loaded.image : null, credit))
}
