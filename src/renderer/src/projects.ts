import type { IconName } from './icons'

/** ---- Shell ---- */
export type ShellKey =
  | 'default'
  | 'powershell'
  | 'pwsh'
  | 'cmd'
  | 'gitbash'
  | 'zsh'
  | 'bash'
  | 'fish'

export interface ShellOption {
  key: ShellKey
  label: string
}

/** Opzioni shell disponibili su Windows. */
export const WINDOWS_SHELLS: ShellOption[] = [
  { key: 'default', label: 'Predefinita (Windows PowerShell)' },
  { key: 'powershell', label: 'Windows PowerShell' },
  { key: 'pwsh', label: 'PowerShell 7 (pwsh)' },
  { key: 'cmd', label: 'Prompt dei comandi (cmd)' },
  { key: 'gitbash', label: 'Git Bash' }
]

/** Opzioni shell disponibili su macOS / Linux. */
export const UNIX_SHELLS: ShellOption[] = [
  { key: 'default', label: 'Predefinita di sistema ($SHELL)' },
  { key: 'zsh', label: 'zsh' },
  { key: 'bash', label: 'bash' },
  { key: 'fish', label: 'fish' }
]

/** Opzioni shell adatte alla piattaforma corrente. */
export function shellOptionsFor(platform: string): ShellOption[] {
  return platform === 'win32' ? WINDOWS_SHELLS : UNIX_SHELLS
}

/** ---- Template terminale ----
 *  Un template precompila un nuovo terminale: le opzioni "AI" (Claude/Codex/…)
 *  sono semplicemente terminali che avviano un comando, non un concetto a parte. */
export interface TerminalTemplate {
  key: string
  label: string
  /** comando d'avvio precompilato ('' = shell pulita) */
  command: string
  icon: IconName
}

export const TERMINAL_TEMPLATES: TerminalTemplate[] = [
  { key: 'shell', label: 'Shell pulita', command: '', icon: 'Terminal' },
  { key: 'claude', label: 'Claude Code', command: 'claude', icon: 'Robot' },
  { key: 'codex', label: 'Codex CLI', command: 'codex', icon: 'Robot' },
  { key: 'gemini', label: 'Gemini CLI', command: 'gemini', icon: 'Robot' },
  { key: 'custom', label: 'Personalizzato…', command: '', icon: 'Terminal' }
]

/** ---- Palette colori progetto ---- */
export const TOP_COLORS = ['#cccccc', '#5bbfa5', '#e0a35b', '#e0666e', '#6ea8e0']

/** ---- Modello ---- */
export interface QuickCommand {
  id: string
  label: string
  icon: IconName
  /** comando eseguito quando lo si clicca */
  command: string
  /** chiudi automaticamente la card quando il comando termina */
  closeOnExit: boolean
}

export interface Project {
  id: string
  label: string
  icon: IconName
  color: string
  shell: ShellKey
  /** cartella di partenza; '' = home utente */
  cwd: string
  /** terminali lanciabili (shell pulita, comandi, avvii AI: tutti uguali). */
  commands: QuickCommand[]
}

export interface ProjectsFile {
  version: number
  projects: Project[]
}

export const PROJECTS_VERSION = 1

/** ---- Id univoci (persistiti in projects.json) ---- */
let seq = 0
function uid(prefix: string): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}_${seq}`
}
export const newProjectId = (): string => uid('p')
export const newCommandId = (): string => uid('c')

export function makeProject(partial?: Partial<Project>): Project {
  return {
    id: newProjectId(),
    label: 'Nuovo progetto',
    icon: 'Folder',
    color: TOP_COLORS[1],
    shell: 'default',
    cwd: '',
    commands: [],
    ...partial
  }
}

export function makeCommand(partial?: Partial<QuickCommand>): QuickCommand {
  return {
    id: newCommandId(),
    label: 'Nuovo comando',
    icon: 'Terminal',
    command: '',
    closeOnExit: false,
    ...partial
  }
}

/** Crea un nuovo terminale a partire da un template (vedi TERMINAL_TEMPLATES). */
export function makeCommandFromTemplate(key: string): QuickCommand {
  const t = TERMINAL_TEMPLATES.find((x) => x.key === key)
  if (!t || t.key === 'shell') return makeCommand({ label: 'Terminale', command: '', icon: 'Terminal' })
  if (t.key === 'custom') return makeCommand({ label: 'Nuovo comando', command: '', icon: 'Terminal' })
  return makeCommand({ label: t.label, command: t.command, icon: t.icon })
}

/** Stato iniziale quando il file non esiste ancora. */
export function seedProjects(): ProjectsFile {
  return { version: PROJECTS_VERSION, projects: [makeProject({ label: 'Nome App', icon: 'Folder' })] }
}
