import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { writeClipboard } from './clipboard'
import type { Prompt } from './projects'

export interface PromptMenuProps {
  prompts: Prompt[]
  /** matita: apre il prompt in una finestra accanto alla chat */
  onEdit: (prompt: Prompt) => void
  onNew: () => void
  onDelete: (prompt: Prompt) => void
  copiedLabel: string
}

/**
 * Pulsante "Prompt" nell'intestazione della chat con il suo menu.
 * Clic su un prompt = lo copia negli appunti e mostra «Copiato»;
 * matita = lo apre per modificarlo.
 */
export default function PromptMenu(props: PromptMenuProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const btnRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number; maxHeight: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    setPos({ top: r.bottom + 6, right: window.innerWidth - r.right, maxHeight: window.innerHeight - r.bottom - 18 })
  }, [open])

  const copy = async (p: Prompt): Promise<void> => {
    if (await writeClipboard(p.content)) {
      setCopiedId(p.id)
      setTimeout(() => setCopiedId((c) => (c === p.id ? null : c)), 1400)
    }
  }

  const shown = props.prompts.filter((p) =>
    `${p.label} ${p.content}`.toLowerCase().includes(query.trim().toLowerCase())
  )

  return (
    <>
      <div
        ref={btnRef}
        className="btn btn--ghost"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        style={button}
      >
        <Copy size={14} />
        Prompt
      </div>
      {open &&
        createPortal(
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
            <div style={{ ...popover, ...(pos ?? { visibility: 'hidden' }) }}>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca un prompt"
                style={search}
              />
              {shown.length === 0 && <div style={hint}>Nessun prompt.</div>}
              {shown.map((p) => (
                <div key={p.id} className="menu-item" style={item} title={p.content} onClick={() => void copy(p)}>
                  <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={ellipsis}>{p.label}</span>
                    <span style={{ ...ellipsis, fontSize: 11, color: 'var(--color-neutral-500)' }}>{p.content || '—'}</span>
                  </span>
                  {copiedId === p.id ? (
                    <span style={copied}>
                      <Check size={12} />
                      {props.copiedLabel}
                    </span>
                  ) : (
                    <>
                    <span
                      className="gear-btn"
                      title="Elimina"
                      style={iconBtn}
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onDelete(p)
                      }}
                    >
                      <Trash size={14} />
                    </span>
                    <span
                      className="gear-btn"
                      title="Modifica"
                      style={iconBtn}
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpen(false)
                        props.onEdit(p)
                      }}
                    >
                      <PencilSimple size={15} />
                    </span>
                    </>
                  )}
                </div>
              ))}
              <div style={{ height: 1, background: 'var(--color-divider)' }} />
              <div
                className="menu-item"
                style={item}
                onClick={() => {
                  setOpen(false)
                  props.onNew()
                }}
              >
                <Plus size={14} color="var(--color-neutral-400)" />
                <span style={{ ...ellipsis, color: 'var(--color-neutral-300)' }}>Nuovo prompt</span>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  )
}

const button: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  fontWeight: 500,
  border: '1px solid var(--color-divider)',
  color: 'var(--color-text)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer'
}

// Ruolo "elenco": margine piccolo, voci a distanza di elemento.
const popover: React.CSSProperties = {
  position: 'fixed',
  width: 340,
  overflowY: 'auto',
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
  minWidth: 0
}

const ellipsis: React.CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

const iconBtn: React.CSSProperties = {
  flex: '0 0 auto',
  width: 22,
  height: 22,
  borderRadius: 'var(--radius-sm)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--color-neutral-500)'
}

const copied: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  padding: '2px var(--space-2)',
  borderRadius: 'var(--radius-sm)',
  background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
  color: 'var(--color-accent)',
  fontSize: 11
}

const hint: React.CSSProperties = { fontSize: 11.5, color: 'var(--color-neutral-500)' }

const search: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  color: 'var(--color-text)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-divider)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3)'
}
