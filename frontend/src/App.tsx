import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'

function App() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    // Get current session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Listen for auth state changes and store JWT
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="flex items-center justify-center h-screen bg-blue-500">
      {session ? (
        <div className="text-center text-white">
          <h1 className="text-4xl font-bold mb-4">GalaTayo 🇵🇭</h1>
          <p className="mb-4">Kumusta, {session.user.email}!</p>
          <button
            onClick={signOut}
            className="bg-white text-blue-500 px-4 py-2 rounded font-bold"
          >
            Sign Out
          </button>
        </div>
      ) : (
        <div className="text-center text-white">
          <h1 className="text-4xl font-bold mb-4">GalaTayo 🇵🇭</h1>
          <button
            onClick={signInWithGoogle}
            className="bg-white text-blue-500 px-4 py-2 rounded font-bold"
          >
            Mag-sign in gamit ang Google
          </button>
        </div>
      )}
    </div>
  )
}

export default App