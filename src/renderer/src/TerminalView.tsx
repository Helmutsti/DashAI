import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { ShellKey } from './projects'

/** Tema del terminale (stato originale, prima dell'esperimento "trasparenza"). */
const THEME = {
  background: '#191919',
  foreground: '#ededed',
  cursor: '#ededed',
  cursorAccent: '#191919',
  selectionBackground: 'rgba(237,237,237,0.24)',
  black: '#191919',
  brightBlack: '#5a5a5a',
  white: '#cfcfcf',
  brightWhite: '#ededed'
}

export interface TerminalViewProps {
  /** id stabile della sessione pty (= Column.id). */
  termId: string
  /** opzioni di spawn, usate solo alla creazione (snapshot al mount). */
  shell?: ShellKey
  cwd?: string
  startupCommand?: string
  /** se true, la shell gira in modalità "esegui-ed-esci" e alla fine la card
   *  viene chiusa (via onProcessExit). */
  closeOnExit?: boolean
  onProcessExit?: () => void
  /** modalità aggancio: NON crea né distrugge la pty, si limita a ridirigere
   *  l'output verso questa vista (usata dalla finestra estratta). */
  attach?: boolean
}

/**
 * Superficie terminale: crea un xterm.js, lo collega alla pty nel main via
 * `window.dashiai.terminal` e lo mantiene ridimensionato con FitAddon.
 * Montato una sola volta per `termId`: finché la card vive (anche se riordinata),
 * la shell non viene ricreata.
 */
export default function TerminalView(props: TerminalViewProps): React.ReactElement {
  const { termId } = props
  const hostRef = useRef<HTMLDivElement>(null)

  // Snapshot delle opzioni di spawn: la shell si crea una sola volta al mount,
  // quindi congeliamo i valori correnti senza rieseguire l'effetto.
  const spawnRef = useRef({
    shell: props.shell,
    cwd: props.cwd,
    startupCommand: props.startupCommand,
    closeOnExit: props.closeOnExit,
    attach: props.attach
  })
  // Callback sempre aggiornata (senza rieseguire l'effetto di mount).
  const onProcessExitRef = useRef(props.onProcessExit)
  onProcessExitRef.current = props.onProcessExit

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
      fontSize: 12.5,
      lineHeight: 1.2,
      cursorBlink: true,
      theme: THEME,
      allowProposedApi: true,
      scrollback: 5000
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)

    const safeFit = (): void => {
      try {
        fit.fit()
      } catch {
        /* host non ancora dimensionato */
      }
    }
    safeFit()

    const s = spawnRef.current
    const api = window.dashiai.terminal
    const offData = api.onData(termId, (data) => term.write(data))
    const offExit = api.onExit(termId, () => {
      if (s.closeOnExit) {
        // Comando finito: chiudi la card.
        onProcessExitRef.current?.()
      } else {
        term.write('\r\n\x1b[38;5;244m[processo terminato]\x1b[0m\r\n')
      }
    })

    if (s.attach) {
      // Finestra estratta: si aggancia alla pty esistente (nessuna create).
      void api.attach(termId).then(() => api.resize(termId, term.cols, term.rows))
    } else {
      // Crea la shell con le dimensioni iniziali calcolate dal fit.
      void api.create({
        id: termId,
        cols: term.cols,
        rows: term.rows,
        shell: s.shell,
        cwd: s.cwd,
        startupCommand: s.startupCommand,
        closeOnExit: s.closeOnExit
      })
    }

    const offInput = term.onData((data) => api.input(termId, data))

    // Ridimensiona la pty quando il contenitore (card/row/window) cambia size.
    // Se l'host è nascosto (0px, es. card compressa/estratta) non fare nulla:
    // eviterebbe di rimpicciolire la pty a 0 disturbando la finestra estratta.
    const ro = new ResizeObserver(() => {
      if (host.clientWidth === 0 || host.clientHeight === 0) return
      safeFit()
      api.resize(termId, term.cols, term.rows)
    })
    ro.observe(host)

    term.focus()

    return () => {
      ro.disconnect()
      offData()
      offExit()
      offInput.dispose()
      term.dispose()
      // NB: la pty NON viene distrutta allo smontaggio della vista. Il suo ciclo
      // di vita è gestito esplicitamente da App (chiusura card) / finestra
      // estratta, così estrarre o spostare una card non uccide la shell.
    }
  }, [termId])

  return (
    // Box del terminale: stroke arrotondato + padding interno così il testo
    // non tocca il bordo. Lo sfondo scuro pieno stacca dal colore della card.
    <div
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#191919',
        border: '1px solid var(--color-divider)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        overflow: 'hidden'
      }}
    >
      <div
        ref={hostRef}
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          width: '100%',
          overflow: 'hidden'
        }}
      />
    </div>
  )
}
