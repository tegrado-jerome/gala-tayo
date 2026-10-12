import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { IconContext } from '@phosphor-icons/react/dist/lib/context'
import './index.css'
import App from './App.tsx'
import { installErrorReporting } from './utils/errorReporting'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // A newer deploy's worker has taken over: move this tab onto that build so it never asks for files
  // the deploy removed. A tab in the background reloads now; one in use waits for its next navigation.
  const pageBuild = document.querySelector('meta[name="galatayo-build"]')?.getAttribute('content')
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'sw-activated' || !pageBuild || event.data.build === pageBuild) return
    if (document.visibilityState === 'hidden') window.location.reload()
    else window.addEventListener('popstate', () => window.location.reload(), { once: true })
  })
  // Prerendered pages start the app after the load event (public/boot.js), so a load listener alone never fires there.
  const registerWorker = () => navigator.serviceWorker.register('/sw.js').catch(() => {})
  if (document.readyState === 'complete') registerWorker()
  else window.addEventListener('load', registerWorker)
}

installErrorReporting()

const BOOT_TIMEOUT_MS = 5000

// Prerendered pages arrive with finished HTML in #root. Rendering straight into it would blank the
// page (and drop the hero that is already painting) while the route chunk and its data load, so the
// app renders hidden next to it and takes over once its page is ready. Links in the prerendered copy
// work as plain links; a tap on anything else hands over early so the live version can answer it.
function getAppContainer() {
  const prerendered = document.getElementById('root')!
  if (!prerendered.firstElementChild) return prerendered
  // A signed-in visit to `/` sits behind index.html's splash until its own Home is ready; the guest copy is not needed.
  if (document.documentElement.hasAttribute('data-signed-in')) {
    prerendered.replaceChildren()
    return prerendered
  }

  const app = document.createElement('div')
  app.className = 'app-booting'
  prerendered.id = 'root-prerendered'
  app.id = 'root'
  prerendered.after(app)

  const isReady = () => app.querySelector('h1') && !app.querySelector('[aria-busy="true"], .animate-pulse, .g-skel')
  const takeOver = () => {
    observer.disconnect()
    window.clearTimeout(timer)
    prerendered.removeEventListener('click', onEarlyClick, true)
    prerendered.remove()
    app.classList.remove('app-booting')
  }
  const onEarlyClick = (event: MouseEvent) => {
    if (!(event.target as Element).closest('a[href]')) takeOver()
  }
  const observer = new MutationObserver(() => {
    if (isReady()) takeOver()
  })
  observer.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy', 'class'] })
  const timer = window.setTimeout(takeOver, BOOT_TIMEOUT_MS)
  prerendered.addEventListener('click', onEarlyClick, true)
  return app
}

createRoot(getAppContainer()).render(
  <StrictMode>
    {/* Phosphor defaults to 1em; 24px keeps icons the size the layout was drawn for. */}
    <IconContext.Provider value={{ size: 24 }}>
      <App />
    </IconContext.Provider>
  </StrictMode>,
)
