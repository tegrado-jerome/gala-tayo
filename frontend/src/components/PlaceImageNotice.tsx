import { Info } from 'lucide-react'

const PLACE_IMAGE_NOTICE = 'Some images may also come from third-party sources and are shown for viewing only.'

function PlaceImageNotice() {
  return (
    <div className="-mx-4 sm:mx-0">
      <div className="flex w-full items-start gap-2 px-4 text-[11px] font-medium leading-4 text-slate-400 sm:px-0">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2.2} />
        <p className="min-w-0 flex-1">{PLACE_IMAGE_NOTICE}</p>
      </div>
    </div>
  )
}

export default PlaceImageNotice
