import { createContext, useContext, useState, type ReactNode } from 'react'

type BottomNavContextValue = {
  hidden: boolean
  setHidden: (hidden: boolean) => void
}

const BottomNavContext = createContext<BottomNavContextValue>({
  hidden: false,
  setHidden: () => {},
})

export function BottomNavProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false)
  return (
    <BottomNavContext.Provider value={{ hidden, setHidden }}>
      {children}
    </BottomNavContext.Provider>
  )
}

export function useBottomNav() {
  return useContext(BottomNavContext)
}

export { BottomNavContext }
