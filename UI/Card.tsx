import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CaretDown,
  CaretUp,
  DotsThreeOutline,
  PencilSimple,
  Plus,
  X
} from '@phosphor-icons/react'
import type { CSSProperties } from 'react'
import TerminalView from './TerminalView'
import PromptView from './PromptView'
import SpotifyView from './SpotifyView'
import type { Column } from './types'

/** Altezza approssimativa del menu a comparsa, per decidere se aprirlo sopra o sotto. */
const MENU_HEIGHT_ESTIMATE = 190

/** Larghezza minima del menu, usata anche per non farlo sbordare a destra. */
const MENU_WIDTH = 168

export interface CardProps {
  r: number
  c: number
  col: Column
  /** etichetta del progetto di appartenenza, mostrata come prefisso del titolo */
  projectLabel?: string
  isMenuOpen: boolean
  isEditing: boolean
  isDragged: boolean
  /** card col fuoco: bersaglio delle shortcut (Ctrl+Tab, Alt+N, …) */
  isActive: boolean
  /** l'utente ha interagito con questa card: diventa quella attiva */
  onActivate: () => void
  /** true se le card sono affiancate nella traccia, false se impilate. */
  byRows: boolean
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
  /** (card prompt) salva il testo corrente nel progetto. */
  onSavePrompt: (content: string) => void
  /** (card prompt) aggiorna il testo nello stato di App a ogni battuta. */
  onChangePrompt: (content: string) => void
}

export default function Card(props: CardProps): React.ReactElement {
  const { r, c, col, projectLabel, isMenuOpen, isEditing, isDragged, isActive, byRows, dropSide } =
    props
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)

  // Posiziona il menu (reso in portale) sotto il trigger, in coordinate viewport.
  // Se non c'è spazio sotto (card in fondo alla finestra), lo apre sopra invece.
  // Il trigger sta a sinistra dell'header, quindi il menu è allineato a sinistra
  // (rientrando se sborderebbe dal lato destro della finestra).
  useLayoutEffect(() => {
    if (isMenuOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const left = Math.max(6, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 6))
      const spaceBelow = window.innerHeight - rect.bottom
      if (spaceBelow < MENU_HEIGHT_ESTIMATE + 6) {
        setMenuPos({ bottom: window.innerHeight - rect.top + 6, left })
      } else {
        setMenuPos({ top: rect.bottom + 6, left })
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
  // Bordo vero (non box-shadow): un box-shadow con colore semi-trasparente
  // arrotonda gli angoli in modo diverso da un border reale sotto WebKit,
  // deformando visibilmente il radius rispetto al resto della card.
  // Card appena raggiunta da tastiera: bordo a contrasto per un istante (App
  // spegne `isActive` da solo). Il colore accent è opaco, quindi non deforma il
  // radius come farebbe un bordo semi-trasparente (vedi nota sopra).
  const cardBorderColor = isActive
    ? 'var(--color-accent)'
    : color
      ? `color-mix(in srgb, ${color} 30%, transparent)`
      : 'var(--color-neutral-800)'
  // La barra di inserimento va sul lato da cui la card entrerà: i bordi
  // verticali quando le card sono affiancate, quelli orizzontali se impilate.
  const shadows: string[] = []
  if (dropSide === 'before') shadows.push(byRows ? 'inset 4px 0 0 var(--color-accent)' : 'inset 0 4px 0 var(--color-accent)')
  if (dropSide === 'after') shadows.push(byRows ? 'inset -4px 0 0 var(--color-accent)' : 'inset 0 -4px 0 var(--color-accent)')
  if (isActive) shadows.push('0 0 0 1px var(--color-accent)')

  const isPrompt = col.kind === 'prompt'
  const isSpotify = col.kind === 'spotify'
  const title =
    col.title || (isPrompt ? 'Nuovo prompt' : isSpotify ? 'Spotify' : `Scheda ${r + 1}.${c + 1}`)

  return (
    <div
      data-card-id={col.id}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      // capture: qualsiasi interazione dentro la card (anche nel terminale, che
      // ferma la propagazione dei suoi eventi) la rende quella attiva.
      onPointerDownCapture={props.onActivate}
      onFocusCapture={props.onActivate}
      style={{
        // Compressa: si riduce alla sola intestazione invece di stirarsi come le
        // card sorelle ancora espanse nella stessa traccia. L'altezza è l'asse
        // trasversale quando le card sono affiancate (basta `alignSelf`) e quello
        // principale quando sono impilate (serve rinunciare al `flex-grow`).
        flex: col.collapsed && !byRows ? '0 0 auto' : `${col.w} 1 0%`,
        alignSelf: col.collapsed && byRows ? 'flex-start' : 'stretch',
        position: 'relative',
        zIndex: isMenuOpen ? 5 : 1,
        opacity: isDragged ? 0.4 : 1,
        background: cardBg,
        border: `1px solid ${cardBorderColor}`,
        boxShadow: shadows.length > 0 ? shadows.join(', ') : undefined,
        // L'evidenziazione entra netta e sfuma: senza transizione lo stacco
        // sarebbe uno sfarfallio a ogni Ctrl+Tab.
        transition: isActive
          ? 'border-color 0.08s ease, box-shadow 0.08s ease'
          : 'border-color 0.4s ease, box-shadow 0.4s ease',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
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
          cursor: isDragged ? 'grabbing' : 'grab'
        }}
      >
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
              color: 'var(--color-text)',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-accent)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 6px'
            }}
          />
        ) : (
          // "PROGETTO · Titolo scheda": il solo titolo non basta a riconoscere
          // a colpo d'occhio a quale progetto appartiene una card. Il nome del
          // progetto porta il suo colore, il titolo resta in testo normale.
          <div
            onDoubleClick={props.onRename}
            title={projectLabel ? `${projectLabel} · ${title}` : title}
            style={{
              flex: '1 1 auto',
              minWidth: 0,
              display: 'flex',
              alignItems: 'baseline',
              gap: 4,
              overflow: 'hidden',
              fontFamily: 'var(--font-heading)',
              fontSize: 11,
              fontWeight: 600,
              // il contenitore occupa tutto lo spazio libero dell'header: qui
              // vale il cursore di trascinamento, il cursore di testo compare
              // solo sopra le stringhe vere (vedi span sotto)
              cursor: 'inherit'
            }}
          >
            {projectLabel && (
              <>
                {/* si accorcia prima del titolo, che è l'informazione più specifica */}
                <span
                  style={{
                    flex: '0 1 auto',
                    minWidth: 0,
                    maxWidth: '50%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: color || 'var(--color-accent)',
                    cursor: 'text'
                  }}
                >
                  {projectLabel}
                </span>
                <span style={{ flex: '0 0 auto', color: 'var(--color-neutral-500)', cursor: 'text' }}>
                  ·
                </span>
              </>
            )}
            <span
              style={{
                // non `1 1 auto`: lo span si fermerebbe al bordo dell'header
                // anche con titoli corti, portando il cursore di testo su
                // spazio vuoto che invece serve al drag
                flex: '0 1 auto',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: projectLabel ? 'var(--color-text)' : color || 'var(--color-accent)',
                letterSpacing: projectLabel ? undefined : '0.08em',
                textTransform: projectLabel ? undefined : 'uppercase',
                cursor: 'text'
              }}
            >
              {title}
            </span>
          </div>
        )}

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
                left: menuPos.left,
                zIndex: 1000,
                minWidth: MENU_WIDTH,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: 'var(--space-1)',
                background: 'var(--color-surface)',
                boxShadow: 'var(--shadow-md)',
                borderRadius: 'var(--radius-md)'
              }}
            >
              {!isPrompt && !isSpotify && (
                <div className="menu-item" onClick={props.onNewCard} style={menuItemStyle}>
                  <Plus size={16} />
                  Nuova scheda
                </div>
              )}
              <div className="menu-item" onClick={props.onRename} style={menuItemStyle}>
                <PencilSimple size={16} />
                Rinomina
              </div>
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
              <div
                className="menu-item menu-item--danger"
                onClick={props.onClose}
                style={{ ...menuItemStyle, color: 'var(--color-danger)' }}
              >
                <X size={16} />
                Chiudi
              </div>
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
            content={col.content ?? ''}
            onChange={props.onChangePrompt}
            saved={!!col.promptId}
            onSave={props.onSavePrompt}
          />
        ) : isSpotify ? (
          <SpotifyView playerId={col.id} />
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
