import { buildPlaceShareUrl, shareLink } from './share'

type ShareablePlace = {
  slug?: string | null
}

function getPlaceShareUrl(place: ShareablePlace) {
  return buildPlaceShareUrl(place)
}

async function copyPlaceLink(place: ShareablePlace) {
  await shareLink({
    url: buildPlaceShareUrl(place),
  })
}

export { copyPlaceLink, getPlaceShareUrl }
export type { ShareablePlace }
