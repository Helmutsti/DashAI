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
import { SettingsProvider } from './SettingsContext'
import { createDashaiBridge } from './dashai-bridge'
import { createBrowserBridge } from './dashai-bridge.browser'

// Fuori dal webview Tauri (es. anteprima in Chrome durante lo sviluppo) non
// esiste `__TAURI_INTERNALS__`: si usa un bridge di scorta in memoria così la
// UI resta provabile senza compilare/avviare il backend nativo.
const isTauri = '__TAURI_INTERNALS__' in window
window.dashai = isTauri ? createDashaiBridge() : createBrowserBridge()

const container = document.getElementById('root')
if (!container) throw new Error('#root non trovato')

createRoot(container).render(
  <React.StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </React.StrictMode>
)
