import type { IconName } from './icons'

/** ---- Shell ---- */
export type ShellKey = 'powershell' | 'pwsh' | 'cmd' | 'gitbash'

export interface ShellOption {
  key: ShellKey
  label: string
}

export const SHELL_OPTIONS: ShellOption[] = [
  { key: 'powershell', label: 'Windows PowerShell' },
  { key: 'pwsh', label: 'PowerShell 7 (pwsh)' },
  { key: 'cmd', label: 'Prompt dei comandi (cmd)' },
  { key: 'gitbash', label: 'Git Bash' }
]

/** ---- AI ---- */
export interface AiPreset {
  key: string
  label: string
  command: string
}

export const AI_PRESETS: AiPreset[] = [
  { key: 'none', label: 'Nessuno (shell pulita)', command: '' },
  { key: 'claude', label: 'Claude Code', command: 'claude' },
  { key: 'codex', label: 'Codex CLI', command: 'codex' },
  { key: 'gemini', label: 'Gemini CLI', command: 'gemini' },
  { key: 'custom', label: 'Personalizzato…', command: '' }
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
  /** preset AI d'avvio (chiave di AI_PRESETS) */
  aiPreset: string
  aiCustomCommand: string
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
    shell: 'powershell',
    cwd: '',
    aiPreset: 'none',
    aiCustomCommand: '',
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

/** Comando AI d'avvio del progetto ('' = nessuno). */
export function startupCommand(p: Pick<Project, 'aiPreset' | 'aiCustomCommand'>): string {
  if (p.aiPreset === 'custom') return p.aiCustomCommand.trim()
  const preset = AI_PRESETS.find((x) => x.key === p.aiPreset)
  return preset ? preset.command : ''
}

/** Stato iniziale quando il file non esiste ancora. */
export function seedProjects(): ProjectsFile {
  return { version: PROJECTS_VERSION, projects: [makeProject({ label: 'Nome App', icon: 'Folder' })] }
}
