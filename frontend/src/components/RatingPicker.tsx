import { SmileyAngry as Angry } from '@phosphor-icons/react/dist/csr/SmileyAngry'
import { SmileySad as Frown } from '@phosphor-icons/react/dist/csr/SmileySad'
import { SmileyWink as Laugh } from '@phosphor-icons/react/dist/csr/SmileyWink'
import { SmileyMeh as Meh } from '@phosphor-icons/react/dist/csr/SmileyMeh'
import { Smiley as Smile } from '@phosphor-icons/react/dist/csr/Smiley'
import '../design/misc.css'

const ratingOptions = [
  { value: 1, label: 'Very bad', Icon: Angry },
  { value: 2, label: 'Bad', Icon: Frown },
  { value: 3, label: 'Okay', Icon: Meh },
  { value: 4, label: 'Good', Icon: Smile },
  { value: 5, label: 'Excellent', Icon: Laugh },
]

/** The five-face 1-5 rating row used by the feedback and contact forms. */
function RatingPicker({ legend, value, onChange }: { legend: string; value: number; onChange: (value: number) => void }) {
  return (
    <fieldset>
      <legend className="g-h3">{legend}</legend>
      <div className="m-rate mt-3">
        {ratingOptions.map(({ value: optionValue, label, Icon }) => {
          const isSelected = value === optionValue
          return (
            <button key={optionValue} type="button" onClick={() => onChange(optionValue)} aria-pressed={isSelected} aria-label={`Rate ${label}`}>
              <Icon weight={isSelected ? 'fill' : 'light'} aria-hidden="true" />
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export default RatingPicker
