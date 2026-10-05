import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button, Sheet } from './ui'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'

type DestructiveConfirmModalProps = {
  isOpen: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  isConfirming?: boolean
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}

export default function DestructiveConfirmModal({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  isConfirming = false,
  onCancel,
  onConfirm,
}: DestructiveConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return
    }

    lockBodyScroll()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isConfirming) {
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      unlockBodyScroll()
    }
  }, [isConfirming, isOpen, onCancel])

  if (!isOpen) {
    return null
  }

  return createPortal(
    <Sheet
      open={isOpen}
      onClose={() => {
        if (!isConfirming) {
          onCancel()
        }
      }}
      title={title}
      labelledBy="destructive-confirm-title"
    >
      <p className="g-mut max-w-[46ch] text-[15px] leading-relaxed">{description}</p>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button variant="line" block onClick={onCancel} disabled={isConfirming}>
          {cancelLabel}
        </Button>
        <Button variant="danger" block onClick={() => void onConfirm()} disabled={isConfirming}>
          {isConfirming ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Sheet>,
    document.body,
  )
}
