import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus } from '@phosphor-icons/react'
import { AGENT_KEYS, AGENT_LABEL, AgentLogo, type AgentKey } from './agents'

export interface NewChatButtonProps {
  /** 'row': riga in fondo a "Chat attive"; 'icon': pulsante della barra chiusa */
  variant: 'row' | 'icon'
  label: string
  /** clic = al posto della chat attiva; Ctrl/Cmd+clic = affiancata */
  onPick: (agent: AgentKey, beside: boolean) => void
}

/** Nuova chat al volo, senza progetto: sceglie l'agente e parte dalla cartella utente. */
export default function NewChatButton(props: NewChatButtonProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<React.CSSProperties | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    // In fondo alla barra si apre verso l'alto; dalla barra chiusa, a destra.
    setPos(
      props.variant === 'row'
        ? { bottom: window.innerHeight - r.top + 4, left: r.left }
        : { top: r.top, left: r.right + 6 }
    )
  }, [open, props.variant])

  return (
    <>
      <div
        ref={ref}
        className={props.variant === 'row' ? 'chat-row' : 'gear-btn'}
        title={props.label}
        onClick={() => setOpen((o) => !o)}
        style={props.variant === 'row' ? undefined : iconBtn}
      >
        {props.variant === 'row' ? (
          <>
            <span style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <Plus size={14} color="var(--color-neutral-400)" />
            </span>
            <span className="chat-row-title" style={{ color: 'var(--color-neutral-300)', fontWeight: 400 }}>
              {props.label}
            </span>
          </>
        ) : (
          <Plus size={16} />
        )}
      </div>
      {open &&
        createPortal(
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
            <div style={{ ...popover, ...(pos ?? { visibility: 'hidden' }) }}>
              {AGENT_KEYS.map((a) => (
                <div
                  key={a}
                  className="menu-item"
                  style={item}
                  onClick={(e) => {
                    setOpen(false)
                    props.onPick(a, e.ctrlKey || e.metaKey)
                  }}
                >
                  <AgentLogo agent={a} size={14} color="var(--color-neutral-300)" />
                  <span>{AGENT_LABEL[a]}</span>
                </div>
              ))}
            </div>
          </>,
          document.body
        )}
    </>
  )
}

const iconBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 'var(--radius-sm)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--color-neutral-400)',
  cursor: 'pointer',
  flex: '0 0 auto'
}

// Ruolo "elenco": margine piccolo, voci a distanza di elemento.
const popover: React.CSSProperties = {
  position: 'fixed',
  width: 200,
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
  cursor: 'pointer'
}
