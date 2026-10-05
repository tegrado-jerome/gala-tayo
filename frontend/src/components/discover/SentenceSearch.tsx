import { useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'
import { metroManilaAreas } from '../../data/metroManilaAreas'
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
      <div className="g-sentence">
        <span>Gala in</span>
        <select aria-label="City" className="g-slot appearance-none" value={city} onChange={(event) => setCity(event.target.value)}>
          <option value="">Metro Manila</option>
          {metroManilaAreas.map((area) => (
            <option key={area.slug} value={area.searchFilter}>
              {area.name}
            </option>
          ))}
        </select>
        <span>with</span>
        <select aria-label="Who's going" className="g-slot appearance-none" value={goodFor} onChange={(event) => setGoodFor(event.target.value as SearchGoodForValue)}>
          {groupOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select aria-label="Budget" className="g-slot appearance-none" value={budget} onChange={(event) => setBudget(event.target.value as SearchBudgetValue | '')}>
          {budgetOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="submit" className="g-go" aria-label="Search places">
          <Search className="g-ic" />
        </button>
      </div>
    </form>
  )
}

export default SentenceSearch
