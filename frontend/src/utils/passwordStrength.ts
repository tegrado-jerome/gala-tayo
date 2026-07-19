export type PasswordStrengthLevel = 'empty' | 'weak' | 'fair' | 'strong'

export type PasswordStrengthResult = {
  level: PasswordStrengthLevel
  score: number
  label: string
  meetsComplexity: boolean
}

const hasUpperCase = /[A-Z]/
const hasLowerCase = /[a-z]/
const hasDigit = /\d/
const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{}|;':",./<>?`~\\]/

export function getPasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return { level: 'empty', score: 0, label: '', meetsComplexity: false }
  }

  let score = 0

  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (hasUpperCase.test(password)) score += 1
  if (hasLowerCase.test(password)) score += 1
  if (hasDigit.test(password)) score += 1
  if (hasSpecialChar.test(password)) score += 1

  const meetsComplexity =
    password.length >= 8 &&
    hasUpperCase.test(password) &&
    hasLowerCase.test(password) &&
    hasDigit.test(password) &&
    hasSpecialChar.test(password)

  let level: PasswordStrengthLevel
  if (score <= 2) {
    level = 'weak'
  } else if (score <= 4) {
    level = 'fair'
  } else {
    level = 'strong'
  }

  const labels: Record<PasswordStrengthLevel, string> = {
    empty: '',
    weak: 'Weak',
    fair: 'Fair',
    strong: 'Strong',
  }

  return { level, score, label: labels[level], meetsComplexity }
}
