import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowSquareOut,
  CaretDown,
  CaretRight,
  CaretUp,
  DotsThreeOutline,
  PencilSimple,
  Plus,
  Trash
} from '@phosphor-icons/react'
import type { CSSProperties } from 'react'
import TerminalView from './TerminalView'
import PromptView from './PromptView'
import type { Column } from './types'

/** Altezza approssimativa del menu a comparsa, per decidere se aprirlo sopra o sotto. */
const MENU_HEIGHT_ESTIMATE = 190

export interface CardProps {
  r: number
  c: number
  col: Column
  isMenuOpen: boolean
  isEditing: boolean
  isDragged: boolean
  dropSide: 'before' | 'after' | null
  onToggleMenu: (e: React.MouseEvent) => void
  onRename: (e: React.MouseEvent) => void
  onClose: (e: React.MouseEvent) => void
  onNewCard: (e: React.MouseEvent) => void
  onCommitTitle: (value: string) => void
  onCancelEdit: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  /** invocato quando la shell termina (per l'auto-chiusura "chiudi al termine") */
  onProcessExit: () => void
  onToggleCollapse: () => void
  onDetach: () => void
  /** (card prompt) salva il testo corrente nel progetto. */
  onSavePrompt: (content: string) => void
}

export default function Card(props: CardProps): React.ReactElement {
  const { r, c, col, isMenuOpen, isEditing, isDragged, dropSide } = props
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)

  // Posiziona il menu (reso in portale) sotto il trigger, in coordinate viewport.
  // Se non c'è spazio sotto (card in fondo alla finestra), lo apre sopra invece.
  useLayoutEffect(() => {
    if (isMenuOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const right = window.innerWidth - rect.right
      const spaceBelow = window.innerHeight - rect.bottom
      if (spaceBelow < MENU_HEIGHT_ESTIMATE + 6) {
        setMenuPos({ bottom: window.innerHeight - rect.top + 6, right })
      } else {
        setMenuPos({ top: rect.bottom + 6, right })
      }
    }
  }, [isMenuOpen])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const color = col.color
  const cardBg = color
    ? `color-mix(in srgb, ${color} 15%, var(--color-surface))`
    : 'var(--color-surface)'
  let cardRing = color
    ? `0 0 0 1px color-mix(in srgb, ${color} 30%, transparent)`
    : 'var(--shadow-sm)'
  if (dropSide === 'before') cardRing += ', inset 4px 0 0 var(--color-accent)'
  if (dropSide === 'after') cardRing += ', inset -4px 0 0 var(--color-accent)'

  const isPrompt = col.kind === 'prompt'
  const title = col.title || (isPrompt ? 'Nuovo prompt' : `Scheda ${r + 1}.${c + 1}`)

  return (
    <div
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      style={{
        flex: `${col.w} 1 0%`,
        // Compressa: si riduce alla sola intestazione invece di stirarsi
        // all'altezza delle card sorelle ancora espanse nella stessa riga.
        alignSelf: col.collapsed ? 'flex-start' : 'stretch',
        position: 'relative',
        zIndex: isMenuOpen ? 5 : 1,
        opacity: isDragged ? 0.4 : 1,
        background: cardBg,
        boxShadow: cardRing,
        // La sidebar ha zoom:var(--ui-scale) che scala anche il suo raggio; le
        // card non sono zoomate, quindi scaliamo il raggio a mano per allinearle.
        borderRadius: 'calc(var(--radius-lg) * var(--ui-scale))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        minWidth: 0,
        minHeight: 0,
        overflow: isMenuOpen ? 'visible' : 'hidden'
      }}
    >
      {/* Header = drag handle (draggable qui, non su tutta la card, così il
          terminale resta usabile e selezionabile) */}
      <div
        draggable={!isEditing}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
        style={{
          flex: '0 0 auto',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          width: '100%',
          cursor: 'grab'
        }}
      >
        <div
          className="menu-trigger"
          title={col.collapsed ? 'Espandi' : 'Comprimi'}
          onClick={(e) => {
            e.stopPropagation()
            props.onToggleCollapse()
          }}
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-neutral-500)',
            cursor: 'pointer'
          }}
        >
          {col.collapsed ? <CaretRight size={13} /> : <CaretDown size={13} />}
        </div>
        {isEditing ? (
          <input
            ref={inputRef}
            defaultValue={col.title || ''}
            onBlur={(e) => props.onCommitTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                props.onCommitTitle((e.target as HTMLInputElement).value)
              } else if (e.key === 'Escape') {
                props.onCancelEdit()
              }
            }}
            style={{
              flex: '1 1 auto',
              minWidth: 0,
              fontFamily: 'var(--font-heading)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text)',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-accent)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 6px'
            }}
          />
        ) : (
          <div
            onDoubleClick={props.onRename}
            title="Doppio clic per rinominare"
            style={{
              flex: '1 1 auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-heading)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: color || 'var(--color-accent)',
              cursor: 'text'
            }}
          >
            {title}
          </div>
        )}

        <div
          className="menu-trigger"
          onClick={props.onToggleMenu}
          ref={triggerRef}
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            color: 'var(--color-neutral-500)',
            cursor: 'pointer'
          }}
        >
          <DotsThreeOutline size={16} weight="fill" />
        </div>

        {/* Menu reso in portale su document.body: esce da overflow/stacking
            della card e sta sopra la sidebar. */}
        {isMenuOpen &&
          menuPos &&
          createPortal(
            <div
              style={{
                position: 'fixed',
                top: menuPos.top,
                bottom: menuPos.bottom,
                right: menuPos.right,
                zIndex: 1000,
                minWidth: 168,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: 'var(--space-1)',
                background: 'var(--color-surface)',
                boxShadow: 'var(--shadow-md)',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <div className="menu-item" onClick={props.onRename} style={menuItemStyle}>
                <PencilSimple size={16} />
                Rinomina
              </div>
              <div
                className="menu-item menu-item--danger"
                onClick={props.onClose}
                style={{ ...menuItemStyle, color: 'var(--color-danger)' }}
              >
                <Trash size={16} />
                Chiudi
              </div>
              {!isPrompt && (
                <div className="menu-item" onClick={props.onNewCard} style={menuItemStyle}>
                  <Plus size={16} />
                  Nuova scheda
                </div>
              )}
              <div
                className="menu-item"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onToggleCollapse()
                }}
                style={menuItemStyle}
              >
                {col.collapsed ? <CaretDown size={16} /> : <CaretUp size={16} />}
                {col.collapsed ? 'Espandi' : 'Comprimi'}
              </div>
              {!isPrompt && (
                <div
                  className="menu-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onDetach()
                  }}
                  style={menuItemStyle}
                >
                  <ArrowSquareOut size={16} />
                  Estrai in finestra
                </div>
              )}
            </div>,
            document.body
          )}
      </div>

      {/* Corpo. Resta MONTATO anche se compresso (così la pty non muore e il
          testo del prompt non va perso); viene solo nascosto. */}
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          width: '100%',
          display: col.collapsed ? 'none' : 'flex',
          flexDirection: 'column'
        }}
      >
        {isPrompt ? (
          <PromptView
            termId={col.id}
            initialContent={col.content}
            saved={!!col.promptId}
            onSave={props.onSavePrompt}
          />
        ) : (
          <TerminalView
            termId={col.id}
            shell={col.shell}
            shellPath={col.shellPath}
            cwd={col.cwd}
            startupCommand={col.startupCommand}
            closeOnExit={col.closeOnExit}
            onProcessExit={props.onProcessExit}
          />
        )}
      </div>
    </div>
  )
}

const menuItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13,
  color: 'var(--color-text)',
  cursor: 'pointer'
}
