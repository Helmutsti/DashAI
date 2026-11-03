import { useRef, useState } from 'react'
import { CaretDoubleRight, Gear, X } from '@phosphor-icons/react'
import BrandMark from './BrandMark'
import NewChatButton from './NewChatButton'
import { AgentLogo, detectAgent, type AgentKey } from './agents'
import ChatPlaceMenu from './ChatPlaceMenu'
import { Icon } from './icons'
import type { Column, Placement } from './types'
import type { Project } from './projects'

/** Spazio minimo lasciato ai progetti quando "Chat attive" è allargata al massimo. */
const MIN_PROJECTS_PX = 8
const MIN_CHATS_PX = 72

export interface ChatListProps {
  chats: Column[]
  projects: Project[]
  waiting: Set<string>
  /** chat visibili nell'area a destra */
  visibleIds: Set<string>
  activeId: string | null
  height: number
  onResize: (px: number) => void
  /** elenco dei progetti sopra la sezione: cede lo spazio quando la si allarga */
  projectsRef: React.RefObject<HTMLDivElement>

  /** clic = al posto di quella attiva (o la toglie se è già sullo schermo);
   *  Ctrl/Cmd+clic = affiancata; destro = menu */
  onShow: (id: string, place: Placement, toggle?: boolean) => void
  onClose: (id: string) => void
  /** nuova chat al volo, senza progetto */
  onNewChat: (agent: AgentKey, beside: boolean) => void
  newChatLabel: string
  label: string
}

/** Icona della chat: il logo dell'agente, altrimenti l'icona del comando. */
export function ChatIcon({ col, size, color }: { col: Column; size: number; color: string }): React.ReactElement {
  const agent = detectAgent(col.startupCommand)
  if (agent) return <AgentLogo agent={agent} size={size} color={color} />
  return <Icon name={col.icon ?? 'Terminal'} size={size} color={color} style={{ flex: '0 0 auto' }} />
}

/** Sezione "Chat attive" in fondo alla barra laterale, allargabile con la linea. */
export default function ChatList(props: ChatListProps): React.ReactElement {
  const { chats, projects, waiting, visibleIds, activeId } = props
  const boxRef = useRef<HTMLDivElement>(null)
  const placeMenu = usePlaceMenu(props.onShow)

  // Trascinando la linea si allarga verso l'alto: nessun limite se non quello
  // di lasciare qualche pixel ai progetti, per poterla riportare giù.
  const startResize = (e: React.PointerEvent): void => {
    e.preventDefault()
    const box = boxRef.current
    const projectsBox = props.projectsRef.current
    if (!box || !projectsBox) return
    const startY = e.clientY
    const startH = box.getBoundingClientRect().height
    // Lo spazio in più viene tutto dall'elenco dei progetti, che si riduce
    // fino a una striscia minima.
    const max = startH + projectsBox.getBoundingClientRect().height - MIN_PROJECTS_PX
    const onMove = (ev: PointerEvent): void => {
      props.onResize(Math.max(MIN_CHATS_PX, Math.min(max, startH + (startY - ev.clientY))))
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Raggruppate per progetto, nell'ordine dei progetti; le chat senza progetto in coda.
  const groups: { key: string; label: string; color: string; items: Column[] }[] = []
  for (const p of projects) {
    const items = chats.filter((c) => c.projectId === p.id)
    if (items.length) groups.push({ key: p.id, label: p.label, color: p.color, items })
  }
  const orphans = chats.filter((c) => !projects.some((p) => p.id === c.projectId))
  if (orphans.length) groups.push({ key: '_', label: '', color: 'var(--color-neutral-500)', items: orphans })

  return (
    <div
      ref={boxRef}
      // Contenitore: i blocchi (linea, titolo, elenco) stanno a distanza di
      // gap; nessun figlio ha margini propri.
      style={{ flex: `0 0 ${props.height}px`, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
    >
      {/* Linea trascinabile con la presa al centro */}
      <div className="chats-handle" onPointerDown={startResize}>
        <span className="chats-handle-line" />
        <span className="chats-handle-grip" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={titleStyle}>{props.label}</span>
        <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>{chats.length}</span>
      </div>
      {/* Elenco: gruppi a distanza di blocco, righe dello stesso gruppo a distanza di elemento */}
      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {groups.map((g) => (
          <div key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {g.label && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color, flex: '0 0 auto' }} />
                <span style={{ fontSize: 11, color: 'var(--color-neutral-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.label}
                </span>
              </div>
            )}
            {g.items.map((col) => {
              const isWaiting = waiting.has(col.id)
              const isVisible = visibleIds.has(col.id)
              const cls = `chat-row${isWaiting ? ' is-waiting' : ''}${isVisible ? ' is-visible' : ''}${
                activeId === col.id ? ' is-active' : ''
              }`
              return (
                <div
                  key={col.id}
                  className={cls}
                  title={col.startupCommand || col.title}
                  {...placeMenu.handlers(col.id)}
                >
                  <span style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                    <ChatIcon col={col} size={14} color={isWaiting ? 'var(--color-attention)' : 'var(--color-neutral-300)'} />
                  </span>
                  <span className="chat-row-title">{col.title || col.startupCommand || '—'}</span>
                  {isWaiting && <span className="attention-badge">!</span>}
                  <span
                    className="chat-row-close"
                    title="Chiudi la sessione"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onClose(col.id)
                    }}
                  >
                    <X size={13} />
                  </span>
                </div>
              )
            })}
          </div>
        ))}
        <NewChatButton variant="row" label={props.newChatLabel} onPick={props.onNewChat} />
        {chats.length === 0 && (
          <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-neutral-500)' }}>
            Nessuna chat attiva. Lancia un agente da un progetto.
          </div>
        )}
      </div>
      {placeMenu.menu}
    </div>
  )
}

/**
 * Clic su una chat attiva: semplice = al posto di quella attiva, con Ctrl/Cmd =
 * affiancata, destro = menu per scegliere dove.
 */
function usePlaceMenu(onShow: (id: string, place: Placement, toggle?: boolean) => void): {
  handlers: (id: string) => Pick<React.HTMLAttributes<HTMLElement>, 'onClick' | 'onContextMenu'>
  menu: React.ReactElement | null
} {
  const [open, setOpen] = useState<{ id: string; x: number; y: number } | null>(null)
  return {
    handlers: (id) => ({
      onClick: (e) => (e.ctrlKey || e.metaKey ? onShow(id, 'right') : onShow(id, 'replace', true)),
      onContextMenu: (e) => {
        e.preventDefault()
        setOpen({ id, x: e.clientX, y: e.clientY })
      }
    }),
    menu: open && (
      <ChatPlaceMenu x={open.x} y={open.y} onPick={(place) => onShow(open.id, place)} onClose={() => setOpen(null)} />
    )
  }
}

export interface ChatRailProps {
  chats: Column[]
  waiting: Set<string>
  activeId: string | null
  topInset: number
  onOpen: () => void
  onShow: (id: string, place: Placement, toggle?: boolean) => void
  onSettings: () => void
  onNewChat: (agent: AgentKey, beside: boolean) => void
  newChatLabel: string
  openLabel: string
}

/** Barra laterale chiusa: colonna stretta con le chat attive e i loro avvisi. */
export function ChatRail(props: ChatRailProps): React.ReactElement {
  const placeMenu = usePlaceMenu(props.onShow)
  return (
    <div
      style={{
        flex: '0 0 32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-2)'
      }}
    >
      <BrandMark size={24} />
      <div className="gear-btn" title={props.openLabel} onClick={props.onOpen} style={railBtn}>
        <CaretDoubleRight size={15} />
      </div>
      <NewChatButton variant="icon" label={props.newChatLabel} onPick={props.onNewChat} />
      <span style={{ width: 24, height: 1, background: 'var(--color-divider)' }} />
      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
        {props.chats.map((col) => {
          const isWaiting = props.waiting.has(col.id)
          return (
            <div
              key={col.id}
              className={`rail-chat${isWaiting ? ' is-waiting' : ''}${props.activeId === col.id ? ' is-active' : ''}`}
              title={col.title}
              {...placeMenu.handlers(col.id)}
            >
              <ChatIcon col={col} size={16} color={isWaiting ? 'var(--color-attention)' : 'var(--color-neutral-400)'} />
              {isWaiting && <span className="attention-badge attention-badge--small">!</span>}
            </div>
          )
        })}
      </div>
      <div className="gear-btn" title="Impostazioni" onClick={props.onSettings} style={railBtn}>
        <Gear size={17} />
      </div>
      {placeMenu.menu}
    </div>
  )
}

const titleStyle: React.CSSProperties = {
  flex: '1 1 auto',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-neutral-500)'
}

const railBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 'var(--radius-sm)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--color-neutral-400)',
  cursor: 'pointer'
}
