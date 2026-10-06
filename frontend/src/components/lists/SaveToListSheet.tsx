import { useId, useState, type FormEvent } from 'react'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { ListBullets } from '@phosphor-icons/react/dist/csr/ListBullets'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { Button, Sheet, cx } from '../ui'
import { resizedMediaUrl } from '../../data/r2Config'
import { LIST_NAME_MAX, LIST_SUGGESTIONS, createList, listHasPlace, togglePlace, type GalaListPlace } from '../../utils/galaListsCore'
import { newListId, updateGalaLists, useGalaLists } from '../../utils/galaListsStore'

type Props = {
  place: Omit<GalaListPlace, 'addedAt'>
  onClose: () => void
  /** The existing "Saved" heart, shown as the first list. */
  saved?: { isSaved: boolean; onToggle: () => void; disabled?: boolean }
}

function Thumb({ photo, icon: Icon }: { photo: string | null | undefined; icon: typeof Heart }) {
  return (
    <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[var(--fill)] text-[var(--ink-3)]" aria-hidden="true">
      <Icon weight="light" size={22} />
      {photo ? <img src={resizedMediaUrl(photo, 'thumb')} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" /> : null}
    </span>
  )
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      className={cx(
        'grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-colors duration-300',
        on ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--on-ink)]' : 'border-[#CFCFCF] text-transparent',
      )}
      aria-hidden="true"
    >
      <Check weight="bold" size={14} className={on ? 'motion-safe:animate-[g-fade_300ms_var(--ease-g)_both]' : undefined} />
    </span>
  )
}

/** "Save to a list" sheet: the Saved heart plus every Gala list, each a toggle; new lists are made inline. */
function SaveToListSheet({ place, onClose, saved }: Props) {
  const { lists } = useGalaLists()
  const titleId = useId()
  const inputId = useId()
  const [isCreating, setIsCreating] = useState(lists.length === 0)
  const [name, setName] = useState('')
  const [status, setStatus] = useState('')
  const usedNames = new Set(lists.map((list) => list.name.toLowerCase()))
  const suggestions = LIST_SUGGESTIONS.filter((suggestion) => !usedNames.has(suggestion.toLowerCase())).slice(0, 4)
  const now = () => new Date().toISOString()

  const toggle = (listId: string, listName: string, wasIn: boolean) => {
    updateGalaLists((state) => togglePlace(state, listId, place, now()))
    setStatus(wasIn ? `Removed from ${listName}` : `Added to ${listName}`)
  }

  const create = (event?: FormEvent, preset?: string) => {
    event?.preventDefault()
    const listName = (preset ?? name).trim()
    if (!listName) return
    const id = newListId()
    updateGalaLists((state) => togglePlace(createList(state, listName, id, now()), id, place, now()))
    setName('')
    setIsCreating(false)
    setStatus(`Added to ${listName}`)
  }

  return (
    <Sheet open onClose={onClose} title="Save to a list" labelledBy={titleId}>
      <ul className="-mx-1 flex max-h-[46vh] flex-col overflow-y-auto">
        {saved ? (
          <li>
            <button type="button" className="flex min-h-16 w-full items-center gap-3 rounded-[12px] px-1 py-2 text-left hover:bg-[var(--fill)]" aria-pressed={saved.isSaved} onClick={saved.onToggle} disabled={saved.disabled}>
              <Thumb photo={null} icon={Heart} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[15px] font-semibold">Saved</b>
                <span className="g-xs g-mut">Your hearted places</span>
              </span>
              <Tick on={saved.isSaved} />
            </button>
          </li>
        ) : null}
        {lists.map((list) => {
          const isIn = listHasPlace(list, place.slug)
          return (
            <li key={list.id}>
              <button type="button" className="flex min-h-16 w-full items-center gap-3 rounded-[12px] px-1 py-2 text-left hover:bg-[var(--fill)]" aria-pressed={isIn} onClick={() => toggle(list.id, list.name, isIn)}>
                <Thumb photo={list.places[0]?.photo} icon={ListBullets} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[15px] font-semibold">{list.name}</b>
                  <span className="g-xs g-mut">
                    {list.places.length} {list.places.length === 1 ? 'place' : 'places'}
                  </span>
                </span>
                <Tick on={isIn} />
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 border-t border-[var(--line)] pt-4">
        {isCreating ? (
          <form onSubmit={create} className="flex flex-col gap-3 motion-safe:animate-[g-fade_300ms_var(--ease-g)_both]">
            <label htmlFor={inputId} className="g-label">
              New list name
            </label>
            <div className="flex gap-2">
              <input
                id={inputId}
                className="g-input min-w-0 flex-1"
                value={name}
                maxLength={LIST_NAME_MAX}
                placeholder="e.g. Date night"
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
              <Button type="submit" variant="ink" disabled={!name.trim()}>
                Create
              </Button>
            </div>
            {suggestions.length > 0 ? (
              <div className="flex flex-wrap gap-2" aria-label="Suggested names">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" className="g-chip" onClick={() => create(undefined, suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
          </form>
        ) : (
          <Button variant="line" block onClick={() => setIsCreating(true)}>
            <Plus aria-hidden="true" />
            New list
          </Button>
        )}
      </div>

      <p className="g-sm mt-3 flex min-h-6 items-center justify-center gap-1.5 text-[var(--sea)]" aria-live="polite">
        {status ? (
          <span key={status} className="inline-flex items-center gap-1.5 motion-safe:animate-[g-fade_300ms_var(--ease-g)_both]">
            <Check weight="bold" aria-hidden="true" />
            {status}
          </span>
        ) : null}
      </p>
    </Sheet>
  )
}

export default SaveToListSheet
