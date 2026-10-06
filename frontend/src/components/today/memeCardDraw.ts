import { photoCreditLine } from '../../utils/placeStory'
import type { GalaTodayPost } from '../../utils/galaToday'
import type { PlaceGalleryPhoto } from '../../utils/placeGalleryPhotos'
import { BODY_FONT, STORY_INK, STORY_MINT, STORY_WHITE, drawCover, drawWordmark, fitText, loadStoryFonts, loadStoryImage, renderStory, type StoryImage } from '../../utils/storyCanvas'

// 4:5 portrait: the size Instagram and Facebook feeds show in full.
export const MEME_W = 1080
export const MEME_H = 1350
const PAD = 64
const TEXT_W = MEME_W - PAD * 2
const CAPTION_FONT = (size: number) => `800 ${size}px ${BODY_FONT}`
const CAPTION_SIZES = [88, 80, 72, 64, 58]

type MemePhoto = { url: string; credit: string | null; placeName: string }

function drawSticker(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.save()
  ctx.font = `800 30px ${BODY_FONT}`
  ctx.letterSpacing = '2px'
  const label = text.toUpperCase()
  const width = Math.min(ctx.measureText(label).width + 48, TEXT_W)
  const height = 58
  ctx.translate(x, y)
  ctx.rotate((-2 * Math.PI) / 180)
  ctx.fillStyle = STORY_INK
  ctx.beginPath()
  ctx.roundRect(5, 5, width, height, 29)
  ctx.fill()
  ctx.fillStyle = STORY_MINT
  ctx.strokeStyle = STORY_INK
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(0, 0, width, height, 29)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = STORY_INK
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 24, height / 2 + 2, width - 48)
  ctx.restore()
}

function drawCaption(ctx: CanvasRenderingContext2D, lines: string[], size: number, top: number) {
  ctx.save()
  ctx.font = CAPTION_FONT(size)
  ctx.letterSpacing = `${-Math.round(size * 0.02)}px`
  ctx.fillStyle = STORY_WHITE
  ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 2
  const lineH = Math.round(size * 1.08)
  lines.forEach((line, index) => ctx.fillText(line, PAD, top + size * 0.86 + index * lineH))
  ctx.restore()
  return lines.length * lineH
}

function draw(ctx: CanvasRenderingContext2D, post: GalaTodayPost, photo: StoryImage, meta: MemePhoto | null) {
  ctx.fillStyle = STORY_INK
  ctx.fillRect(0, 0, MEME_W, MEME_H)
  if (photo) drawCover(ctx, photo, 0, 0, MEME_W, MEME_H)

  // Soft shade top and bottom only, so the photo stays the star and the captions stay readable.
  const top = ctx.createLinearGradient(0, 0, 0, 560)
  top.addColorStop(0, 'rgba(17,17,17,0.72)')
  top.addColorStop(0.6, 'rgba(17,17,17,0.28)')
  top.addColorStop(1, 'rgba(17,17,17,0)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, MEME_W, 560)
  const bottom = ctx.createLinearGradient(0, MEME_H - 640, 0, MEME_H)
  bottom.addColorStop(0, 'rgba(17,17,17,0)')
  bottom.addColorStop(0.45, 'rgba(17,17,17,0.55)')
  bottom.addColorStop(1, 'rgba(17,17,17,0.9)')
  ctx.fillStyle = bottom
  ctx.fillRect(0, MEME_H - 640, MEME_W, 640)

  drawSticker(ctx, post.sticker, PAD, 64)
  const topCaption = fitText(ctx, post.meme.top, CAPTION_FONT, CAPTION_SIZES, TEXT_W, 3)
  drawCaption(ctx, topCaption.lines, topCaption.size, 158)

  // The bottom caption sits on top of the footer: credit line, rule, wordmark + place.
  const footerY = MEME_H - 64
  const creditY = footerY - 78
  const bottomCaption = fitText(ctx, post.meme.bottom, CAPTION_FONT, CAPTION_SIZES, TEXT_W, 3)
  const bottomH = bottomCaption.lines.length * Math.round(bottomCaption.size * 1.08)
  drawCaption(ctx, bottomCaption.lines, bottomCaption.size, creditY - 44 - bottomH)

  ctx.save()
  if (meta?.credit && photo) {
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.font = `400 22px ${BODY_FONT}`
    ctx.fillText(meta.credit, PAD, creditY, TEXT_W)
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, creditY + 26)
  ctx.lineTo(MEME_W - PAD, creditY + 26)
  ctx.stroke()
  ctx.restore()

  drawWordmark(ctx, PAD, footerY)
  if (meta?.placeName) {
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.88)'
    ctx.font = `600 28px ${BODY_FONT}`
    ctx.textAlign = 'right'
    ctx.fillText(meta.placeName, MEME_W - PAD, footerY - 8, 520)
    ctx.restore()
  }
}

/** The post's photos in lead-first order, each with the credit its licence asks for. */
export async function memePhotos(post: GalaTodayPost): Promise<MemePhoto[]> {
  const manifest = (await import('../../data/placeGalleryPhotos.json')).default as Record<string, PlaceGalleryPhoto[]>
  const ordered = [...post.picks].sort((left, right) => Number(right.slug === post.leadSlug) - Number(left.slug === post.leadSlug))
  return ordered.flatMap((pick) => {
    const photo = manifest[pick.slug]?.[0]
    // Guess the place: never print the answer's name on the card.
    const placeName = post.format === 'guess-the-place' ? '' : `${pick.name}, ${pick.city}`
    return photo ? [{ url: photo.url, credit: photoCreditLine(photo), placeName }] : []
  })
}

/** Renders the 1080×1350 meme PNG in the browser. The credit always matches the photo that loaded. */
export async function renderMemeCard(post: GalaTodayPost) {
  const photos = await memePhotos(post)
  const [loaded] = await Promise.all([
    loadStoryImage(photos.map((photo) => photo.url)),
    loadStoryFonts(),
    document.fonts.load(CAPTION_FONT(80)).catch(() => undefined),
  ])
  const meta = loaded ? photos[loaded.index] : null
  return renderStory((ctx, withPhotos) => draw(ctx, post, withPhotos && loaded ? loaded.image : null, meta), MEME_W, MEME_H)
}
