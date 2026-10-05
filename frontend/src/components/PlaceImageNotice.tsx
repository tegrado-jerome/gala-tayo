import { Info } from 'lucide-react'

function PlaceImageNotice() {
  return (
    <p className="g-xs g-fnt flex min-w-0 items-center gap-1.5">
      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Images come from third-party sources.</span>
    </p>
  )
}

export default PlaceImageNotice
