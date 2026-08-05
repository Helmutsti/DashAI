import { useEffect, useRef } from 'react'

export interface SpotifyViewProps {
  /** id stabile della card (= Column.id), usato come id della webview nativa lato Rust. */
  playerId: string
  /** Nasconde la webview nativa: serve quando sopra la card si apre un
   *  elemento del DOM (es. il menu della card, reso in portale) che altrimenti
   *  resterebbe coperto — le webview native stanno sempre sopra al resto
   *  dell'interfaccia, lo z-index CSS non le tocca. */
  hidden: boolean
  /** true = restringe la webview alla larghezza del layout mobile di Spotify
   *  (centrata nell'area della card) invece di occuparla tutta. */
  mobile: boolean
}

/** Sotto questa larghezza il layout responsive di Spotify passa alla
 *  versione mobile — abbastanza stretta da restare sotto i breakpoint usuali. */
const MOBILE_WIDTH = 420

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

function sameBounds(a: Bounds, b: Bounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

/** Restringe e centra il rettangolo alla larghezza mobile, se richiesto e se
 *  la card è effettivamente più larga di quella soglia. */
function applyMobile(b: Bounds, mobile: boolean): Bounds {
  if (!mobile || b.width <= MOBILE_WIDTH) return b
  return { x: b.x + (b.width - MOBILE_WIDTH) / 2, y: b.y, width: MOBILE_WIDTH, height: b.height }
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
const ZERO: Bounds = { x: 0, y: 0, width: 0, height: 0 }

export default function SpotifyView(props: SpotifyViewProps): React.ReactElement {
  const { playerId } = props
  const hostRef = useRef<HTMLDivElement>(null)
  // Letto dentro il loop rAF (che monta una volta sola su playerId): un ref
  // tiene il valore aggiornato senza dover rimontare/riaprire la webview a
  // ogni cambio di `hidden`.
  const hiddenRef = useRef(props.hidden)
  hiddenRef.current = props.hidden
  const mobileRef = useRef(props.mobile)
  mobileRef.current = props.mobile

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
      const b = hiddenRef.current ? ZERO : applyMobile(readBounds(), mobileRef.current)
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
