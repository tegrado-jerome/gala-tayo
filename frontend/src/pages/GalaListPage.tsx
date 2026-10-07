import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { CopySimple } from '@phosphor-icons/react/dist/csr/CopySimple'
import { DotsThree } from '@phosphor-icons/react/dist/csr/DotsThree'
import { ListBullets } from '@phosphor-icons/react/dist/csr/ListBullets'
import { PencilSimple } from '@phosphor-icons/react/dist/csr/PencilSimple'
import { ShareNetwork } from '@phosphor-icons/react/dist/csr/ShareNetwork'
import { Trash } from '@phosphor-icons/react/dist/csr/Trash'
import { X } from '@phosphor-icons/react/dist/csr/X'
import InternalLink from '../components/InternalLink'
import DestructiveConfirmModal from '../components/DestructiveConfirmModal'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import { getPlaceHref } from '../components/discover/PhotoCard'
import { Button, Empty, Page, Sheet, Skeleton, cx } from '../components/ui'
import { useAppUser } from '../context/AppUserContext'
import { useSystemMessage } from '../context/SystemMessageContext'
import { resizedMediaUrl } from '../data/r2Config'
import {
  LIST_NAME_MAX,
  copySharedList,
  decodeSharedList,
  deleteList,
  encodeSharedList,
  isFollowing,
  removePlace,
  renameList,
  toggleFollow,
  type GalaList,
  type GalaListPlace,
  type SharedList,
} from '../utils/galaListsCore'
import { newListId, updateGalaLists, useGalaLists, useGalaListsSyncStatus } from '../utils/galaListsStore'
import { hasAccountSession } from '../utils/guestSession'
import { fetchPlaceDetailsBatch } from '../utils/placeDetailCache'
import { getPlacePhoto } from '../utils/placePhoto'
import { navigateToPath } from '../utils/navigation'
import { buildGalaListShareUrl, shareLink } from '../utils/share'
import '../design/me.css'

type ListPlace = Omit<GalaListPlace, 'addedAt'>

function plural(count: number, word: string) {
  return `${count} ${count === 1 ? word : `${word}s`}`
}

/** One big photo and two small ones, like the Saved collections. */
function Cover({ photos }: { photos: Array<string | null> }) {
  const shown = photos.filter((photo): photo is string => Boolean(photo))
  const slots = shown.length >= 3 ? shown.slice(0, 3) : shown.length > 0 ? [shown[0]] : [null]
  return (
    <div className={cx('me-wl-art !aspect-[16/10]', slots.length === 1 && 'is-1')} aria-hidden="true">
      {slots.map((photo, index) => (
        <span key={index}>
          <ListBullets weight="light" />
          {photo ? <img src={resizedMediaUrl(photo, index === 0 ? 'card' : 'thumb')} alt="" decoding="async" /> : null}
        </span>
      ))}
    </div>
  )
}

function PlaceTile({ place, onRemove }: { place: ListPlace; onRemove?: () => void }) {
  const href = getPlaceHref({ id: place.slug, slug: place.slug, name: place.name, city: place.city, area: place.area })
  const kicker = place.area || place.city || ''
  return (
    <li className="relative min-w-0 motion-safe:animate-[g-fade_300ms_var(--ease-g)_both]">
      <InternalLink href={href} className="block min-w-0 text-inherit no-underline">
        <span className="relative block h-[200px] overflow-hidden rounded-[12px] bg-[var(--fill)]">
          {place.photo ? <img src={resizedMediaUrl(place.photo, 'card')} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : null}
        </span>
        {kicker ? <span className="mt-2.5 block truncate text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-2)]">{kicker}</span> : null}
        <b className="mt-0.5 block truncate text-[16px] font-bold">{place.name}</b>
      </InternalLink>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${place.name} from this list`}
          className="absolute right-2 top-2 grid h-11 w-11 place-items-center"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-[#111111] shadow-[var(--sh-1)]" aria-hidden="true">
            <X weight="bold" size={14} />
          </span>
        </button>
      ) : null}
    </li>
  )
}

function Header({ kicker, title, sub, photos }: { kicker: string; title: string; sub?: string | null; photos: Array<string | null> }) {
  return (
    <header>
      <Cover photos={photos} />
      <p className="g-eyebrow mt-5">{kicker}</p>
      <h1 className="g-h1 mt-1 break-words">{title}</h1>
      {sub ? <p className="g-sm g-mut mt-1">{sub}</p> : null}
    </header>
  )
}

function useShareList() {
  const { showSystemMessage } = useSystemMessage()
  return async (shared: SharedList, count: number) => {
    const willOpenSheet = typeof navigator.share === 'function'
    try {
      await shareLink({ url: buildGalaListShareUrl(encodeSharedList(shared)), title: shared.name, text: `${shared.name} · ${plural(count, 'place')} on GalaTayo`, contentType: 'list' })
      if (!willOpenSheet) showSystemMessage({ title: 'Link copied', description: 'Paste it in the group chat.' })
    } catch (error) {
      if ((error as Error).name !== 'AbortError') showSystemMessage({ title: 'Could not share the list', description: 'Try again.' })
    }
  }
}

function MyList({ list }: { list: GalaList }) {
  const { currentProfile, session } = useAppUser()
  const syncStatus = useGalaListsSyncStatus()
  const shareList = useShareList()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [name, setName] = useState(list.name)
  const menuTitleId = useId()
  const inputId = useId()
  const updated = new Date(list.updatedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })
  const shared: SharedList = { name: list.name, slugs: list.places.map((place) => place.slug), by: currentProfile?.username ?? null }

  const saveName = (event: FormEvent) => {
    event.preventDefault()
    updateGalaLists((state) => renameList(state, list.id, name, new Date().toISOString()))
    setIsRenaming(false)
  }

  return (
    <>
      <Header
        kicker={`List · ${plural(list.places.length, 'place')}`}
        title={list.name}
        sub={[list.copiedFrom ? `Copied from @${list.copiedFrom}` : 'Your list', `Updated ${updated}`].join(' · ')}
        photos={list.places.slice(0, 3).map((place) => place.photo)}
      />

      {isRenaming ? (
        <form onSubmit={saveName} className="mt-4 flex gap-2 motion-safe:animate-[g-fade_300ms_var(--ease-g)_both]">
          <label htmlFor={inputId} className="sr-only">
            List name
          </label>
          <input id={inputId} className="g-input min-w-0 flex-1" value={name} maxLength={LIST_NAME_MAX} onChange={(event) => setName(event.target.value)} autoFocus />
          <Button type="submit" variant="ink" disabled={!name.trim()}>
            Save
          </Button>
        </form>
      ) : (
        <div className="mt-5 flex gap-2">
          <Button variant="ink" className="flex-1" onClick={() => void shareList(shared, list.places.length)} disabled={list.places.length === 0}>
            <ShareNetwork aria-hidden="true" />
            Share list
          </Button>
          <Button variant="line" iconOnly aria-label="List options" aria-haspopup="dialog" onClick={() => setIsMenuOpen(true)}>
            <DotsThree aria-hidden="true" />
          </Button>
        </div>
      )}

      <Sheet open={isMenuOpen} onClose={() => setIsMenuOpen(false)} title={list.name} labelledBy={menuTitleId}>
        <div className="flex flex-col gap-2">
          <Button
            variant="line"
            block
            onClick={() => {
              setIsMenuOpen(false)
              setName(list.name)
              setIsRenaming(true)
            }}
          >
            <PencilSimple aria-hidden="true" />
            Rename
          </Button>
          <Button
            variant="line"
            block
            className="!text-[var(--bad)]"
            onClick={() => {
              setIsMenuOpen(false)
              setIsDeleteOpen(true)
            }}
          >
            <Trash aria-hidden="true" />
            Delete list
          </Button>
        </div>
      </Sheet>

      <DestructiveConfirmModal
        isOpen={isDeleteOpen}
        title={`Delete “${list.name}”?`}
        description="The places stay on GalaTayo; only this list goes away."
        confirmLabel="Delete list"
        isConfirming={false}
        onCancel={() => setIsDeleteOpen(false)}
        onConfirm={() => {
          updateGalaLists((state) => deleteList(state, list.id))
          navigateToPath('/favorites')
        }}
      />

      {list.places.length === 0 ? (
        <Empty
          className="mt-8"
          title="Nothing here yet."
          description="Open a place, tap Share, then “Save to a list”."
          action={<Button variant="line" href="/search">Find places</Button>}
        />
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.places.map((place) => (
            <PlaceTile key={place.slug} place={place} onRemove={() => updateGalaLists((state) => removePlace(state, list.id, place.slug, new Date().toISOString()))} />
          ))}
        </ul>
      )}
      <p className="g-xs g-mut mt-10">
        {hasAccountSession(session) && syncStatus !== 'device'
          ? syncStatus === 'error' ? "Couldn't sync just now. Your changes are safe here and sync when you're back online." : 'Synced to your account, on every device.'
          : 'Saved on this device. Sign up free to keep your lists on every device!'}
      </p>
    </>
  )
}

type SharedState = { status: 'loading' } | { status: 'ready'; places: ListPlace[] }

function SharedListView({ shared }: { shared: SharedList }) {
  const lists = useGalaLists()
  const [state, setState] = useState<SharedState>({ status: 'loading' })
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const following = isFollowing(lists, shared)
  const slugKey = shared.slugs.join(',')

  useEffect(() => {
    let isActive = true
    fetchPlaceDetailsBatch(slugKey.split(','))
      .then((details) => {
        if (!isActive) return
        const bySlug = new Map(details.map((place) => [place.slug, place]))
        const places = slugKey.split(',').flatMap((slug) => {
          const place = bySlug.get(slug)
          if (!place) return []
          return [{ slug, name: place.name, city: place.city ?? null, area: place.area ?? null, category: place.category ?? null, photo: getPlacePhoto({ slug, name: place.name, photo_url: place.imageUrl }) }]
        })
        setState({ status: 'ready', places })
      })
      .catch(() => isActive && setState({ status: 'ready', places: [] }))
    return () => {
      isActive = false
    }
  }, [slugKey])

  const places = state.status === 'ready' ? state.places : []

  const copy = () => {
    const id = newListId()
    updateGalaLists((current) => copySharedList(current, shared, places, id, new Date().toISOString()))
    setCopiedId(id)
  }

  return (
    <>
      <Header
        kicker={`List · ${plural(state.status === 'ready' ? places.length : shared.slugs.length, 'place')}`}
        title={shared.name}
        sub={shared.by ? `By @${shared.by}` : 'Shared with you'}
        photos={places.slice(0, 3).map((place) => place.photo)}
      />

      <div className="mt-5 flex gap-2">
        {copiedId ? (
          <Button variant="ink" className="flex-1" href={`/lists/${copiedId}`}>
            <Check weight="bold" aria-hidden="true" />
            Open your copy
          </Button>
        ) : (
          <Button variant="ink" className="flex-1" onClick={copy} disabled={places.length === 0}>
            <CopySimple aria-hidden="true" />
            Save a copy
          </Button>
        )}
        <Button variant="line" aria-pressed={following} onClick={() => updateGalaLists((current) => toggleFollow(current, shared, new Date().toISOString()))}>
          {following ? <Check weight="bold" aria-hidden="true" /> : null}
          {following ? 'Following' : 'Follow'}
        </Button>
      </div>

      {state.status === 'loading' ? (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2" aria-label="Loading places">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-[240px]" />
          ))}
        </div>
      ) : places.length === 0 ? (
        <Empty className="mt-8" title="These places aren't on GalaTayo anymore." action={<Button variant="line" href="/search">Explore places</Button>} />
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {places.map((place) => (
            <PlaceTile key={place.slug} place={place} />
          ))}
        </ul>
      )}
    </>
  )
}

function GalaListPage({ listId, search }: { listId: string | null; search: string }) {
  const { lists } = useGalaLists()
  const syncStatus = useGalaListsSyncStatus()
  const { session, isSessionLoading } = useAppUser()
  const isAccount = hasAccountSession(session)
  const shared = useMemo(() => (listId ? null : decodeSharedList(search)), [listId, search])
  const list = listId ? lists.find((entry) => entry.id === listId) ?? null : null
  // A list from another device arrives with the account's lists; wait for them before saying it's missing.
  const isWaiting = Boolean(listId && !list && (isSessionLoading || (isAccount && syncStatus === 'loading')))

  return (
    <Page narrow className="pb-16">
      <MinimalBackNav to="/favorites" label="Saved" />
      <div className="mt-2 lg:mt-6">
        {isWaiting ? (
          <div aria-label="Loading list" className="grid gap-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-[240px]" />
          </div>
        ) : list ? (
          <MyList key={list.id} list={list} />
        ) : shared ? (
          <SharedListView shared={shared} />
        ) : (
          <Empty
            className="mt-10"
            title={listId ? "We can't find this list." : 'This list link looks broken.'}
            description={
              listId
                ? isAccount
                  ? 'It may have been deleted, or it belongs to another account.'
                  : "Lists made as a guest stay on the device that made them. Log in to see your account's lists."
                : 'Ask your friend to share it again.'
            }
            action={<Button variant="line" href="/favorites">Go to Saved</Button>}
          />
        )}
      </div>
    </Page>
  )
}

export default GalaListPage
