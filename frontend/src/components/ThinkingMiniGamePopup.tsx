import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import TapGalaPinGame from './TapGalaPinGame'

type MiniGameStage = 'hidden' | 'invite' | 'declined' | 'nag' | 'game' | 'collapsed'

type ThinkingMiniGamePopupProps = {
  isThinking: boolean
}

const INVITE_DELAY_MS = 3000
const NAG_DELAY_MS = 10000

export default function ThinkingMiniGamePopup({ isThinking }: ThinkingMiniGamePopupProps) {
  const [stage, setStage] = useState<MiniGameStage>('hidden')
  const inviteTimerRef = useRef(0)
  const nagTimerRef = useRef(0)

  useEffect(() => {
    if (isThinking && stage === 'hidden') {
      inviteTimerRef.current = window.setTimeout(() => {
        setStage('invite')
      }, INVITE_DELAY_MS)
    }

    if (!isThinking) {
      window.clearTimeout(inviteTimerRef.current)
      window.clearTimeout(nagTimerRef.current)
      setStage('hidden')
    }

    return () => {
      window.clearTimeout(inviteTimerRef.current)
      window.clearTimeout(nagTimerRef.current)
    }
  }, [isThinking, stage])

  useEffect(() => {
    if (stage !== 'game') {
      return
    }

    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [stage])

  const handleDismissInvite = () => {
    setStage('declined')
    nagTimerRef.current = window.setTimeout(() => {
      setStage('nag')
    }, NAG_DELAY_MS)
  }

  const handleDismissNag = () => {
    setStage('collapsed')
  }

  const handlePlay = () => {
    window.clearTimeout(nagTimerRef.current)
    setStage('game')
  }

  const handleCloseGame = () => {
    setStage('collapsed')
  }

  const handleReopenInvite = () => {
    setStage('invite')
  }

  return (
    <>
      {stage === 'invite'
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[9990] flex h-[100dvh] items-center justify-center px-4 pb-[10vh]">
              <div className="pointer-events-auto w-full max-w-[min(88vw,400px)] overflow-hidden rounded-[24px] border border-[rgba(37,99,235,0.14)] bg-white/90 p-3 shadow-[0_24px_64px_rgba(15,23,42,0.14)] backdrop-blur-xl motion-safe:animate-[gala-game-invite-pop_360ms_cubic-bezier(0.16,1,0.3,1)_both]">
                <div className="relative rounded-[20px] bg-[linear-gradient(135deg,#f8fbff,#fff7fb)] p-3">
                  <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(37,99,235,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.07)_1px,transparent_1px)] [background-size:22px_22px]" />
                  <div className="relative flex items-start gap-3">
                    <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white motion-safe:animate-[gala-charm-wiggle_1.8s_ease-in-out_infinite]">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                        <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z" />
                        <circle cx="12" cy="10" r="2.3" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#2563eb]">Still cooking</p>
                          <h3 className="mt-1 text-[1.05rem] font-black leading-tight text-slate-950">Want a tiny tap break?</h3>
                        </div>
                        <button
                          type="button"
                          onClick={handleDismissInvite}
                          className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-white/74 px-3 text-[11px] font-black text-slate-600 transition hover:bg-white hover:text-slate-950"
                        >
                          Later
                        </button>
                      </div>
                      <p className="mt-2 text-[0.84rem] leading-5 text-slate-600">
                        Optional lang. Play Pin Rush while your answer finishes.
                      </p>
                    </div>
                  </div>
                  <div className="relative mt-3 grid grid-cols-[1fr_auto] items-center gap-2">
                    <div className="flex h-10 items-center gap-1.5 rounded-full bg-white/70 px-3">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#5ed6c7]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#ffcc4d]" />
                      <span className="ml-1 text-[11px] font-black text-slate-500">8+ pts charms</span>
                    </div>
                    <button
                      type="button"
                      onClick={handlePlay}
                      className="inline-flex h-10 items-center justify-center rounded-full bg-slate-950 px-4 text-sm font-black text-white transition hover:brightness-110"
                    >
                      Play
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {stage === 'nag'
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[9990] flex h-[100dvh] items-center justify-center px-4 pb-[10vh]">
              <div className="pointer-events-auto w-full max-w-[min(88vw,400px)] overflow-hidden rounded-[24px] border border-[rgba(245,158,11,0.18)] bg-white/90 p-3 shadow-[0_24px_64px_rgba(15,23,42,0.14)] backdrop-blur-xl motion-safe:animate-[gala-game-invite-pop_360ms_cubic-bezier(0.16,1,0.3,1)_both]">
                <div className="relative rounded-[20px] bg-[linear-gradient(135deg,#fffbeb,#fff8f0)] p-3">
                  <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(245,158,11,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(245,158,11,0.07)_1px,transparent_1px)] [background-size:22px_22px]" />
                  <div className="relative flex items-start gap-3">
                    <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white motion-safe:animate-[gala-charm-wiggle_1.8s_ease-in-out_infinite]">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                        <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z" />
                        <circle cx="12" cy="10" r="2.3" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#d97706]">Still waiting</p>
                          <h3 className="mt-1 text-[1.05rem] font-black leading-tight text-slate-950">Sigurado ka ayaw mo?</h3>
                        </div>
                        <button
                          type="button"
                          onClick={handleDismissNag}
                          className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-white/74 px-3 text-[11px] font-black text-slate-600 transition hover:bg-white hover:text-slate-950"
                        >
                          Pass
                        </button>
                      </div>
                      <p className="mt-2 text-[0.84rem] leading-5 text-slate-600">
                        Wala ka naman magawa habang nag-iisip si AI. Sure ka talaga?
                      </p>
                    </div>
                  </div>
                  <div className="relative mt-3 grid grid-cols-[1fr_auto] items-center gap-2">
                    <div className="flex h-10 items-center gap-1.5 rounded-full bg-white/70 px-3">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#5ed6c7]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#ffcc4d]" />
                      <span className="ml-1 text-[11px] font-black text-slate-500">Libre lang</span>
                    </div>
                    <button
                      type="button"
                      onClick={handlePlay}
                      className="inline-flex h-10 items-center justify-center rounded-full bg-amber-500 px-4 text-sm font-black text-white transition hover:brightness-110"
                    >
                      Game na
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {stage === 'collapsed'
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+5.75rem)] z-[9980] flex justify-center">
              <button
                type="button"
                onClick={handleReopenInvite}
                className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-[rgba(37,99,235,0.18)] bg-white/92 px-3.5 py-2 text-[12px] font-black text-[#2563eb] shadow-[0_8px_24px_rgba(15,23,42,0.10)] backdrop-blur-md transition hover:border-[rgba(37,99,235,0.32)] hover:bg-white hover:shadow-[0_12px_28px_rgba(15,23,42,0.14)] motion-safe:animate-[gala-game-invite-pop_240ms_cubic-bezier(0.16,1,0.3,1)_both]"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                  <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z" />
                  <circle cx="12" cy="10" r="2.3" />
                </svg>
                Pin Rush
              </button>
            </div>,
            document.body,
          )
        : null}

      {stage === 'game'
        ? createPortal(
            <div
              className="fixed inset-0 z-[9990] flex h-[100dvh] items-stretch justify-center overscroll-none bg-white"
              role="presentation"
              onClick={handleCloseGame}
            >
              <div
                className="relative flex h-[100dvh] w-full flex-col overflow-hidden touch-auto"
                role="dialog"
                aria-modal="true"
                aria-label="Tap the Gala Pin mini game"
                onClick={(event) => event.stopPropagation()}
              >
                <TapGalaPinGame isLoading={true} onClose={handleCloseGame} className="min-h-0 w-full flex-1" />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
