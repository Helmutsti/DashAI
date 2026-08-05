import { useEffect, useRef } from 'react'

export interface SpotifyViewProps {
  /** id stabile della card (= Column.id), usato come id della webview nativa lato Rust. */
  playerId: string
}

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

function sameBounds(a: Bounds, b: Bounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

/**
 * Player Spotify reale, non un iframe: open.spotify.com si rifiuta di essere
 * incapsulato (header `frame-ancestors`), quindi l'unico modo di avere login e
 * riproduzione funzionanti è una webview nativa separata, sovrapposta
 * all'area di questa card (vedi comando Rust `spotify_open`).
 *
 * Essendo una vista nativa e non un nodo del DOM, non segue da sola il layout:
 * va riposizionata a mano ogni volta che questo placeholder si sposta o
 * cambia dimensione. Non esiste un evento DOM generico per "questo elemento
 * si è mosso" (resize, riordino con animazione, sidebar che si
 * comprime/espande non lo emettono), quindi si controlla la posizione a ogni
 * frame invece di provare a intercettare ogni singola causa di spostamento.
 */
export default function SpotifyView(props: SpotifyViewProps): React.ReactElement {
  const { playerId } = props
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let opened = false
    let lastBounds: Bounds | null = null
    let raf = 0

    const readBounds = (): Bounds => {
      const r = host.getBoundingClientRect()
      return { x: r.left, y: r.top, width: r.width, height: r.height }
    }

    const tick = (): void => {
      const b = readBounds()
      const changed = !lastBounds || !sameBounds(lastBounds, b)
      if (changed) {
        if (!opened) {
          // Prima apertura: aspetta una dimensione vera, altrimenti la webview
          // nascerebbe a 0x0 (card non ancora montata/layoutata).
          if (b.width > 0 && b.height > 0) {
            lastBounds = b
            opened = true
            window.dashai.spotify.open(playerId, b)
          }
        } else {
          // Dopo l'apertura si segue anche lo 0x0 (card compressa): altrimenti
          // la webview nativa resterebbe visibile sopra il resto dell'interfaccia.
          lastBounds = b
          window.dashai.spotify.setBounds(playerId, b)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      if (opened) window.dashai.spotify.close(playerId)
    }
  }, [playerId])

  return (
    <div
      ref={hostRef}
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        width: '100%',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden'
      }}
    />
  )
}
