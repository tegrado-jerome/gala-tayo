import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CaretLeft as ChevronLeft } from '@phosphor-icons/react/dist/csr/CaretLeft'
import { AuthNotice } from '../components/auth/AuthCard'
import PasswordField from '../components/auth/PasswordField'
import PasswordStrengthBar from '../components/auth/PasswordStrengthBar'
import { Button, Page, Panel } from '../components/ui'
import { navigateToPath } from '../utils/navigation'
import { hasInAppBackHistory } from '../utils/routes'
import { useSystemMessage } from '../context/SystemMessageContext'
import { getPasswordStrength } from '../utils/passwordStrength'
import { updateAccountPassword } from '../services/authApi'

function ChangePasswordPage() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false)
  const [isConfirmNewPasswordVisible, setIsConfirmNewPasswordVisible] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [securityError, setSecurityError] = useState('')
  const { showSystemMessage } = useSystemMessage()
  const passwordStrength = useMemo(() => getPasswordStrength(newPassword), [newPassword])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!passwordStrength.meetsComplexity) {
      setSecurityError('Use a stronger password with uppercase, lowercase, digit, and special character.')
      return
    }

    if (newPassword !== confirmNewPassword) {
      setSecurityError('Passwords do not match.')
      return
    }

    try {
      setIsSavingPassword(true)
      setSecurityError('')
      await updateAccountPassword(newPassword)
      setNewPassword('')
      setConfirmNewPassword('')
      setIsNewPasswordVisible(false)
      setIsConfirmNewPasswordVisible(false)
      showSystemMessage({
        title: 'Password Updated!',
        description: 'Your account password was updated successfully.',
      })
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'Could not update password.')
    } finally {
      setIsSavingPassword(false)
    }
  }

  const goBack = () => {
    if (hasInAppBackHistory()) {
      window.history.back()
      return
    }
    navigateToPath('/account-settings')
  }

  return (
    <Page narrow>
      <div className="mx-auto w-full max-w-[560px]">
        <Button variant="text" size="sm" onClick={goBack} className="-ml-1">
          <ChevronLeft aria-hidden="true" />
          Account settings
        </Button>

        <header className="mt-4">
          <p className="g-eyebrow">Security</p>
          <h1 className="g-h1 mt-2">Change password</h1>
          <p className="g-mut mt-2">
            This changes the password you use to log in to GalaTayo, not just a profile field.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
          <Panel className="!p-4" style={{ background: 'var(--fill)', borderColor: 'transparent' }}>
            <p className="g-h3">How it works</p>
            <p className="g-sm g-mut mt-1 leading-5">
              After saving, your next email-and-password login uses this new password. Google users can set one here too if the session allows it.
            </p>
          </Panel>

          <PasswordField
            id="change-password"
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            visible={isNewPasswordVisible}
            onToggleVisible={() => setIsNewPasswordVisible((current) => !current)}
            minLength={8}
            autoComplete="new-password"
            hint="Must have uppercase, lowercase, a number, and a symbol."
          >
            <PasswordStrengthBar password={newPassword} />
          </PasswordField>

          <PasswordField
            id="change-confirm-password"
            label="Confirm new password"
            value={confirmNewPassword}
            onChange={setConfirmNewPassword}
            visible={isConfirmNewPasswordVisible}
            onToggleVisible={() => setIsConfirmNewPasswordVisible((current) => !current)}
            minLength={8}
            autoComplete="new-password"
            invalid={confirmNewPassword.length > 0 && newPassword !== confirmNewPassword}
          />

          {securityError ? <AuthNotice tone="bad">{securityError}</AuthNotice> : null}

          <Button type="submit" variant="ink" block disabled={isSavingPassword || !newPassword || !confirmNewPassword}>
            {isSavingPassword ? 'Updating password...' : 'Save new password'}
          </Button>
        </form>
      </div>
    </Page>
  )
}

export default ChangePasswordPage
