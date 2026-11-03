/**
 * Trascinamento fatto con gli eventi del puntatore, al posto del drag&drop
 * HTML5. La finestra accetta le cartelle trascinate da Esplora file / Finder,
 * e su Windows questo impedisce il drag&drop HTML5 dentro la pagina: schede e
 * progetti si spostano quindi con questo meccanismo, uguale su tutti i sistemi.
 */

/** Movimento minimo (px) prima che una pressione diventi un trascinamento. */
const THRESHOLD_PX = 4

export interface PointerDragHandlers {
  /** il puntatore ha superato la soglia: il trascinamento comincia */
  onStart: () => void
  /** posizione corrente del puntatore, in coordinate della finestra */
  onMove: (x: number, y: number) => void
  /** rilascio: posizione finale, solo se il trascinamento era cominciato */
  onEnd: (x: number, y: number) => void
}

/** Elemento sotto il puntatore che corrisponde al selettore (o a un suo antenato). */
export function hitAt(x: number, y: number, selector: string): HTMLElement | null {
  const el = document.elementFromPoint(x, y)
  return el instanceof HTMLElement ? el.closest<HTMLElement>(selector) : null
}

/**
 * Avvia un possibile trascinamento da una pressione su `source`. Finché il
 * puntatore non si sposta oltre la soglia resta un clic normale. Poi una copia
 * di `source` segue il puntatore e i gestori ricevono le posizioni.
 */
export function startPointerDrag(e: React.PointerEvent, source: HTMLElement, h: PointerDragHandlers): void {
  const startX = e.clientX
  const startY = e.clientY
  const rect = source.getBoundingClientRect()
  let ghost: HTMLElement | null = null

  const place = (x: number, y: number): void => {
    if (!ghost) return
    ghost.style.transform = `translate(${x - startX}px, ${y - startY}px)`
  }

  const onMove = (ev: PointerEvent): void => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD_PX) return
      ghost = source.cloneNode(true) as HTMLElement
      ghost.querySelectorAll('.reorder-wiggle').forEach((n) => n.classList.remove('reorder-wiggle', 'reorder-wiggle--alt'))
      Object.assign(ghost.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: '0',
        pointerEvents: 'none',
        zIndex: '2000',
        opacity: '0.9',
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden'
      })
      document.body.appendChild(ghost)
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'grabbing'
      h.onStart()
    }
    place(ev.clientX, ev.clientY)
    h.onMove(ev.clientX, ev.clientY)
  }

  const finish = (ev: PointerEvent, drop: boolean): void => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    if (!ghost) return
    ghost.remove()
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    // Un rilascio annullato (es. la finestra perde il puntatore) finisce fuori
    // da ogni bersaglio: nessuno spostamento.
    h.onEnd(drop ? ev.clientX : -1, drop ? ev.clientY : -1)
  }
  const onUp = (ev: PointerEvent): void => finish(ev, true)
  const onCancel = (ev: PointerEvent): void => finish(ev, false)

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
}
