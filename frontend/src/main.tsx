import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { IconContext } from '@phosphor-icons/react/dist/lib/context'
import './index.css'
import App from './App.tsx'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Phosphor defaults to 1em; 24px keeps icons the size the layout was drawn for. */}
    <IconContext.Provider value={{ size: 24 }}>
      <App />
    </IconContext.Provider>
  </StrictMode>,
)
