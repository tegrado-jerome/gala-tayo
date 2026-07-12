import { useEffect } from 'react'
import { AppButton } from './AppUI'
import { AppIcon } from './AppIcon'
import { CenteredModal } from './layout/Primitives'
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

  return (
    <CenteredModal
      isOpen={isOpen}
      onClose={() => {
        if (!isConfirming) {
          onCancel()
        }
      }}
      ariaLabel={title}
      maxWidth="sm"
      panelClassName="overflow-hidden border border-[rgba(220,38,38,0.14)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)]"
    >
      <div className="relative bg-white text-slate-900">
        <div className="px-5 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
              <AppIcon name="trash" className="h-5 w-5" />
            </span>

            <div className="min-w-0 pt-0.5">
              <h3 className="text-[17px] font-black leading-tight text-slate-950 sm:text-[18px]">
                {title}
              </h3>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--danger)]">
                Destructive action
              </p>
            </div>
          </div>

          <p className="mt-3 max-w-[28rem] text-[14px] leading-6 text-[var(--muted)]">
            {description}
          </p>
        </div>

        <div className="border-t border-[var(--line)] px-4 py-4 sm:px-6">
          <div className="grid w-full grid-cols-2 gap-3">
            <AppButton
              variant="secondary"
              onClick={onCancel}
              disabled={isConfirming}
              className="h-11 w-full rounded-xl border border-[var(--line-strong)] bg-white px-3 text-[13px] font-black text-slate-700 shadow-none hover:bg-slate-50"
            >
              {cancelLabel}
            </AppButton>
            <AppButton
              variant="danger"
              onClick={() => void onConfirm()}
              disabled={isConfirming}
              className="h-11 w-full rounded-xl border border-[rgba(220,38,38,0.18)] bg-[var(--danger-soft)] px-3 text-[13px] font-black text-[var(--danger)] shadow-none hover:bg-[#fee2e2]"
            >
              {isConfirming ? 'Working...' : confirmLabel}
            </AppButton>
          </div>
        </div>
      </div>
    </CenteredModal>
  )
}
