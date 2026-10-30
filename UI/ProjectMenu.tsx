import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowCounterClockwise, CaretLeft } from '@phosphor-icons/react'
import { AGENT_KEYS, AGENT_LABEL, AgentLogo, type AgentKey } from './agents'
import type { AgentSession } from './dashai-bridge'
import { Icon } from './icons'
import type { Project, QuickCommand } from './projects'
import { useSettings } from './SettingsContext'

export interface ProjectMenuProps {
  project: Project
  /** clic = al posto della chat attiva; Ctrl/Cmd+clic = affiancata */
  onAgent: (agent: AgentKey, beside: boolean) => void
  onCommand: (cmd: QuickCommand, beside: boolean) => void
  onResume: (session: AgentSession, beside: boolean) => void
  onClose: () => void
}

function when(ms: number): string {
  const d = new Date(ms)
  const today = new Date()
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return `oggi, ${hm}`
  const y = new Date(today)
  y.setDate(today.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return `ieri, ${hm}`
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

/** Menu del progetto: nuova chat con un agente, riprendi una sessione, comandi. */
export default function ProjectMenu(props: ProjectMenuProps): React.ReactElement {
  const { project } = props
  const [view, setView] = useState<'main' | 'sessions'>('main')
  const [sessions, setSessions] = useState<AgentSession[] | null>(null)
  const [query, setQuery] = useState('')
  // Il menu va in un portale sopra tutto (la barra laterale scorre e lo
  // taglierebbe): si aggancia alla riga del progetto tramite questo segnaposto.
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  useLayoutEffect(() => {
    const r = anchorRef.current?.getBoundingClientRect()
    if (!r) return
    const top = r.bottom + 4
    setPos({ top, left: r.left + 12, maxHeight: window.innerHeight - top - 12 })
  }, [view])
  const { settings } = useSettings()
  const agents = AGENT_KEYS.filter((a) => settings.agents[a].enabled)

  useEffect(() => {
    if (view !== 'sessions' || sessions) return
    window.dashai
      .agentSessions(project.cwd)
      .then(setSessions)
      .catch(() => setSessions([]))
  }, [view, sessions, project.cwd])

  const shown = (sessions ?? []).filter((s) => s.title.toLowerCase().includes(query.trim().toLowerCase()))

  const menu = (
    <>
      <div onClick={props.onClose} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
      <div style={{ ...popover, ...(pos ?? { visibility: 'hidden' }) }}>
        {view === 'main' ? (
          <>
            <div style={sectionTitle}>Nuova chat</div>
            {agents.map((a) => (
              <div key={a} className="menu-item" style={item} onClick={(e) => props.onAgent(a, e.ctrlKey || e.metaKey)}>
                <AgentLogo agent={a} size={14} color="var(--color-neutral-300)" />
                <span style={label}>{AGENT_LABEL[a]}</span>
              </div>
            ))}
            <div className="menu-item" style={item} onClick={() => setView('sessions')}>
              <ArrowCounterClockwise size={14} color="var(--color-neutral-400)" style={{ flex: '0 0 auto' }} />
              <span style={label}>Riprendi una sessione…</span>
            </div>
            <div style={separator} />
            <div style={sectionTitle}>Comandi</div>
            {project.commands.length === 0 && (
              <div style={hint}>Nessun comando: aggiungilo dall’ingranaggio.</div>
            )}
            {project.commands.map((cmd) => (
              <div
                key={cmd.id}
                className="menu-item"
                style={item}
                title={cmd.command || cmd.label}
                onClick={(e) => props.onCommand(cmd, e.ctrlKey || e.metaKey)}
              >
                <Icon name={cmd.icon} size={14} color="var(--color-neutral-400)" style={{ flex: '0 0 auto' }} />
                <span style={label}>{cmd.label}</span>
                {cmd.command && <span style={mono}>{cmd.command}</span>}
              </div>
            ))}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <div className="gear-btn" style={backBtn} onClick={() => setView('main')} title="Indietro">
                <CaretLeft size={14} />
              </div>
              <span style={{ ...sectionTitle, flex: '1 1 auto' }}>Sessioni di {project.label}</span>
            </div>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca nelle sessioni"
              style={search}
            />
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {sessions === null && <div style={hint}>Cerco le sessioni…</div>}
              {sessions !== null && shown.length === 0 && (
                <div style={hint}>
                  {project.cwd ? 'Nessuna sessione di Claude Code o Codex per questa cartella.' : 'Il progetto non ha una cartella.'}
                </div>
              )}
              {shown.map((s) => (
                <div
                  key={s.agent + s.id}
                  className="menu-item"
                  style={{ ...item, alignItems: 'flex-start' }}
                  title={s.title}
                  onClick={(e) => props.onResume(s, e.ctrlKey || e.metaKey)}
                >
                  <span style={{ paddingTop: 2, display: 'flex' }}>
                    <AgentLogo agent={s.agent} size={14} color="var(--color-neutral-300)" />
                  </span>
                  <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ ...label, flex: 'none' }}>{s.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
                      {when(s.updated)}
                      {s.messages !== null ? ` · ${s.messages} messaggi` : ''}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
  return (
    <>
      <span ref={anchorRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      {createPortal(menu, document.body)}
    </>
  )
}

// Il menu è un contenitore: padding e gap sono suoi; le voci hanno solo il
// padding della propria evidenziazione.
const popover: React.CSSProperties = {
  position: 'fixed',
  width: 320,
  overflowY: 'auto',
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  // Ruolo "elenco": margine piccolo, voci a distanza di elemento.
  gap: 'var(--space-1)',
  padding: 'var(--space-2)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-neutral-700)',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--shadow-md)'
}

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-neutral-500)'
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

const label: React.CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

const mono: React.CSSProperties = {
  flex: '0 1 auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
  fontSize: 12,
  color: 'var(--color-neutral-500)'
}

const hint: React.CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.5,
  color: 'var(--color-neutral-500)'
}

const separator: React.CSSProperties = { height: 1, background: 'var(--color-divider)' }

const backBtn: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 'var(--radius-sm)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--color-neutral-400)',
  cursor: 'pointer',
  flex: '0 0 auto'
}

const search: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  color: 'var(--color-text)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-divider)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3)'
}
