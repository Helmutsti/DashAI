import { useEffect, useState } from 'react'

/** Altezza della striscia in alto su Windows: quella dei pulsanti della finestra. */
export const WIN_TITLEBAR_PX = 32

/**
 * Riduci, ingrandisci/ripristina e chiudi, in alto a destra (Windows).
 * Le icone sono tratti sottili come quelle di sistema; "chiudi" diventa rosso
 * al passaggio del mouse.
 */
export default function WindowControls(): React.ReactElement {
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    const refresh = (): void => void window.dashai.win.isMaximized().then(setMaximized)
    refresh()
    return window.dashai.win.onResized(refresh)
  }, [])

  return (
    <div className="win-controls">
      <button className="win-btn" title="Riduci a icona" onClick={() => void window.dashai.win.minimize()}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M0 5.5h10" />
        </svg>
      </button>
      <button
        className="win-btn"
        title={maximized ? 'Ripristina' : 'Ingrandisci'}
        onClick={() => void window.dashai.win.toggleMaximize()}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M2.5 2.5V0.5h7v7h-2" />
            <rect x="0.5" y="2.5" width="7" height="7" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        )}
      </button>
      <button className="win-btn win-btn--close" title="Chiudi" onClick={() => void window.dashai.win.close()}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
        </svg>
      </button>
    </div>
  )
}
