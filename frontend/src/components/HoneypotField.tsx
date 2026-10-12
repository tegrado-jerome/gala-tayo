/**
 * A "website" field people never see or reach. Bots that fill every input fill it too, and the API
 * quietly drops anything that arrives with it set.
 */
function HoneypotField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={value} onChange={(event) => onChange(event.target.value)} />
      </label>
    </div>
  )
}

export default HoneypotField
