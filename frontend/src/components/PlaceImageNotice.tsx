import { AppIcon } from './AppIcon'

const PLACE_IMAGE_NOTICE = 'Images come from third-party sources.'

function PlaceImageNotice() {
  return (
    <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
      <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold leading-4 text-slate-500">
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-slate-500">
          <AppIcon name="notice" className="h-3.5 w-3.5" strokeWidth={2.2} />
        </span>
        <span>{PLACE_IMAGE_NOTICE}</span>
      </p>
    </div>
  )
}

export default PlaceImageNotice
