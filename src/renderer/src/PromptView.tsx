import { useEffect, useRef, useState } from 'react'
import { Check, Copy, FloppyDisk } from '@phosphor-icons/react'
import type { CSSProperties } from 'react'

export interface PromptViewProps {
  /** testo corrente: vive nello stato di App (col.content), non qui, così lo
   *  spostamento della card tra le righe non lo perde. */
  content: string
  /** aggiorna il testo nello stato di App a ogni battuta. */
  onChange: (content: string) => void
  /** true se la card è già legata a un prompt salvato nel progetto. */
  saved?: boolean
  /** salva il testo corrente nel progetto (crea o aggiorna il prompt). */
  onSave: (content: string) => void
}

/**
 * Editor di testo semplice reso in una card come alternativa al terminale.
 * Nessuna formattazione: solo testo libero, con un tasto per copiare tutto e
 * uno per salvare il prompt nel progetto.
 *
 * Componente controllato: non tiene il testo in stato locale, perché spostare
 * la card in un'altra riga la rimonta (cambia il nodo padre nell'albero React)
 * e lo stato locale andrebbe perso insieme al testo non salvato.
 */
export default function PromptView(props: PromptViewProps): React.ReactElement {
  const { content: text, onChange, onSave } = props
  const [copied, setCopied] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  const flash = (which: 'copied' | 'saved'): void => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (which === 'copied') setCopied(true)
    else setJustSaved(true)
    timerRef.current = setTimeout(() => {
      setCopied(false)
      setJustSaved(false)
    }, 1400)
  }

  const doCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      flash('copied')
    } catch {
      /* clipboard non disponibile: ignora silenziosamente */
    }
  }

  const doSave = (): void => {
    onSave(text)
    flash('saved')
  }

  return (
    <div
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)'
      }}
    >
      {/* Toolbar: copia tutto + salva nel progetto */}
      <div style={{ flex: '0 0 auto', display: 'flex', gap: 'var(--space-2)' }}>
        <button type="button" className="btn btn--ghost" onClick={doCopy} style={toolbarBtn}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copiato' : 'Copia'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={doSave} style={toolbarBtn}>
          {justSaved ? <Check size={13} /> : <FloppyDisk size={13} />}
          {justSaved ? 'Salvato' : 'Salva'}
        </button>
      </div>

      {/* Look "foglio": fondo chiaro (surface) e font di testo sans-serif, così
          si distingue nettamente dal terminale (fondo scuro, monospace). */}
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder="Scrivi qui il tuo prompt…"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          width: '100%',
          resize: 'none',
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-divider)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-3)',
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          lineHeight: 1.5,
          outline: 'none'
        }}
      />
    </div>
  )
}

const toolbarBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontFamily: 'var(--font-body)',
  fontSize: 11,
  fontWeight: 500,
  border: '1px solid var(--color-divider)',
  background: 'transparent',
  color: 'var(--color-text)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer'
}
