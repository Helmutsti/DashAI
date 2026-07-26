import { ArrowSquareIn } from '@phosphor-icons/react'
import TerminalView from './TerminalView'

export interface DetachedTerminalProps {
  termId: string
  title: string
  color: string
}

/**
 * Vista a finestra intera per una card estratta: si aggancia alla pty esistente
 * (attach) senza crearne una nuova. "Riaggancia" chiude la finestra; la
 * principale riprende automaticamente l'output.
 */
export default function DetachedTerminal({
  termId,
  title,
  color
}: DetachedTerminalProps): React.ReactElement {
  // Stesso trattamento cromatico della card in griglia: sfondo tinto + bordo
  // colorato, così la finestra estratta "porta dietro" il colore originale.
  const cardBg = color
    ? `color-mix(in srgb, ${color} 15%, var(--color-surface))`
    : 'var(--color-surface)'
  // Bordo vero (non box-shadow): un box-shadow con colore semi-trasparente
  // arrotonda gli angoli in modo diverso da un border reale sotto WebKit.
  const boxBorderColor = color
    ? `color-mix(in srgb, ${color} 30%, transparent)`
    : 'var(--color-divider)'
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        background: cardBg,
        color: 'var(--color-text)',
        fontFamily: 'var(--font-body)',
        padding: 'var(--space-4)',
        gap: 'var(--space-3)'
      }}
    >
      {/* Header */}
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span
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
            color: color || 'var(--color-accent)'
          }}
        >
          {title}
        </span>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => window.close()}
          title="Riaggancia alla griglia"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--font-body)',
            fontSize: 12.5,
            border: '1px solid var(--color-divider)',
            background: 'transparent',
            color: 'var(--color-text)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-2) var(--space-4)',
            cursor: 'pointer'
          }}
        >
          <ArrowSquareIn size={15} />
          Riaggancia
        </button>
      </div>

      {/* Terminale (box con stroke colorato come la card d'origine) */}
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: '#191919',
          border: `1px solid ${boxBorderColor}`,
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-3)'
        }}
      >
        <TerminalView termId={termId} attach />
      </div>
    </div>
  )
}
