import { useCallback, useId, useMemo } from 'react'
import { CaretRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { ImageSquare } from '@phosphor-icons/react/dist/csr/ImageSquare'
import { LinkSimple } from '@phosphor-icons/react/dist/csr/LinkSimple'
import { ListPlus } from '@phosphor-icons/react/dist/csr/ListPlus'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { Sheet } from '../ui'
import StoryPreview from './StoryPreview'
import { renderPlaceStory } from './placeStoryDraw'
import SaveToListSheet from '../lists/SaveToListSheet'
import { buildPlaceStoryText, photoCreditLine, type PlaceStoryInput } from '../../utils/placeStory'
import { getPublicSiteOrigin } from '../../utils/site'
import { buildPlaceShareUrl } from '../../utils/share'
import { withShareRef } from '../../utils/shareRef'
import type { GalaListPlace } from '../../utils/galaListsCore'

export type PlaceShareView = 'menu' | 'story' | 'list' | null

type Props = {
  view: PlaceShareView
  onViewChange: (view: PlaceShareView) => void
  place: PlaceStoryInput
  /** Hero photo first; only media.galatayo.app originals can be drawn (they send CORS headers). */
  photos: Array<{ url: string; author?: string; license?: string }>
  listPlace: Omit<GalaListPlace, 'addedAt'>
  onShareLink: () => void
  onStoryShared?: () => void
  saved?: { isSaved: boolean; onToggle: () => void; disabled?: boolean }
}

function Row({ icon: Icon, title, sub, onClick }: { icon: PhosphorIcon; title: string; sub: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" className="flex min-h-16 w-full items-center gap-4 rounded-[12px] px-1 py-2 text-left hover:bg-[var(--fill)]" onClick={onClick}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--fill)]" aria-hidden="true">
          <Icon weight="light" size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] font-semibold">{title}</b>
          <span className="g-xs g-mut">{sub}</span>
        </span>
        <CaretRight weight="light" aria-hidden="true" className="text-[var(--ink-3)]" />
      </button>
    </li>
  )
}

/** Share menu for a place: a 9:16 story image, the link, or a Gala list. */
function PlaceShareSheet({ view, onViewChange, place, photos, listPlace, onShareLink, onStoryShared, saved }: Props) {
  const titleId = useId()
  const close = useCallback(() => onViewChange(null), [onViewChange])
  const story = useMemo(
    () => ({ ...buildPlaceStoryText(place, getPublicSiteOrigin()), photos: photos.map((photo) => ({ url: photo.url, credit: photoCreditLine(photo) })) }),
    [place, photos],
  )

  if (view === 'story') {
    return (
      <StoryPreview
        render={() => renderPlaceStory(story)}
        fileName={story.fileName}
        title={story.name}
        // The image prints the clean short link; the message carries the full one, tagged as a story share.
        shareText={`${story.name} · ${withShareRef(buildPlaceShareUrl(place), 'story')}`}
        summary={[story.kicker, story.name, story.line].filter(Boolean).join('. ')}
        label={`Story for ${story.name}`}
        onClose={close}
        onShared={onStoryShared}
      />
    )
  }

  if (view === 'list') return <SaveToListSheet place={listPlace} onClose={close} saved={saved} />

  if (view !== 'menu') return null

  return (
    <Sheet open onClose={close} title="Share" labelledBy={titleId}>
      <ul className="-mx-1 flex flex-col">
        <Row icon={ImageSquare} title="Share as story" sub="A 9:16 image for Instagram, FB or TikTok" onClick={() => onViewChange('story')} />
        <Row
          icon={LinkSimple}
          title="Share link"
          sub="Send it to the group chat"
          onClick={() => {
            close()
            onShareLink()
          }}
        />
        <Row icon={ListPlus} title="Save to a list" sub="Date night, rainy day, your call" onClick={() => onViewChange('list')} />
      </ul>
    </Sheet>
  )
}

export default PlaceShareSheet
