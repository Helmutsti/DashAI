import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { ShellKey } from './projects'
import { useSettings } from './SettingsContext'

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
  /** percorso dell'eseguibile, usato quando shell === 'custom' */
  shellPath?: string
  cwd?: string
  startupCommand?: string
  /** se true, la shell gira in modalitÃ  "esegui-ed-esci" e alla fine la card
   *  viene chiusa (via onProcessExit). */
  closeOnExit?: boolean
  onProcessExit?: () => void
  /** modalitÃ  aggancio: NON crea nÃ© distrugge la pty, si limita a ridirigere
   *  l'output verso questa vista (usata dalla finestra estratta). */
  attach?: boolean
}

/**
 * Superficie terminale: crea un xterm.js, lo collega alla pty nel main via
 * `window.dashai.terminal` e lo mantiene ridimensionato con FitAddon.
 * Montato una sola volta per `termId`: finchÃ© la card vive (anche se riordinata),
 * la shell non viene ricreata.
 */
export default function TerminalView(props: TerminalViewProps): React.ReactElement {
  const { termId } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  // Font terminale dalle impostazioni: snapshot per la creazione (senza rieseguire
  // l'effetto di mount) + aggiornamento dal vivo tramite l'effetto piu sotto.
  const { settings } = useSettings()
  const fontSizeRef = useRef(settings.terminalFontSize)
  fontSizeRef.current = settings.terminalFontSize

  // Snapshot delle opzioni di spawn: la shell si crea una sola volta al mount,
  // quindi congeliamo i valori correnti senza rieseguire l'effetto.
  const spawnRef = useRef({
    shell: props.shell,
    shellPath: props.shellPath,
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
      fontSize: fontSizeRef.current,
      lineHeight: 1.2,
      cursorBlink: true,
      theme: THEME,
      allowProposedApi: true,
      scrollback: 5000
    })
    termRef.current = term
    const fit = new FitAddon()
    fitRef.current = fit
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
    const api = window.dashai.terminal
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
        shellPath: s.shellPath,
        cwd: s.cwd,
        startupCommand: s.startupCommand,
        closeOnExit: s.closeOnExit
      })
    }

    const offInput = term.onData((data) => api.input(termId, data))

    // Ridimensiona la pty quando il contenitore (card/row/window) cambia size.
    // Se l'host Ã¨ nascosto (0px, es. card compressa/estratta) non fare nulla:
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
      termRef.current = null
      fitRef.current = null
      // NB: la pty NON viene distrutta allo smontaggio della vista. Il suo ciclo
      // di vita Ã¨ gestito esplicitamente da App (chiusura card) / finestra
      // estratta, cosÃ¬ estrarre o spostare una card non uccide la shell.
    }
  }, [termId])

  // Aggiorna il font dei terminali gia aperti quando cambia l'impostazione.
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontSize = settings.terminalFontSize
    try {
      fitRef.current?.fit()
    } catch {
      /* host non ancora dimensionato */
    }
    window.dashai.terminal.resize(termId, term.cols, term.rows)
  }, [settings.terminalFontSize, termId])

  return (
    // Box del terminale: stroke arrotondato + padding interno cosÃ¬ il testo
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
