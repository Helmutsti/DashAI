import { useRef } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

/**
 * Props per l'overlay di un modale: chiude solo se il click nasce *e* finisce
 * sull'overlay stesso.
 *
 * Serve perché l'evento `click` viene emesso sull'antenato comune di mousedown e
 * mouseup: premendo dentro il dialog e rilasciando fuori (es. selezionando testo
 * o trascinando uno slider) il click arriverebbe all'overlay e chiuderebbe la
 * finestra, nonostante lo `stopPropagation` sul dialog.
 */
export function useOverlayDismiss(onClose: () => void): {
  onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => void
  onClick: (e: ReactMouseEvent<HTMLDivElement>) => void
} {
  const pressedOnOverlay = useRef(false)

  return {
    onMouseDown: (e) => {
      pressedOnOverlay.current = e.target === e.currentTarget
    },
    onClick: (e) => {
      const started = pressedOnOverlay.current
      pressedOnOverlay.current = false
      if (started && e.target === e.currentTarget) onClose()
    }
  }
}
