import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { ShellKey } from './projects'

export interface CreateOpts {
  id: string
  cols: number
  rows: number
  shell?: ShellKey
  shellPath?: string
  cwd?: string
  startupCommand?: string
  closeOnExit?: boolean
}

// registra un listener asincrono (Tauri) dietro una firma di disiscrizione
// sincrona, per restare compatibile con il contratto usato oggi dal renderer.
function subscribe<T>(event: string, onEvent: (payload: T) => void): () => void {
  let unlisten: (() => void) | null = null
  let cancelled = false
  listen<T>(event, (e) => onEvent(e.payload)).then((fn) => {
    if (cancelled) fn()
    else unlisten = fn
  })
  return () => {
    cancelled = true
    unlisten?.()
  }
}

// fire-and-forget: non fa parte del contratto attendere la risposta del comando.
function send(cmd: string, args?: Record<string, unknown>): void {
  invoke(cmd, args).catch((err) => console.error(`[dashai] ${cmd} fallito:`, err))
}

// Il webview Tauri non ha process.platform: lo ricaviamo dallo user agent
// del motore di rendering di sistema per evitare un roundtrip IPC async
// su una proprietà che il resto del renderer legge in modo sincrono.
function detectPlatform(): 'win32' | 'darwin' | 'linux' {
  const ua = navigator.userAgent
  if (ua.includes('Windows')) return 'win32'
  if (ua.includes('Macintosh') || ua.includes('Mac OS')) return 'darwin'
  return 'linux'
}

const terminal = {
  create: (opts: CreateOpts): Promise<boolean> => invoke('term_create', { opts }),
  input: (id: string, data: string): void => send('term_input', { id, data }),
  resize: (id: string, cols: number, rows: number): void => send('term_resize', { id, cols, rows }),
  dispose: (id: string): void => send('term_dispose', { id }),
  onData: (id: string, cb: (data: string) => void): (() => void) =>
    subscribe<{ id: string; data: string }>('term:data', (m) => {
      if (m.id === id) cb(m.data)
    }),
  onExit: (id: string, cb: (exitCode: number) => void): (() => void) =>
    subscribe<{ id: string; exitCode: number }>('term:exit', (m) => {
      if (m.id === id) cb(m.exitCode)
    })
}

const projects = {
  load: (): Promise<unknown> => invoke('projects_load'),
  save: (data: unknown): Promise<boolean> => invoke('projects_save', { data }),
  path: (): Promise<string> => invoke('projects_path'),
  export: (data: unknown): Promise<boolean> => invoke('projects_export', { data }),
  import: (): Promise<unknown> => invoke('projects_import')
}

const settings = {
  load: (): Promise<unknown> => invoke('settings_load'),
  save: (data: unknown): Promise<boolean> => invoke('settings_save', { data }),
  path: (): Promise<string> => invoke('settings_path')
}

export function createDashaiBridge() {
  return {
    version: '0.1.0',
    platform: detectPlatform(),
    terminal,
    projects,
    settings,
    pickDirectory: (): Promise<string | null> => invoke('dialog_pick_directory'),
    pickFile: (): Promise<string | null> => invoke('dialog_pick_file'),
    openInFileManager: (path: string): Promise<boolean> => invoke('shell_open_path', { path }),
    openUrl: (url: string): Promise<boolean> => invoke('shell_open_url', { url }),
    isFullScreen: (): Promise<boolean> => invoke('window_is_fullscreen'),
    onFullScreenChange: (cb: (isFullScreen: boolean) => void): (() => void) =>
      subscribe<boolean>('dashai:fullscreen', cb)
  }
}

export type DashaiApi = ReturnType<typeof createDashaiBridge>
