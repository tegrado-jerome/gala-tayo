import { useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'
import { metroManilaAreas } from '../../data/metroManilaAreas'
import { displayCityName } from '../../utils/cityName'
import { navigateToPath } from '../../utils/navigation'
import { buildSearchPath, type SearchBudgetValue, type SearchGoodForValue } from '../../utils/searchParams'

const groupOptions: Array<{ value: SearchGoodForValue; label: string }> = [
  { value: 'barkada', label: 'the barkada' },
  { value: 'date', label: 'my date' },
  { value: 'family', label: 'the family' },
  { value: 'chill', label: 'just me' },
]

const budgetOptions: Array<{ value: SearchBudgetValue | ''; label: string }> = [
  { value: '', label: 'any budget' },
  { value: 'free', label: 'free' },
  { value: 'under-500', label: 'under ₱500' },
  { value: '500-1000', label: 'under ₱1,000' },
  { value: '1000-2000', label: 'under ₱2,000' },
]

/** "Gala in [city] with [group], [budget]" — every slot maps to a real search filter. */
function SentenceSearch({ className }: { className?: string }) {
  const [city, setCity] = useState('')
  const [goodFor, setGoodFor] = useState<SearchGoodForValue>('barkada')
  const [budget, setBudget] = useState<SearchBudgetValue | ''>('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    navigateToPath(buildSearchPath({ city: city || null, goodFor, budget: budget || null, page: 1 }))
  }

  return (
    <form role="search" onSubmit={submit} className={className}>
      <div className="g-sentence max-md:flex-nowrap max-md:gap-1 max-md:pl-2.5 max-md:pr-1.5 max-md:text-[14px]">
        <span className="shrink-0 whitespace-nowrap">Gala in</span>
        <select aria-label="City" className="g-slot min-w-0 appearance-none max-md:px-1.5 max-md:text-[14px]" value={city} onChange={(event) => setCity(event.target.value)}>
          <option value="">Metro Manila</option>
          {metroManilaAreas.map((area) => (
            <option key={area.slug} value={area.searchFilter}>
              {displayCityName(area.name)}
            </option>
          ))}
        </select>
        <span className="hidden md:contents">
          <span>with</span>
          <select aria-label="Who's going" className="g-slot appearance-none" value={goodFor} onChange={(event) => setGoodFor(event.target.value as SearchGoodForValue)}>
            {groupOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </span>
        <span className="md:hidden" aria-hidden="true">
          ·
        </span>
        <select aria-label="Budget" className="g-slot min-w-0 appearance-none max-md:px-1.5 max-md:text-[14px]" value={budget} onChange={(event) => setBudget(event.target.value as SearchBudgetValue | '')}>
          {budgetOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="submit" className="g-go shrink-0 max-md:h-10 max-md:w-10" aria-label="Search places">
          <Search className="g-ic" />
        </button>
      </div>
    </form>
  )
}

export default SentenceSearch
