import fs from 'node:fs'
import os from 'node:os'
import { ipcMain, type WebContents } from 'electron'
import * as pty from 'node-pty'

interface Session {
  proc: pty.IPty
  wc: WebContents
}

export type ShellKey =
  // universale: shell predefinita del sistema (PowerShell su Windows, $SHELL altrove)
  | 'default'
  // Windows
  | 'powershell'
  | 'pwsh'
  | 'cmd'
  | 'gitbash'
  // Unix / macOS / Linux
  | 'zsh'
  | 'bash'
  | 'fish'

export interface CreateOpts {
  id: string
  cols: number
  rows: number
  shell?: ShellKey
  cwd?: string
  /** comando lanciato subito dopo l'avvio della shell (es. 'claude'). */
  startupCommand?: string
  /** esegui startupCommand come processo della shell e termina al suo termine. */
  closeOnExit?: boolean
}

const sessions = new Map<string, Session>()

/** Percorsi tipici di Git Bash su Windows (best-effort). */
const GIT_BASH_CANDIDATES = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
]

/** Shell Unix predefinita: $SHELL, poi zsh (default macOS), infine bash. */
function defaultUnixShell(): string {
  if (process.env.SHELL) return process.env.SHELL
  if (fs.existsSync('/bin/zsh')) return '/bin/zsh'
  return '/bin/bash'
}

/** Risolve eseguibile/argomenti per una shell Unix (macOS / Linux) interattiva. */
function resolveUnixShell(shell?: ShellKey): { file: string; args: string[] } {
  // -i -l: shell interattiva di login, così vengono caricati i profili
  // (~/.zprofile, ~/.bash_profile, PATH di Homebrew, ecc.).
  switch (shell) {
    case 'zsh':
      return { file: 'zsh', args: ['-i', '-l'] }
    case 'bash':
      return { file: 'bash', args: ['-i', '-l'] }
    case 'fish':
      return { file: 'fish', args: ['-i', '-l'] }
    // 'default' e qualsiasi chiave Windows persistita su un progetto aperto su Mac
    default:
      return { file: defaultUnixShell(), args: [] }
  }
}

/** Come resolveUnixShell, ma esegue un comando e termina. */
function resolveUnixShellRun(shell: ShellKey | undefined, cmd: string): { file: string; args: string[] } {
  switch (shell) {
    case 'zsh':
      return { file: 'zsh', args: ['-l', '-c', cmd] }
    case 'bash':
      return { file: 'bash', args: ['-l', '-c', cmd] }
    case 'fish':
      return { file: 'fish', args: ['-l', '-c', cmd] }
    default:
      return { file: defaultUnixShell(), args: ['-l', '-c', cmd] }
  }
}

/** Risolve la coppia eseguibile/argomenti per la shell scelta. */
function resolveShell(shell?: ShellKey): { file: string; args: string[] } {
  if (process.platform !== 'win32') {
    return resolveUnixShell(shell)
  }
  switch (shell) {
    case 'pwsh':
      return { file: 'pwsh.exe', args: [] }
    case 'cmd':
      return { file: 'cmd.exe', args: [] }
    case 'gitbash': {
      const found = GIT_BASH_CANDIDATES.find((p) => fs.existsSync(p))
      return { file: found || 'bash.exe', args: ['-i', '-l'] }
    }
    // 'default', 'powershell' e chiavi Unix persistite → PowerShell su Windows
    case 'powershell':
    default:
      return { file: 'powershell.exe', args: [] }
  }
}

/** Come resolveShell, ma per eseguire un comando e uscire al suo termine. */
function resolveShellRun(shell: ShellKey | undefined, cmd: string): { file: string; args: string[] } {
  if (process.platform !== 'win32') {
    return resolveUnixShellRun(shell, cmd)
  }
  switch (shell) {
    case 'pwsh':
      return { file: 'pwsh.exe', args: ['-NoLogo', '-NoProfile', '-Command', cmd] }
    case 'cmd':
      return { file: 'cmd.exe', args: ['/C', cmd] }
    case 'gitbash': {
      const found = GIT_BASH_CANDIDATES.find((p) => fs.existsSync(p))
      return { file: found || 'bash.exe', args: ['-lc', cmd] }
    }
    case 'powershell':
    default:
      return { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-Command', cmd] }
  }
}

/** Directory di partenza valida (fallback a home se mancante/inesistente). */
function resolveCwd(cwd?: string): string {
  if (cwd && cwd.trim()) {
    try {
      if (fs.statSync(cwd).isDirectory()) return cwd
    } catch {
      /* percorso non valido: fallback */
    }
  }
  return os.homedir()
}

function createSession(wc: WebContents, opts: CreateOpts): void {
  const { id } = opts
  // Se esiste già una sessione con questo id (es. hot-reload), non duplicare.
  if (sessions.has(id)) return

  const cmd = opts.startupCommand?.trim() ?? ''
  const runExit = !!opts.closeOnExit && cmd !== ''
  const { file, args } = runExit ? resolveShellRun(opts.shell, cmd) : resolveShell(opts.shell)
  const cwd = resolveCwd(opts.cwd)

  let proc: pty.IPty
  try {
    proc = pty.spawn(file, args, {
      name: 'xterm-color',
      cols: opts.cols > 0 ? opts.cols : 80,
      rows: opts.rows > 0 ? opts.rows : 24,
      cwd,
      env: process.env as Record<string, string>
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!wc.isDestroyed()) {
      wc.send('term:data', {
        id,
        data: `\r\n\x1b[38;5;203mImpossibile avviare "${file}": ${msg}\x1b[0m\r\n`
      })
    }
    return
  }

  // La destinazione dell'output (wc) è mutabile: cambia quando la card viene
  // estratta in un'altra finestra (vedi 'term:attach').
  const session: Session = { proc, wc }
  proc.onData((data) => {
    if (!session.wc.isDestroyed()) session.wc.send('term:data', { id, data })
  })
  proc.onExit(({ exitCode }) => {
    if (!session.wc.isDestroyed()) session.wc.send('term:exit', { id, exitCode })
    sessions.delete(id)
  })

  sessions.set(id, session)

  // In modalità interattiva il comando d'avvio viene "digitato" al prompt dopo
  // un breve ritardo. In modalità esegui-ed-esci è già passato come argomento.
  if (!runExit && cmd) {
    setTimeout(() => {
      if (sessions.has(id)) proc.write(`${cmd}\r`)
    }, 600)
  }
}

function disposeSession(id: string): void {
  const s = sessions.get(id)
  if (!s) return
  try {
    s.proc.kill()
  } catch {
    /* già terminato */
  }
  sessions.delete(id)
}

/** Registra gli handler IPC. Da chiamare una sola volta all'avvio. */
export function registerPtyIpc(): void {
  ipcMain.handle('term:create', (e, opts: CreateOpts) => {
    createSession(e.sender, opts)
    return true
  })

  // Ridirige l'output della pty verso la finestra chiamante (estrazione/riaggancio).
  ipcMain.handle('term:attach', (e, { id }: { id: string }) => {
    const s = sessions.get(id)
    if (s) s.wc = e.sender
    return !!s
  })

  ipcMain.on('term:input', (_e, { id, data }: { id: string; data: string }) => {
    sessions.get(id)?.proc.write(data)
  })

  ipcMain.on('term:resize', (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    const s = sessions.get(id)
    if (!s || cols <= 0 || rows <= 0) return
    try {
      s.proc.resize(cols, rows)
    } catch {
      /* dimensioni non valide o processo terminato */
    }
  })

  ipcMain.on('term:dispose', (_e, { id }: { id: string }) => disposeSession(id))
}

/** Termina tutte le shell attive (chiamata alla chiusura dell'app). */
export function disposeAllPty(): void {
  for (const id of Array.from(sessions.keys())) disposeSession(id)
}
