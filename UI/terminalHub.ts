import type { CreateOpts } from './dashai-bridge'

/**
 * Registro delle chat vive, indipendente dalle viste.
 *
 * Una chat resta viva anche quando la sua finestra non è sullo schermo: la pty
 * gira nel backend, ma senza un ascoltatore il suo output andrebbe perso e la
 * vista, rimontata, ripartirebbe vuota. Qui ogni sessione ha un unico
 * ascoltatore permanente che conserva l'output (riscritto nella vista quando
 * torna visibile) e riconosce i segnali "ti aspetto" degli agenti.
 */

/** Tetto dell'output conservato per sessione (caratteri). */
const MAX_BUFFER = 4_000_000

interface Session {
  chunks: string[]
  size: number
  /** stato del riconoscimento delle sequenze OSC a cavallo dei chunk */
  esc: boolean
  osc: string | null
  views: Set<(data: string) => void>
  exited: boolean
  off: () => void
}

const sessions = new Map<string, Session>()
const attentionListeners = new Set<(id: string) => void>()
const inputListeners = new Set<(id: string) => void>()
const exitListeners = new Set<(id: string) => void>()

/**
 * Cerca i segnali con cui gli agenti chiedono attenzione:
 * - BEL isolato (Claude Code con `preferredNotifChannel: terminal_bell`);
 * - notifiche OSC 9 (stile iTerm2, usate da Claude Code e da Codex) e
 *   OSC 777;notify.
 * Il BEL che chiude una sequenza OSC (es. il titolo della finestra) non conta.
 */
function scan(s: Session, data: string): boolean {
  let hit = false
  for (let i = 0; i < data.length; i++) {
    const ch = data[i]
    if (s.osc !== null) {
      if (ch === '\x07' || (s.esc && ch === '\\')) {
        const body = s.osc
        if (/^9;/.test(body) || /^777;notify/.test(body)) hit = true
        s.osc = null
        s.esc = false
      } else if (ch === '\x1b') {
        s.esc = true
      } else {
        s.esc = false
        if (s.osc.length < 64) s.osc += ch
      }
      continue
    }
    if (s.esc) {
      s.esc = false
      if (ch === ']') {
        s.osc = ''
        continue
      }
    }
    if (ch === '\x1b') s.esc = true
    else if (ch === '\x07') hit = true
  }
  return hit
}

function append(s: Session, data: string): void {
  s.chunks.push(data)
  s.size += data.length
  // Scarta i blocchi più vecchi oltre il tetto (resta l'output recente).
  while (s.size > MAX_BUFFER && s.chunks.length > 1) {
    s.size -= s.chunks.shift()!.length
  }
}

/** Avvia la sessione (se non esiste già) e inizia a conservarne l'output. */
export function startSession(opts: CreateOpts): void {
  if (sessions.has(opts.id)) return
  const api = window.dashai.terminal
  const s: Session = { chunks: [], size: 0, esc: false, osc: null, views: new Set(), exited: false, off: () => {} }
  const offData = api.onData(opts.id, (data) => {
    append(s, data)
    s.views.forEach((fn) => fn(data))
    if (scan(s, data)) attentionListeners.forEach((fn) => fn(opts.id))
  })
  const offExit = api.onExit(opts.id, () => {
    s.exited = true
    exitListeners.forEach((fn) => fn(opts.id))
  })
  s.off = () => {
    offData()
    offExit()
  }
  sessions.set(opts.id, s)
  void api.create(opts)
}

/** Termina la sessione e dimentica il suo output. */
export function endSession(id: string): void {
  const s = sessions.get(id)
  if (s) {
    s.off()
    sessions.delete(id)
  }
  window.dashai.terminal.dispose(id)
}

export function hasSession(id: string): boolean {
  return sessions.has(id)
}

export function hasExited(id: string): boolean {
  return sessions.get(id)?.exited ?? false
}

/** Output conservato finora, da riscrivere in una vista appena montata. */
export function readBuffer(id: string): string {
  return sessions.get(id)?.chunks.join('') ?? ''
}

/** Collega una vista all'output in arrivo. Restituisce la funzione per staccarla. */
export function attachView(id: string, fn: (data: string) => void): () => void {
  const s = sessions.get(id)
  if (!s) return () => {}
  s.views.add(fn)
  return () => s.views.delete(fn)
}

/** Testo digitato dall'utente: va alla shell e spegne l'eventuale "ti aspetta". */
export function sendInput(id: string, data: string): void {
  window.dashai.terminal.input(id, data)
  inputListeners.forEach((fn) => fn(id))
}

export function onAttention(fn: (id: string) => void): () => void {
  attentionListeners.add(fn)
  return () => attentionListeners.delete(fn)
}

export function onUserInput(fn: (id: string) => void): () => void {
  inputListeners.add(fn)
  return () => inputListeners.delete(fn)
}

export function onSessionExit(fn: (id: string) => void): () => void {
  exitListeners.add(fn)
  return () => exitListeners.delete(fn)
}
