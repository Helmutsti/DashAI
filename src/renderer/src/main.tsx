import React from 'react'
import { createRoot } from 'react-dom/client'

// Font Inter servito localmente (self-contained, nessuna richiesta esterna).
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'

import '@xterm/xterm/css/xterm.css'
import './styles/tokens.css'
import './styles/app.css'
import App from './App'
import DetachedTerminal from './DetachedTerminal'
import { SettingsProvider } from './SettingsContext'
import { createDashaiBridge } from './dashai-bridge'

window.dashai = createDashaiBridge()

const container = document.getElementById('root')
if (!container) throw new Error('#root non trovato')

// Modalità finestra estratta: ?term=<id>&title=..&color=..
const params = new URLSearchParams(window.location.search)
const term = params.get('term')

const root = term ? (
  <DetachedTerminal
    termId={term}
    title={params.get('title') || 'Terminale'}
    color={params.get('color') || ''}
  />
) : (
  <App />
)

createRoot(container).render(
  <React.StrictMode>
    <SettingsProvider>{root}</SettingsProvider>
  </React.StrictMode>
)
