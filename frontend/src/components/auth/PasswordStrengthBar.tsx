import { getPasswordStrength, type PasswordStrengthLevel } from '../../utils/passwordStrength'

type PasswordStrengthBarProps = {
  password: string
}

const barColors: Record<PasswordStrengthLevel, string> = {
  empty: 'bg-slate-200',
  weak: 'bg-red-500',
  fair: 'bg-amber-500',
  strong: 'bg-emerald-500',
}

const barWidths: Record<PasswordStrengthLevel, string> = {
  empty: 'w-0',
  weak: 'w-1/3',
  fair: 'w-2/3',
  strong: 'w-full',
}

const labelColors: Record<PasswordStrengthLevel, string> = {
  empty: '',
  weak: 'text-red-600',
  fair: 'text-amber-600',
  strong: 'text-emerald-600',
}

function PasswordStrengthBar({ password }: PasswordStrengthBarProps) {
  const { level, label } = getPasswordStrength(password)

  if (!password) {
    return null
  }

  return (
    <div className="grid gap-1.5">
      <div className="h-[5px] w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColors[level]} ${barWidths[level]}`}
        />
      </div>
      <p className={`text-[11px] font-semibold tracking-wide ${labelColors[level]}`}>
        {label}
      </p>
    </div>
  )
}

export default PasswordStrengthBar
