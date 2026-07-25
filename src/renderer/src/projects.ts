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
  // eseguibile a percorso libero, vedi QuickCommand.shellPath
  | 'custom'

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

/** Opzioni shell adatte alla piattaforma corrente, con l'opzione "percorso custom" in coda. */
export function shellOptionsFor(platform: string): ShellOption[] {
  const native = platform === 'win32' ? WINDOWS_SHELLS : UNIX_SHELLS
  return [...native, { key: 'custom', label: 'Personalizzata (percorso)…' }]
}

/** ---- Palette colori progetto ---- */
export const TOP_COLORS = [
  '#cccccc',
  '#5bbfa5',
  '#e0a35b',
  '#e0666e',
  '#6ea8e0',
  '#9b8ee0',
  '#e0c15b',
  '#5bc4c9',
  '#7fc98a'
]

/** ---- Modello ---- */
export interface QuickCommand {
  id: string
  label: string
  icon: IconName
  /** comando eseguito quando lo si clicca */
  command: string
  /** chiudi automaticamente la card quando il comando termina */
  closeOnExit: boolean
  /** shell con cui lanciare questo terminale (indipendente dagli altri comandi) */
  shell: ShellKey
  /** percorso dell'eseguibile, usato quando shell === 'custom' */
  shellPath?: string
}

/** Prompt di testo salvato nel progetto (editor semplice, non un terminale). */
export interface Prompt {
  id: string
  label: string
  /** testo libero del prompt */
  content: string
}

export interface Project {
  id: string
  label: string
  icon: IconName
  color: string
  /** cartella di partenza; '' = home utente */
  cwd: string
  /** prompt di testo salvati (editor semplice con copia). */
  prompts: Prompt[]
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
export const newPromptId = (): string => uid('pr')

export function makeProject(partial?: Partial<Project>): Project {
  return {
    id: newProjectId(),
    label: 'Nuovo progetto',
    icon: 'Folder',
    color: TOP_COLORS[1],
    cwd: '',
    prompts: [],
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
    shell: 'default',
    ...partial
  }
}

export function makePrompt(partial?: Partial<Prompt>): Prompt {
  return {
    id: newPromptId(),
    label: 'Nuovo prompt',
    content: '',
    ...partial
  }
}

/**
 * Normalizza i progetti letti da disco/import: garantisce che `prompts` e
 * `commands` siano array (file salvati prima dell'introduzione dei prompt non
 * hanno il campo `prompts`).
 */
export function normalizeProjects(arr: unknown): Project[] {
  if (!Array.isArray(arr)) return []
  return arr.map((raw) => {
    const p = raw as Partial<Project>
    return {
      ...(p as Project),
      prompts: Array.isArray(p.prompts) ? p.prompts : [],
      commands: Array.isArray(p.commands) ? p.commands : []
    }
  })
}

/** Stato iniziale quando il file non esiste ancora. */
export function seedProjects(): ProjectsFile {
  return { version: PROJECTS_VERSION, projects: [makeProject({ label: 'Nome App', icon: 'Folder' })] }
}
