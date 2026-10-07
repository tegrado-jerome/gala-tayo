import { useEffect, useState } from 'react'
import { DownloadSimple } from '@phosphor-icons/react/dist/csr/DownloadSimple'
import { ShareNetwork } from '@phosphor-icons/react/dist/csr/ShareNetwork'
import { Button } from '../ui'
import { leadPick, type GalaTodayPost } from '../../utils/galaToday'
import { getPlaceCardPhoto } from '../../utils/placeGalleryPhotos'
import { getSiteOrigin } from '../../utils/seo'
import { withShareRef } from '../../utils/shareRef'
import { shareImage } from '../../utils/storyCanvas'
import { renderMemeCard } from './memeCardDraw'

type Rendered = { blob: Blob; url: string } | null

/**
 * The post's meme: the lead pick's HD photo with the top/bottom captions, drawn as a 1080×1350 PNG.
 * The same captions show over the card photo straight away, so nothing jumps while the PNG renders.
 */
function MemeCard({ post }: { post: GalaTodayPost }) {
  const [rendered, setRendered] = useState<Rendered>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const lead = leadPick(post)
  const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'

  useEffect(() => {
    let active = true
    let url: string | null = null
    void renderMemeCard(post)
      .then((blob) => {
        if (!active || !blob) return
        url = URL.createObjectURL(blob)
        setRendered({ blob, url })
      })
      .catch(() => undefined)
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [post])

  const share = async () => {
    setBusy(true)
    setMessage('')
    try {
      const blob = rendered?.blob ?? (await renderMemeCard(post))
      if (!blob) {
        setMessage("Couldn't make the image on this device. Try the link instead.")
        return
      }
      const result = await shareImage(blob, `galatayo-${post.slug}.png`, post.title, `${post.title} ${withShareRef(`${getSiteOrigin()}/today/${post.slug}`, 'story')}`)
      if (result === 'downloaded') setMessage('Saved to your downloads. Post it and tag your friends!')
    } finally {
      setBusy(false)
    }
  }

  const alt = `Meme: "${post.meme.top}" / "${post.meme.bottom}"${post.format === 'guess-the-place' ? '' : `, over a photo of ${lead.name}`}`
  const photo = getPlaceCardPhoto(lead.slug)

  return (
    <figure className="t-meme">
      <div className="t-meme-frame">
        {rendered ? (
          <img src={rendered.url} alt={alt} width={1080} height={1350} />
        ) : (
          <div className="t-meme-draft" role="img" aria-label={alt}>
            {photo ? <img src={photo} alt="" decoding="async" fetchPriority="high" /> : null}
            <span className="t-meme-sticker">{post.sticker}</span>
            <span className="t-meme-cap t-meme-top">{post.meme.top}</span>
            <span className="t-meme-cap t-meme-bottom">{post.meme.bottom}</span>
          </div>
        )}
      </div>
      <figcaption className="t-meme-actions">
        <Button variant="ink" onClick={() => void share()} disabled={busy}>
          {canShareFiles ? <ShareNetwork aria-hidden="true" /> : <DownloadSimple aria-hidden="true" />}
          {busy ? 'Making your meme…' : canShareFiles ? 'Share the meme' : 'Save the meme'}
        </Button>
        <span className="g-xs g-mut" role="status" aria-live="polite">
          {message}
        </span>
      </figcaption>
    </figure>
  )
}

export default MemeCard
