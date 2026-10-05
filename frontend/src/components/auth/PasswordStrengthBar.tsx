import { getPasswordStrength, type PasswordStrengthLevel } from '../../utils/passwordStrength'

const toneColor: Record<PasswordStrengthLevel, string> = {
  empty: 'var(--ink-3)',
  weak: 'var(--bad)',
  fair: 'var(--warn)',
  strong: 'var(--ok)',
}

const filledSegments: Record<PasswordStrengthLevel, number> = {
  empty: 0,
  weak: 1,
  fair: 2,
  strong: 3,
}

function PasswordStrengthBar({ password }: { password: string }) {
  const { level, label } = getPasswordStrength(password)

  if (!password) {
    return null
  }

  return (
    <div className="grid gap-1.5" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1 flex-1 rounded-full"
            style={{
              background: index < filledSegments[level] ? toneColor[level] : 'var(--fill-2)',
              transition: 'background var(--t) var(--ease-g)',
            }}
          />
        ))}
      </div>
      <p className="g-xs font-semibold" style={{ color: toneColor[level] }}>
        {label}
      </p>
    </div>
  )
}

export default PasswordStrengthBar
