import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppWindow, SquareSplitHorizontal, SquareSplitVertical } from '@phosphor-icons/react'
import type { Placement } from './types'

export interface ChatPlaceMenuProps {
  /** punto del clic destro, in coordinate della finestra */
  x: number
  y: number
  onPick: (place: Placement) => void
  onClose: () => void
}

const CHOICES: { place: Placement; label: string; Icon: typeof AppWindow }[] = [
  { place: 'replace', label: 'Apri', Icon: AppWindow },
  { place: 'right', label: 'Affianca a destra', Icon: SquareSplitHorizontal },
  { place: 'below', label: 'Affianca sotto', Icon: SquareSplitVertical }
]

/** Menu del clic destro su una chat attiva: dove portarla sullo schermo. */
export default function ChatPlaceMenu(props: ChatPlaceMenuProps): React.ReactElement {
  const boxRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Si apre nel punto del clic, spostato quanto basta per restare nella finestra.
  useLayoutEffect(() => {
    const r = boxRef.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.min(props.x, window.innerWidth - r.width - 8)
    const top = Math.min(props.y, window.innerHeight - r.height - 8)
    setPos({ left: Math.max(8, left), top: Math.max(8, top) })
  }, [props.x, props.y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  return createPortal(
    <>
      <div
        onClick={props.onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          props.onClose()
        }}
        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
      />
      <div ref={boxRef} style={{ ...popover, ...(pos ?? { left: props.x, top: props.y, visibility: 'hidden' }) }}>
        {CHOICES.map(({ place, label, Icon }) => (
          <div
            key={place}
            className="menu-item"
            style={item}
            onClick={() => {
              props.onPick(place)
              props.onClose()
            }}
          >
            <Icon size={15} style={{ flex: '0 0 auto' }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </>,
    document.body
  )
}

const popover: React.CSSProperties = {
  position: 'fixed',
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  padding: 'var(--space-2)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-neutral-700)',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--shadow-md)'
}

const item: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13,
  color: 'var(--color-text)',
  cursor: 'pointer',
  whiteSpace: 'nowrap'
}
