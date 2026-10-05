import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AuthError, Session } from '@supabase/supabase-js'
import { createGuestSessionManager, hasAccountSession, isAnonymousSession } from './guestSessionCore.ts'

const guestSession = { access_token: 'guest', user: { id: 'guest-id', is_anonymous: true } } as unknown as Session
const accountSession = { access_token: 'account', user: { id: 'account-id', is_anonymous: false } } as unknown as Session
const disabledError = { name: 'AuthApiError', code: 'anonymous_provider_disabled', message: 'Anonymous sign-ins are disabled' } as AuthError

function fakeAuth({ current = null, signIn }: { current?: Session | null; signIn: () => { session: Session | null; error: AuthError | null } }) {
  const calls = { signIn: 0 }
  const auth = {
    getSession: async () => ({ data: { session: current } }),
    signInAnonymously: async () => {
      calls.signIn += 1
      const result = signIn()
      return { data: { session: result.session }, error: result.error }
    },
  }
  return { auth, calls }
}

test('session helpers tell guests from accounts', () => {
  assert.equal(isAnonymousSession(guestSession), true)
  assert.equal(isAnonymousSession(accountSession), false)
  assert.equal(isAnonymousSession(null), false)
  assert.equal(hasAccountSession(accountSession), true)
  assert.equal(hasAccountSession(guestSession), false)
  assert.equal(hasAccountSession(undefined), false)
})

test('creates a guest session when anonymous sign-ins are enabled', async () => {
  const { auth, calls } = fakeAuth({ signIn: () => ({ session: guestSession, error: null }) })
  let rememberMe = false
  const manager = createGuestSessionManager({ auth, isAnonymousProviderEnabled: async () => true, beforeSignIn: () => (rememberMe = true) })

  assert.equal(await manager.ensureGuestSession(), guestSession)
  assert.equal(calls.signIn, 1)
  assert.equal(rememberMe, true)
})

test('concurrent calls share one sign-in', async () => {
  const { auth, calls } = fakeAuth({ signIn: () => ({ session: guestSession, error: null }) })
  const manager = createGuestSessionManager({ auth, isAnonymousProviderEnabled: async () => true })

  const [first, second] = await Promise.all([manager.ensureGuestSession(), manager.ensureGuestSession()])
  assert.equal(first, guestSession)
  assert.equal(second, guestSession)
  assert.equal(calls.signIn, 1)
})

test('reuses an existing session instead of creating a user', async () => {
  const { auth, calls } = fakeAuth({ current: accountSession, signIn: () => ({ session: guestSession, error: null }) })
  const manager = createGuestSessionManager({ auth, isAnonymousProviderEnabled: async () => true })

  assert.equal(await manager.ensureGuestSession(), accountSession)
  assert.equal(calls.signIn, 0)
})

test('does not call sign-in when the settings say guest mode is off', async () => {
  const { auth, calls } = fakeAuth({ signIn: () => ({ session: guestSession, error: null }) })
  const manager = createGuestSessionManager({ auth, isAnonymousProviderEnabled: async () => false })

  assert.equal(await manager.isGuestModeAvailable(), false)
  assert.equal(await manager.ensureGuestSession(), null)
  assert.equal(calls.signIn, 0)
})

test('anonymous_provider_disabled quietly falls back and turns guest mode off', async () => {
  const { auth, calls } = fakeAuth({ signIn: () => ({ session: null, error: disabledError }) })
  const manager = createGuestSessionManager({ auth, isAnonymousProviderEnabled: async () => true })

  assert.equal(await manager.ensureGuestSession(), null)
  assert.equal(await manager.isGuestModeAvailable(), false)
  assert.equal(await manager.ensureGuestSession(), null)
  assert.equal(calls.signIn, 1)
})

test('a failing settings check counts as unavailable', async () => {
  const { auth } = fakeAuth({ signIn: () => ({ session: guestSession, error: null }) })
  const manager = createGuestSessionManager({
    auth,
    isAnonymousProviderEnabled: async () => {
      throw new Error('offline')
    },
  })

  assert.equal(await manager.isGuestModeAvailable(), false)
})
