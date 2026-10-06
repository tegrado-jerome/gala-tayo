/** Shared helpers for 1080x1920 story images drawn on a canvas in the browser. */

export const STORY_W = 1080
export const STORY_H = 1920
export const STORY_INK = '#111111'
export const STORY_WHITE = '#FFFFFF'
export const STORY_MINT = '#34E0A1'
export const STORY_SAND = '#F6F1E7'
export const DISPLAY_FONT = 'Fraunces, Georgia, serif'
export const BODY_FONT = '"DM Sans", system-ui, sans-serif'

export type StoryImage = ImageBitmap | null

/**
 * Loads a photo for the canvas with CORS and without the HTTP cache: a copy the page already showed in an
 * <img> may be cached without CORS headers, which would taint the canvas. The service worker lets CORS
 * requests through to the network untouched.
 */
export async function loadStoryImage(urls: Array<string | null | undefined>): Promise<{ image: ImageBitmap; index: number } | null> {
  for (const [index, url] of urls.entries()) {
    if (!url) continue
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(url, { mode: 'cors', cache: 'no-store', signal: controller.signal })
      if (response.ok) return { image: await createImageBitmap(await response.blob()), index }
    } catch {
      // Try the next photo.
    } finally {
      window.clearTimeout(timer)
    }
  }
  return null
}

export async function loadStoryFonts() {
  try {
    await Promise.all([
      document.fonts.load(`500 96px ${DISPLAY_FONT}`),
      document.fonts.load(`600 96px ${DISPLAY_FONT}`),
      document.fonts.load(`500 32px ${BODY_FONT}`),
      document.fonts.load(`700 32px ${BODY_FONT}`),
    ])
  } catch {
    // Fallback fonts are fine.
  }
}

/** Draws `image` to fill the box, cropped from the centre (CSS object-fit: cover). */
export function drawCover(ctx: CanvasRenderingContext2D, image: ImageBitmap, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.width, h / image.height)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h)
}

/** Splits text into lines that fit `maxWidth` with the current font; the last allowed line gets an ellipsis. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (let index = 0; index < words.length; index += 1) {
    const next = line ? `${line} ${words[index]}` : words[index]
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next
      continue
    }
    lines.push(line)
    line = words[index]
    if (lines.length === maxLines) {
      line = ''
      const last = lines[maxLines - 1]
      let clipped = last
      while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) clipped = clipped.slice(0, -1)
      lines[maxLines - 1] = `${clipped.replace(/[\s,.;:]+$/, '')}…`
      break
    }
  }
  if (line && lines.length < maxLines) lines.push(line)
  return lines
}

/** Shrinks the font size until the text fits in `maxLines`; returns the size used and the lines. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, sizes: number[], maxWidth: number, maxLines: number) {
  for (const size of sizes) {
    ctx.font = font(size)
    const lines = wrapLines(ctx, text, maxWidth, maxLines + 1)
    if (lines.length <= maxLines) return { size, lines }
  }
  const size = sizes[sizes.length - 1]
  ctx.font = font(size)
  return { size, lines: wrapLines(ctx, text, maxWidth, maxLines) }
}

/** The GalaTayo golden-hour mark (sunset arcs over a wave) plus the wordmark, drawn at (x, baseline y). */
export function drawWordmark(ctx: CanvasRenderingContext2D, x: number, y: number, { color = STORY_WHITE, outer = STORY_MINT, inner = STORY_WHITE, accent = STORY_MINT } = {}) {
  // Same paths as the SVG logo (viewBox 6 12 52 38), scaled to 66px wide.
  const scale = 66 / 52
  ctx.save()
  ctx.translate(x - 6 * scale, y - 44 - 12 * scale)
  ctx.scale(scale, scale)
  ctx.lineCap = 'round'
  const stroke = (path: string, colour: string, width: number) => {
    ctx.strokeStyle = colour
    ctx.lineWidth = width
    ctx.stroke(new Path2D(path))
  }
  stroke('M10 38a22 22 0 0 1 44 0', outer, 6.5)
  stroke('M19.5 38a12.5 12.5 0 0 1 25 0', inner, 6.5)
  ctx.fillStyle = accent
  ctx.fill(new Path2D('M27 38a5 5 0 0 1 10 0Z'))
  stroke('M8 47c5-3.5 10 3.5 16 0s10-3.5 16 0 10 3.5 16 0', accent, 4.5)
  ctx.restore()
  ctx.fillStyle = color
  ctx.font = `600 42px ${DISPLAY_FONT}`
  ctx.letterSpacing = '-1px'
  ctx.fillText('galatayo', x + 80, y)
  ctx.letterSpacing = '0px'
}

export function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, 'image/png')
    } catch {
      // A tainted canvas throws; the caller redraws without photos.
      resolve(null)
    }
  })
}

/** Draws with photos, and falls back to a photo-free version if the canvas cannot be exported. */
export async function renderStory(draw: (ctx: CanvasRenderingContext2D, withPhotos: boolean) => void, width = STORY_W, height = STORY_H) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  draw(ctx, true)
  const blob = await canvasToPng(canvas)
  if (blob) return blob
  ctx.clearRect(0, 0, width, height)
  draw(ctx, false)
  return canvasToPng(canvas)
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

export type ShareImageResult = 'shared' | 'downloaded' | 'cancelled'

/** Opens the share sheet with the PNG where the browser supports files; otherwise saves it. */
export async function shareImage(blob: Blob, fileName: string, title: string, text?: string): Promise<ShareImageResult> {
  const file = new File([blob], fileName, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text })
      return 'shared'
    } catch (error) {
      if ((error as Error).name === 'AbortError') return 'cancelled'
    }
  }
  downloadBlob(blob, fileName)
  return 'downloaded'
}
