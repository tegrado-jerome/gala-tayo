// Draws a guide's 1200x630 link-preview card (top photo, title, place count) in the
// prerender's browser and saves it as a JPG, so every shared guide link gets its own preview.
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

// Card photos come from the 640px card size; the preview needs the 1280px one.
const largePhoto = (url) => url?.replace('/cdn-cgi/image/width=640,', '/cdn-cgi/image/width=1280,') ?? null

// The card is drawn on about:blank, so fonts are inlined rather than fetched cross-origin.
const fontCache = new Map()
async function fontDataUrl(fontDir, file) {
  if (!fontCache.has(file)) fontCache.set(file, `data:font/woff2;base64,${(await readFile(path.join(fontDir, file))).toString('base64')}`)
  return fontCache.get(file)
}

function cardHtml({ fonts, title, kicker, footnote, photoUrl }) {
  const photo = largePhoto(photoUrl)
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'DM Sans'; font-weight: 100 1000; src: url(${fonts.body}) format('woff2'); }
  @font-face { font-family: 'Fraunces'; font-weight: 100 900; src: url(${fonts.display}) format('woff2'); }
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; background: #111111; font-family: 'DM Sans', sans-serif; color: #ffffff; }
  .card { position: relative; width: 100%; height: 100%; padding: 64px 72px; display: flex; flex-direction: column; }
  .photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(10,10,10,.92) 0%, rgba(10,10,10,.78) 48%, rgba(10,10,10,.2) 100%), linear-gradient(0deg, rgba(10,10,10,.55) 0%, rgba(10,10,10,0) 40%); }
  .sun { position: absolute; right: -120px; bottom: -220px; width: 640px; height: 640px; border-radius: 50%; background: #34e0a1; opacity: .9; }
  .brand, .body, .foot { position: relative; }
  .brand { display: flex; align-items: center; gap: 14px; font: 600 34px/1 'Fraunces', serif; letter-spacing: -.02em; }
  .body { margin-top: auto; max-width: 820px; }
  .kicker { font-size: 22px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #34e0a1; }
  h1 { margin-top: 14px; font: 600 76px/1.04 'Fraunces', serif; letter-spacing: -.025em; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .foot { margin-top: 32px; display: flex; gap: 28px; font-size: 26px; font-weight: 600; color: rgba(255,255,255,.86); }
</style></head><body><div class="card">
  ${photo ? `<img class="photo" src="${escapeHtml(photo)}" alt="">` : '<div class="sun"></div>'}
  <div class="shade"></div>
  <div class="brand"><svg width="52" height="52" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="18" fill="#111111" stroke="rgba(255,255,255,.25)"/><path d="M20 35a12 12 0 0 1 24 0Z" fill="#34e0a1"/><rect x="12" y="38" width="40" height="4" rx="2" fill="#fff"/><rect x="19" y="45.5" width="26" height="4" rx="2" fill="#fff" opacity=".75"/><rect x="26" y="53" width="12" height="4" rx="2" fill="#fff" opacity=".5"/></svg>galatayo</div>
  <div class="body">
    <p class="kicker">${escapeHtml(kicker)}</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="foot"><span>${escapeHtml(footnote)}</span><span>galatayo.app</span></p>
  </div>
</div></body></html>`
}

/** Renders one card with an open Playwright page and writes it to `outputPath`. */
export async function renderGuideCard(page, card, outputPath) {
  await page.setViewportSize({ width: 1200, height: 630 })
  const fonts = { body: await fontDataUrl(card.fontDir, 'dm-sans-latin.woff2'), display: await fontDataUrl(card.fontDir, 'fraunces-latin.woff2') }
  await page.setContent(cardHtml({ ...card, fonts }), { waitUntil: 'load', timeout: 30000 })
  await page.evaluate(async () => {
    await document.fonts.ready
    const photo = document.querySelector('.photo')
    // A photo that fails to load falls back to the plain brand card.
    if (photo && !(photo.complete && photo.naturalWidth > 0)) photo.replaceWith(Object.assign(document.createElement('div'), { className: 'sun' }))
  })
  await mkdir(path.dirname(outputPath), { recursive: true })
  await page.screenshot({ path: outputPath, type: 'jpeg', quality: 82 })
}
