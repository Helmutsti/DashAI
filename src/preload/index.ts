import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export type ShellKey =
  | 'default'
  | 'powershell'
  | 'pwsh'
  | 'cmd'
  | 'gitbash'
  | 'zsh'
  | 'bash'
  | 'fish'
  | 'custom'

export interface CreateOpts {
  id: string
  cols: number
  rows: number
  shell?: ShellKey
  /** percorso dell'eseguibile, usato quando shell === 'custom'. */
  shellPath?: string
  cwd?: string
  startupCommand?: string
  /** esegui il comando come processo della shell e chiudi al termine */
  closeOnExit?: boolean
}

// Ponte sicuro renderer <-> main. Espone solo l'API dei terminali (pty),
// senza dare accesso diretto a ipcRenderer o a Node.
const terminal = {
  /** Crea una shell pty per l'id dato (idempotente sull'id). */
  create: (opts: CreateOpts): Promise<boolean> => ipcRenderer.invoke('term:create', opts),

  /** Invia input tastiera alla shell. */
  input: (id: string, data: string): void => {
    ipcRenderer.send('term:input', { id, data })
  },

  /** Ridimensiona la shell (colonne/righe carattere). */
  resize: (id: string, cols: number, rows: number): void => {
    ipcRenderer.send('term:resize', { id, cols, rows })
  },

  /** Termina la shell e libera le risorse. */
  dispose: (id: string): void => {
    ipcRenderer.send('term:dispose', { id })
  },

  /** Riceve l'output della shell. Ritorna una funzione di disiscrizione. */
  onData: (id: string, cb: (data: string) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, m: { id: string; data: string }): void => {
      if (m.id === id) cb(m.data)
    }
    ipcRenderer.on('term:data', listener)
    return () => ipcRenderer.removeListener('term:data', listener)
  },

  /** Notifica quando la shell termina. Ritorna una funzione di disiscrizione. */
  onExit: (id: string, cb: (exitCode: number) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, m: { id: string; exitCode: number }): void => {
      if (m.id === id) cb(m.exitCode)
    }
    ipcRenderer.on('term:exit', listener)
    return () => ipcRenderer.removeListener('term:exit', listener)
  },

  /** Ridirige l'output della pty verso QUESTA finestra (estrazione/riaggancio). */
  attach: (id: string): Promise<boolean> => ipcRenderer.invoke('term:attach', { id }),

  /** Apre la card `id` in una finestra separata. */
  detachOpen: (id: string, title: string, color: string): Promise<boolean> =>
    ipcRenderer.invoke('terminal:detach-open', { id, title, color }),
  /** Chiude la finestra separata della card `id`. */
  detachClose: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('terminal:detach-close', { id }),
  /** La finestra separata Ã¨ stata chiusa: riaggancia. Ritorna la disiscrizione. */
  onRedock: (cb: (id: string) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, m: { id: string }): void => cb(m.id)
    ipcRenderer.on('dashai:redock', listener)
    return () => ipcRenderer.removeListener('dashai:redock', listener)
  }
}

const projects = {
  /** Legge projects.json (null se non esiste ancora). */
  load: (): Promise<unknown> => ipcRenderer.invoke('projects:load'),
  /** Scrive projects.json. */
  save: (data: unknown): Promise<boolean> => ipcRenderer.invoke('projects:save', data),
  /** Percorso del file su disco. */
  path: (): Promise<string> => ipcRenderer.invoke('projects:path'),
  /** Esporta i progetti su un file scelto dall'utente. false se annullato. */
  export: (data: unknown): Promise<boolean> => ipcRenderer.invoke('projects:export', data),
  /** Importa progetti da un file scelto dall'utente. null se annullato/invalido. */
  import: (): Promise<unknown> => ipcRenderer.invoke('projects:import')
}

const settings = {
  /** Legge settings.json (null se non esiste ancora: si usano i default). */
  load: (): Promise<unknown> => ipcRenderer.invoke('settings:load'),
  /** Scrive settings.json. */
  save: (data: unknown): Promise<boolean> => ipcRenderer.invoke('settings:save', data),
  /** Percorso del file su disco. */
  path: (): Promise<string> => ipcRenderer.invoke('settings:path')
}

const api = {
  version: '0.1.0',
  /** Piattaforma del sistema ('win32' | 'darwin' | 'linux'): guida il menu shell. */
  platform: process.platform,
  terminal,
  projects,
  settings,
  /** Apre il selettore cartella nativo. Ritorna il percorso o null. */
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickDirectory'),
  /** Apre il selettore file nativo (es. eseguibile di una shell custom). Ritorna il percorso o null. */
  pickFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFile'),
  /** Apre `path` (o la home utente se vuoto) nel Finder/Esplora risorse. */
  openInFileManager: (path: string): Promise<boolean> => ipcRenderer.invoke('shell:open-path', path),
  /** Stato fullscreen della finestra al momento della chiamata. */
  isFullScreen: (): Promise<boolean> => ipcRenderer.invoke('window:is-fullscreen'),
  /** Notifica i cambi di stato fullscreen (macOS: nasconde i semafori). */
  onFullScreenChange: (cb: (isFullScreen: boolean) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, isFullScreen: boolean): void => cb(isFullScreen)
    ipcRenderer.on('dashai:fullscreen', listener)
    return () => ipcRenderer.removeListener('dashai:fullscreen', listener)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('dashai', api)
} else {
  ;(globalThis as unknown as { dashai: typeof api }).dashai = api
}

export type DashaiApi = typeof api
