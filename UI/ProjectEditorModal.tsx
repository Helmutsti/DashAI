import { useState } from 'react'
import { CaretDown, FolderOpen, Plus, Trash, X } from '@phosphor-icons/react'
import type { CSSProperties } from 'react'
import {
  shellOptionsFor,
  TOP_COLORS,
  makeCommand,
  type Project,
  type QuickCommand,
  type ShellKey,
  type ShellOption
} from './projects'
import { ICON_NAMES, Icon, type IconName } from './icons'
import { useOverlayDismiss } from './useOverlayDismiss'

export interface ProjectEditorModalProps {
  project: Project
  /** true se Ã¨ una bozza non ancora salvata */
  isNew?: boolean
  onSave: (p: Project) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export default function ProjectEditorModal(props: ProjectEditorModalProps): React.ReactElement {
  const [draft, setDraft] = useState<Project>(props.project)
  const overlayDismiss = useOverlayDismiss(props.onClose)
  // Opzioni shell in base al sistema (Windows: PowerShell/cmd/â€¦; macOS/Linux: zsh/bash/â€¦).
  const shellOptions = shellOptionsFor(window.dashai?.platform ?? 'win32')
  const set = <K extends keyof Project>(k: K, v: Project[K]): void =>
    setDraft((d) => ({ ...d, [k]: v }))

  const setCommand = (id: string, patch: Partial<QuickCommand>): void =>
    setDraft((d) => ({
      ...d,
      commands: d.commands.map((c) => (c.id === id ? { ...c, ...patch } : c))
    }))
  const addCommand = (): void =>
    setDraft((d) => ({ ...d, commands: [...d.commands, makeCommand()] }))
  const removeCommand = (id: string): void =>
    setDraft((d) => ({ ...d, commands: d.commands.filter((c) => c.id !== id) }))

  return (
    <div {...overlayDismiss} style={overlayStyle}>
      <div role="dialog" aria-modal="true" style={dialogStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ flex: '1 1 auto', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>
            {props.isNew ? 'Nuovo progetto' : 'Progetto'}
          </div>
          <div className="menu-trigger" onClick={props.onClose} title="Chiudi" style={iconBtnStyle}>
            <X size={18} />
          </div>
        </div>

        {/* Corpo scrollabile: il padding in fondo evita che il bordo dell'ultima
            sezione resti incollato (e tagliato dall'arrotondamento subpixel di
            scrollHeight) sul bordo inferiore dell'area che scorre. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-5)',
            overflowY: 'auto',
            paddingBottom: 'var(--space-3)',
            // Riserva il gutter della barra su entrambi i lati: il contenuto
            // resta centrato nel dialog invece di essere spinto a sinistra.
            scrollbarGutter: 'stable both-edges'
          }}
        >
          {/* Sezione: Progetto */}
          <section style={sectionStyle}>
            <div style={sectionTitleStyle}>Progetto</div>
            <label style={fieldStyle}>
              <span style={labelStyle}>Nome del progetto</span>
              <input
                type="text"
                value={draft.label}
                placeholder="Es. YoutubeCatalog"
                onChange={(e) => set('label', e.target.value)}
                style={controlStyle}
              />
            </label>
            <div style={fieldStyle}>
              <span style={labelStyle}>Colore</span>
              <ColorDots value={draft.color} onPick={(c) => set('color', c)} />
            </div>
            <label style={fieldStyle}>
              <span style={labelStyle}>Cartella</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <input
                  type="text"
                  value={draft.cwd}
                  placeholder="percorso della cartella"
                  onChange={(e) => set('cwd', e.target.value)}
                  style={{ ...controlStyle, flex: '1 1 auto' }}
                />
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={async () => {
                    try {
                      const dir = await window.dashai.pickDirectory()
                      if (dir) set('cwd', dir)
                    } catch (err) {
                      console.error('Impossibile aprire il selettore cartella', err)
                    }
                  }}
                  style={{ ...btnBase, whiteSpace: 'nowrap' }}
                >
                  <FolderOpen size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  Scegli
                </button>
              </div>
            </label>
          </section>

          {/* Sezione: Terminali lanciabili dalla sidebar (shell scelta per singolo comando) */}
          <section style={sectionStyle}>
            <div style={sectionTitleStyle}>Terminali</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span style={{ ...labelStyle, flex: '1 1 auto' }}>Terminali del progetto</span>
              <button type="button" className="btn btn--ghost" onClick={addCommand} style={btnBase}>
                <Plus size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Aggiungi
              </button>
            </div>
            {draft.commands.length === 0 && (
              <span style={hintStyle}>
                Nessun terminale. Aggiungine uno per lanciarlo con un clic dalla sidebar.
              </span>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {draft.commands.map((cmd) => (
                <div
                  key={cmd.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-3)',
                    border: '1px solid var(--color-divider)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <IconDropdown value={cmd.icon} onPick={(n) => setCommand(cmd.id, { icon: n })} />
                    <input
                      type="text"
                      value={cmd.label}
                      placeholder="Label"
                      onChange={(e) => setCommand(cmd.id, { label: e.target.value })}
                      style={{ ...controlStyle, flex: '1 1 auto' }}
                    />
                    <ShellDropdown
                      options={shellOptions}
                      value={cmd.shell}
                      onPick={(s) => setCommand(cmd.id, { shell: s })}
                    />
                    <button
                      type="button"
                      className="menu-item menu-item--danger"
                      onClick={() => removeCommand(cmd.id)}
                      title="Rimuovi comando"
                      style={{ ...iconBtnStyle, color: 'var(--color-danger)' }}
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={cmd.command}
                    placeholder="comando da eseguire, es. npm run dev"
                    onChange={(e) => setCommand(cmd.id, { command: e.target.value })}
                    style={{
                      ...controlStyle,
                      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                      fontSize: 12
                    }}
                  />
                  {cmd.shell === 'custom' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <input
                        type="text"
                        value={cmd.shellPath ?? ''}
                        placeholder="Percorso eseguibile shell, es. /opt/homebrew/bin/nu"
                        onChange={(e) => setCommand(cmd.id, { shellPath: e.target.value })}
                        style={{
                          ...controlStyle,
                          flex: '1 1 auto',
                          fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                          fontSize: 12
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={async () => {
                          try {
                            const file = await window.dashai.pickFile()
                            if (file) setCommand(cmd.id, { shellPath: file })
                          } catch (err) {
                            console.error('Impossibile aprire il selettore file', err)
                          }
                        }}
                        style={{ ...btnBase, whiteSpace: 'nowrap' }}
                      >
                        <FolderOpen size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        Scegli
                      </button>
                    </div>
                  )}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      fontSize: 12.5,
                      color: 'var(--color-neutral-300)',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={cmd.closeOnExit}
                      onChange={(e) => setCommand(cmd.id, { closeOnExit: e.target.checked })}
                      style={{ accentColor: 'var(--color-accent)', cursor: 'pointer' }}
                    />
                    Chiudi al termine
                  </label>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Azioni */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {!props.isNew && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => props.onDelete(draft.id)}
              style={{ ...btnBase, color: 'var(--color-danger)', borderColor: 'var(--color-divider)' }}
            >
              Elimina progetto
            </button>
          )}
          <div style={{ flex: '1 1 auto' }} />
          <button type="button" className="btn btn--ghost" onClick={props.onClose} style={btnBase}>
            Annulla
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => props.onSave(draft)}
            style={{ ...btnBase, background: 'var(--color-accent)', color: 'var(--color-bg)' }}
          >
            Salva
          </button>
        </div>
      </div>
    </div>
  )
}

/** Selettore icona compatto: un pulsante che apre una griglia a comparsa. */
function IconDropdown({
  value,
  onPick
}: {
  value: IconName
  onPick: (n: IconName) => void
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative', flex: '0 0 auto' }}>
      <button
        type="button"
        title="Scegli icona"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: 'var(--space-2)',
          border: '1px solid var(--color-divider)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-bg)',
          color: 'var(--color-neutral-300)',
          cursor: 'pointer'
        }}
      >
        <Icon name={value} size={16} />
        <CaretDown size={10} color="var(--color-neutral-500)" />
      </button>
      {open && (
        <>
          {/* click-away */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: 'absolute',
              // sempre verso l'alto: sotto il trigger lo spazio è quasi sempre
              // insufficiente e il pannello verrebbe tagliato dalla colonna che scorre
              bottom: 'calc(100% + 4px)',
              left: 0,
              zIndex: 41,
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 'var(--space-1)',
              padding: 'var(--space-2)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-neutral-700)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)'
            }}
          >
            {ICON_NAMES.map((name) => {
              const active = value === name
              return (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => {
                    onPick(name)
                    setOpen(false)
                  }}
                  style={{
                    width: 28,
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${active ? 'var(--color-accent)' : 'transparent'}`,
                    background: active ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
                    color: active ? 'var(--color-accent)' : 'var(--color-neutral-300)',
                    cursor: 'pointer'
                  }}
                >
                  <Icon name={name} size={16} />
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/** Etichetta breve per il pulsante chiuso (le label complete sono nel menu). */
function shortShellLabel(key: ShellKey): string {
  switch (key) {
    case 'default':
      return 'Sistema'
    case 'custom':
      return 'Custom'
    default:
      return key
  }
}

/** Selettore shell compatto per singolo comando: un pulsante che apre un menu a comparsa. */
function ShellDropdown({
  options,
  value,
  onPick
}: {
  options: ShellOption[]
  value: ShellKey
  onPick: (s: ShellKey) => void
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative', flex: '0 0 auto' }}>
      <button
        type="button"
        title="Scegli shell"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: 'var(--space-2) var(--space-3)',
          border: '1px solid var(--color-divider)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-bg)',
          color: 'var(--color-neutral-300)',
          fontSize: 12,
          whiteSpace: 'nowrap',
          cursor: 'pointer'
        }}
      >
        {shortShellLabel(value)}
        <CaretDown size={10} color="var(--color-neutral-500)" />
      </button>
      {open && (
        <>
          {/* click-away */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: 'absolute',
              // sempre verso l'alto (vedi IconDropdown)
              bottom: 'calc(100% + 4px)',
              right: 0,
              zIndex: 41,
              minWidth: 200,
              display: 'flex',
              flexDirection: 'column',
              padding: 'var(--space-2)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-neutral-700)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)'
            }}
          >
            {options.map((o) => {
              const active = value === o.key
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => {
                    onPick(o.key)
                    setOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid transparent',
                    background: active
                      ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)'
                      : 'transparent',
                    color: active ? 'var(--color-accent)' : 'var(--color-neutral-200)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function ColorDots({
  value,
  onPick
}: {
  value: string
  onPick: (c: string) => void
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
      {TOP_COLORS.map((color) => {
        const active = value === color
        return (
          <button
            key={color}
            type="button"
            title={color}
            onClick={() => onPick(color)}
            style={{
              width: 14,
              height: 14,
              padding: 0,
              borderRadius: '50%',
              background: color,
              border: '2px solid transparent',
              boxShadow: active ? '0 0 0 1.5px var(--color-surface), 0 0 0 3px var(--color-accent)' : 'none',
              cursor: 'pointer'
            }}
          />
        )
      })}
    </div>
  )
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 100,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-6)'
}
const dialogStyle: CSSProperties = {
  width: 'min(480px, 100%)',
  maxHeight: '86vh',
  background: 'var(--color-surface)',
  boxShadow: 'var(--shadow-lg)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)'
}
const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
  border: '1px solid var(--color-divider)',
  borderRadius: 'var(--radius-md)'
}
const sectionTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-neutral-500)'
}
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }
const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.02em',
  color: 'var(--color-neutral-300)'
}
const hintStyle: CSSProperties = { fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-neutral-500)' }
const controlStyle: CSSProperties = {
  width: '100%',
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  color: 'var(--color-text)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-divider)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3)'
}
const btnBase: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid var(--color-divider)',
  background: 'transparent',
  color: 'var(--color-text)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3) var(--space-5)',
  cursor: 'pointer'
}
const iconBtnStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  border: 'none',
  background: 'transparent',
  color: 'var(--color-neutral-500)',
  cursor: 'pointer',
  borderRadius: 'var(--radius-sm)'
}
