import type { ReactNode } from 'react'
import { Eye } from '@phosphor-icons/react/dist/csr/Eye'
import { EyeSlash as EyeOff } from '@phosphor-icons/react/dist/csr/EyeSlash'

type PasswordFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  visible: boolean
  onToggleVisible: () => void
  autoComplete: string
  placeholder?: string
  minLength?: number
  required?: boolean
  invalid?: boolean
  error?: ReactNode
  hint?: ReactNode
  onBlur?: () => void
  children?: ReactNode
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggleVisible,
  autoComplete,
  placeholder,
  minLength,
  required,
  invalid,
  error,
  hint,
  onBlur,
  children,
}: PasswordFieldProps) {
  const messageId = error || hint ? `${id}-msg` : undefined

  return (
    <div className="g-field">
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={messageId}
          className="g-input pr-12"
        />
        <button
          type="button"
          onClick={onToggleVisible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center"
          style={{ color: 'var(--ink-2)' }}
        >
          {visible ? <EyeOff className="g-ic" aria-hidden="true" /> : <Eye className="g-ic" aria-hidden="true" />}
        </button>
      </div>
      {children}
      {error ? (
        <span id={messageId} className="g-hint is-error">{error}</span>
      ) : hint ? (
        <span id={messageId} className="g-hint">{hint}</span>
      ) : null}
    </div>
  )
}

export default PasswordField
