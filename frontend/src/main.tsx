import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.tsx'
import { preloadChibiImages } from './utils/chibiImageCache'
import homeChibi from './assets/chibis/public/chibi-welcome-page.webp'
import aboutChibi from './assets/chibis/trust-pages/chibi-about.webp'
import searchBeforeChibi from './assets/chibis/core/search-places/chibi-search-places-before-active-state.webp'
import searchLoadingChibi from './assets/chibis/core/search-places/chibi-search-places-loading-state.webp'
import searchSuccessChibi from './assets/chibis/core/search-places/chibi-search-success.webp'
import askAiOverviewChibi from './assets/chibis/core/ask-ai/chibi-ai-overview.webp'
import askAiStartChibi from './assets/chibis/core/ask-ai/chibi-ask-ai-start.webp'
import askAiThinkingChibi from './assets/chibis/core/ask-ai/chibi-ask-ai-thinking.webp'
import askAiOutputChibi from './assets/chibis/core/ask-ai/chibi-ask-ai-output.webp'
import askAiErrorChibi from './assets/chibis/core/ask-ai/chibi-ask-ai-error.webp'
import protectedFeatureChibi from './assets/chibis/shared-states/chibi-protected-feature.webp'
import favoritesActiveChibi from './assets/chibis/features/favorites/chibi-favorites-active-state.webp'
import historyActiveChibi from './assets/chibis/features/history/chibi-history-active-state.webp'
import promptBuilderOutputChibi from './assets/chibis/features/prompt-builder/chibi-prompt-builder-output.webp'
import promptBuilderQuestionsChibi from './assets/chibis/features/prompt-builder/chibi-prompt-builder-questions.webp'

void preloadChibiImages([
  homeChibi,
  aboutChibi,
  searchBeforeChibi,
  searchLoadingChibi,
  searchSuccessChibi,
  askAiOverviewChibi,
  askAiStartChibi,
  askAiThinkingChibi,
  askAiOutputChibi,
  askAiErrorChibi,
  protectedFeatureChibi,
  favoritesActiveChibi,
  historyActiveChibi,
  promptBuilderOutputChibi,
  promptBuilderQuestionsChibi,
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
