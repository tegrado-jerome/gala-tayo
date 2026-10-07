import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ShareNetwork } from '@phosphor-icons/react/dist/csr/ShareNetwork'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { Button, Skeleton, cx } from '../ui'
import { lockBodyScroll, unlockBodyScroll } from '../../utils/bodyScrollLock'
import { shareImage } from '../../utils/storyCanvas'

type Props = {
  /** Draws the story; called once when the preview opens. */
  render: () => Promise<Blob | null>
  fileName: string
  title: string
  shareText?: string
  /** Read by screen readers in place of the image. */
  summary: string
  label: string
  onClose: () => void
  onShared?: (result: 'shared' | 'downloaded') => void
}

type State = { status: 'rendering' } | { status: 'ready'; blob: Blob; url: string } | { status: 'failed' }

/** Full-screen 9:16 preview of a rendered story PNG with one Share action. */
function StoryPreview({ render, fileName, title, shareText, summary, label, onClose, onShared }: Props) {
  const [state, setState] = useState<State>({ status: 'rendering' })
  const [message, setMessage] = useState('')
  const [isSharing, setIsSharing] = useState(false)
  const shareRef = useRef<HTMLButtonElement>(null)
  const renderRef = useRef(render)

  useEffect(() => {
    let url: string | null = null
    let isActive = true
    renderRef
      .current()
      .then((blob) => {
        if (!isActive) return
        if (!blob) {
          setState({ status: 'failed' })
          return
        }
        url = URL.createObjectURL(blob)
        setState({ status: 'ready', blob, url })
      })
      .catch(() => isActive && setState({ status: 'failed' }))
    return () => {
      isActive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [])

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
    if (state.status !== 'ready') return
    setIsSharing(true)
    setMessage('')
    try {
      const result = await shareImage(state.blob, fileName, title, shareText)
      if (result === 'downloaded') setMessage('Saved to your downloads. Post it to your story!')
      if (result !== 'cancelled') onShared?.(result)
    } finally {
      setIsSharing(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[7500] flex flex-col items-center justify-center gap-4 bg-[rgba(17,17,17,0.94)] px-4 pt-[max(env(safe-area-inset-top,0px),16px)] pb-[max(env(safe-area-inset-bottom,0px),16px)] motion-safe:animate-[g-fade_300ms_var(--ease-g)_both]"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        className="relative overflow-hidden rounded-[12px] bg-[#1d1d1d] ring-1 ring-white/10"
        style={{ aspectRatio: '9 / 16', height: 'min(calc(100dvh - 140px), calc((100vw - 32px) * 16 / 9), 860px)' }}
      >
        {state.status === 'ready' ? (
          <img src={state.url} alt={summary} className="block h-full w-full motion-safe:animate-[g-fade_300ms_var(--ease-g)_both]" />
        ) : state.status === 'failed' ? (
          <p className="grid h-full place-items-center px-6 text-center text-[15px] text-white">Couldn't make the story. Close and try again.</p>
        ) : (
          <>
            <Skeleton className="absolute inset-0 !rounded-none opacity-20" />
            <p className="absolute inset-x-0 bottom-6 text-center text-[13px] text-white/70" aria-live="polite">
              Making your story…
            </p>
          </>
        )}
      </div>
      <div className="flex w-full max-w-[420px] gap-3">
        <Button variant="soft" className="flex-1" onClick={onClose}>
          <X aria-hidden="true" />
          Close
        </Button>
        <button
          ref={shareRef}
          type="button"
          className={cx('g-btn g-btn-ink', 'flex-[2] !bg-white !text-[#111111]')}
          onClick={() => void share()}
          data-loading={isSharing || state.status === 'rendering' || undefined}
          aria-busy={isSharing || state.status === 'rendering' || undefined}
          disabled={state.status !== 'ready' || isSharing}
        >
          <ShareNetwork aria-hidden="true" />
          Share story
        </button>
      </div>
      <p className="min-h-5 text-center text-[13px] text-white" aria-live="polite">
        {message}
      </p>
    </div>,
    document.body,
  )
}

export default StoryPreview
