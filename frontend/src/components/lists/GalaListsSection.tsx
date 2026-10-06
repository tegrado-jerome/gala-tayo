import { useId, useState, type FormEvent } from 'react'
import { ListBullets } from '@phosphor-icons/react/dist/csr/ListBullets'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { UsersThree } from '@phosphor-icons/react/dist/csr/UsersThree'
import InternalLink from '../InternalLink'
import { Button, SectionHead, Sheet } from '../ui'
import { resizedMediaUrl } from '../../data/r2Config'
import { LIST_NAME_MAX, LIST_SUGGESTIONS, createList, encodeSharedList } from '../../utils/galaListsCore'
import { newListId, updateGalaLists, useGalaLists } from '../../utils/galaListsStore'
import { navigateToPath } from '../../utils/navigation'
import { getPlaceCardPhoto } from '../../utils/placeGalleryPhotos'

function Collage({ photos, icon: Icon }: { photos: Array<string | null | undefined>; icon: typeof ListBullets }) {
  const shown = photos.filter((photo): photo is string => Boolean(photo))
  const slots = shown.length >= 3 ? shown.slice(0, 3) : shown.length > 0 ? [shown[0]] : [null]
  return (
    <span className={slots.length === 1 ? 'me-wl-art is-1' : 'me-wl-art'} aria-hidden="true">
      {slots.map((photo, index) => (
        <span key={index}>
          <Icon weight="light" />
          {photo ? <img src={resizedMediaUrl(photo, index === 0 ? 'card' : 'thumb')} alt="" loading="lazy" decoding="async" /> : null}
        </span>
      ))}
    </span>
  )
}

function NewListSheet({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  const inputId = useId()
  const [name, setName] = useState('')
  const { lists } = useGalaLists()
  const used = new Set(lists.map((list) => list.name.toLowerCase()))
  const suggestions = LIST_SUGGESTIONS.filter((suggestion) => !used.has(suggestion.toLowerCase())).slice(0, 4)

  const create = (event?: FormEvent, preset?: string) => {
    event?.preventDefault()
    const listName = (preset ?? name).trim()
    if (!listName) return
    const id = newListId()
    updateGalaLists((state) => createList(state, listName, id, new Date().toISOString()))
    onClose()
    navigateToPath(`/lists/${id}`)
  }

  return (
    <Sheet open onClose={onClose} title="New list" labelledBy={titleId}>
      <form onSubmit={create} className="flex flex-col gap-3">
        <label htmlFor={inputId} className="g-label">
          Name
        </label>
        <input id={inputId} className="g-input" value={name} maxLength={LIST_NAME_MAX} placeholder="e.g. Rainy day" onChange={(event) => setName(event.target.value)} autoComplete="off" autoFocus />
        {suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-2" aria-label="Suggested names">
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" className="g-chip" onClick={() => create(undefined, suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
        <Button type="submit" variant="ink" block disabled={!name.trim()}>
          Create list
        </Button>
      </form>
    </Sheet>
  )
}

/** Gala lists and followed lists, as wishlist covers on the Saved page. */
function GalaListsSection({ className }: { className?: string }) {
  const { lists, following } = useGalaLists()
  const [isCreating, setIsCreating] = useState(false)

  return (
    <section aria-labelledby="gala-lists-title" className={className}>
      <SectionHead
        title={<span id="gala-lists-title">Lists</span>}
        sub={lists.length + following.length === 0 ? 'Group places your way: date night, rainy day, food trip.' : undefined}
        action={
          <Button variant="text" size="sm" onClick={() => setIsCreating(true)}>
            <Plus aria-hidden="true" />
            New list
          </Button>
        }
      />
      <div className="me-wls">
        {lists.map((list) => (
          <InternalLink key={list.id} href={`/lists/${list.id}`} className="me-wl">
            <Collage photos={list.places.slice(0, 3).map((place) => place.photo)} icon={ListBullets} />
            <span className="me-wl-t">{list.name}</span>
            <span className="me-wl-s">
              {list.places.length} {list.places.length === 1 ? 'place' : 'places'}
            </span>
          </InternalLink>
        ))}
        {following.map((item) => (
          <InternalLink key={item.key} href={`/lists/shared?${encodeSharedList(item)}`} className="me-wl">
            <Collage photos={item.slugs.slice(0, 3).map((slug) => getPlaceCardPhoto(slug))} icon={UsersThree} />
            <span className="me-wl-t">{item.name}</span>
            <span className="me-wl-s">{item.by ? `Following · @${item.by}` : 'Following'}</span>
          </InternalLink>
        ))}
        {lists.length === 0 ? (
          <button type="button" className="me-wl" onClick={() => setIsCreating(true)}>
            <Collage photos={[]} icon={Plus} />
            <span className="me-wl-t">Start a list</span>
            <span className="me-wl-s">Name it, then add places</span>
          </button>
        ) : null}
      </div>
      {isCreating ? <NewListSheet onClose={() => setIsCreating(false)} /> : null}
    </section>
  )
}

export default GalaListsSection
