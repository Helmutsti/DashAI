import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { ShellKey } from './projects'

/** Dimensione font terminali, fissa (non piu configurabile). */
const TERMINAL_FONT_SIZE = 12.5

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

/**
 * Apre un link del terminale nel browser di sistema.
 *
 * Il webview non deve navigarci dentro: è una finestra applicativa, non un
 * browser. Il filtro sullo schema sta nel comando Rust; qui si tiene traccia
 * dei fallimenti, altrimenti un clic che non apre nulla resterebbe muto.
 */
function openExternal(uri: string): void {
  window.dashai
    .openUrl(uri)
    .then((ok) => {
      if (!ok) console.error('[dashai] URL non aperto:', uri)
    })
    .catch((err) => console.error('[dashai] apertura URL fallita:', uri, err))
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

  // Snapshot delle opzioni di spawn: la shell si crea una sola volta al mount,
  // quindi congeliamo i valori correnti senza rieseguire l'effetto.
  const spawnRef = useRef({
    shell: props.shell,
    shellPath: props.shellPath,
    cwd: props.cwd,
    startupCommand: props.startupCommand,
    closeOnExit: props.closeOnExit
  })
  // Callback sempre aggiornata (senza rieseguire l'effetto di mount).
  const onProcessExitRef = useRef(props.onProcessExit)
  onProcessExitRef.current = props.onProcessExit

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
      fontSize: TERMINAL_FONT_SIZE,
      lineHeight: 1.2,
      cursorBlink: true,
      theme: THEME,
      allowProposedApi: true,
      scrollback: 5000,
      // Link dichiarati dal programma con lo standard OSC 8 ("questo testo è un
      // link a X"): non passano dal WebLinksAddon, che cerca URL nel testo, ma
      // da qui. Senza, resterebbero inerti.
      linkHandler: {
        activate: (event, uri) => {
          event.preventDefault()
          openExternal(uri)
        },
        // Gli URL non-http vengono scartati a monte, come nel comando Rust.
        allowNonHttpProtocols: false
      }
    })
    termRef.current = term
    const fit = new FitAddon()
    fitRef.current = fit
    term.loadAddon(fit)

    // Rilevamento degli URL scritti nell'output come semplice testo (quelli che
    // stampa Claude Code, per dirne una): è l'applicazione ospite a doverli
    // riconoscere, la shell emette solo caratteri.
    term.loadAddon(
      new WebLinksAddon((event, uri) => {
        event.preventDefault()
        openExternal(uri)
      })
    )
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

    const offInput = term.onData((data) => api.input(termId, data))

    // Ridimensiona la pty quando il contenitore (card/riga) cambia size.
    // Se l'host è nascosto (0px, es. card compressa) non fare nulla:
    // eviterebbe di rimpicciolire la pty a 0 senza motivo.
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
      // di vita è gestito esplicitamente da App (chiusura card), così spostare
      // una card non uccide la shell.
    }
  }, [termId])

  return (
    // Box del terminale: stroke arrotondato + padding interno cosÃ¬ il testo
    // non tocca il bordo. Lo sfondo scuro pieno stacca dal colore della card.
    // Sul tasto destro non facciamo nulla: copia e incolla restano quelli
    // nativi del webview.
    <div
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#191919',
        border: '1px solid var(--color-divider)',
        borderRadius: 'var(--radius-lg)',
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
