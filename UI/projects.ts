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

/** ---- Palette colori progetto ----
 *
 * Un progetto porta un solo hex, usato sia come testo sull'header della card sia
 * come tinta al 14%/26% in sidebar, e lo stesso valore deve reggere su entrambe
 * le superfici del tema (#191919 e #f4f4f5): questo obbliga la lightness a stare
 * in mezzo (OKLCH L 0.54-0.66), dove ogni colore tiene >= 3:1 su tutti e due i
 * fondi. E' anche il motivo per cui non c'e' un giallo: a L media sRGB non ha
 * croma in quella regione e uscirebbe un oliva spento.
 *
 * Sono sei tinte e non otto perche' otto non possono essere mutuamente distinte:
 * misurate su TUTTE le coppie (due progetti qualsiasi possono comparire
 * affiancati in sidebar) nessun insieme di otto supera le soglie, ne' a vista
 * normale ne' in dicromatismo — la vecchia palette aveva viola e blu a ΔE 8.3,
 * sotto la soglia di 15, cioe' indistinguibili anche senza daltonismo.
 *
 * Verificata con lo script six-checks su tutte le 15 coppie, in entrambi i modi:
 * ΔE peggiore 15.3 a vista normale (soglia 15) e 8.2 in protanopia / 8.1 in
 * tritanopia (target 8, non solo il minimo 6). Se aggiungi o cambi uno slot,
 * rimisura: la separazione non e' verificabile a occhio.
 *
 * Il primo slot e' il grigio "nessun accento". A #cccccc stava a 1.46:1 sul
 * tema chiaro, praticamente invisibile; #8a8a8a tiene 5.09:1 su scuro e 3.14:1
 * su chiaro.
 */
export const TOP_COLORS = [
  '#8a8a8a', // neutro
  '#c42942', // rosso
  '#e66700', // arancio
  '#009e77', // verde
  '#1069da', // blu
  '#9b75f9', // indaco
  '#a738a2' // magenta
]

/** Colore di un progetto appena creato. */
export const DEFAULT_PROJECT_COLOR = '#009e77'

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

/**
 * Prompt di testo (editor semplice, non un terminale).
 *
 * I prompt sono globali: non appartengono a un progetto, vivono in un unico
 * elenco e si aprono dalla voce "Prompt" della barra laterale. Prima erano
 * annidati nei progetti (`Project.prompts`), campo rimosso nella versione 2.
 */
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
  /** terminali lanciabili (shell pulita, comandi, avvii AI: tutti uguali). */
  commands: QuickCommand[]
}

export interface ProjectsFile {
  version: number
  projects: Project[]
  /** elenco unico dei prompt, non più suddiviso per progetto */
  prompts: Prompt[]
}

export const PROJECTS_VERSION = 2

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
    color: DEFAULT_PROJECT_COLOR,
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
 * Normalizza i progetti letti da disco/import: garantisce che `commands` sia un
 * array e scarta i `prompts` dei file in versione 1, quando i prompt vivevano
 * dentro il progetto. Il campo va rimosso e non solo ignorato, altrimenti
 * resterebbe a sporcare il file a ogni salvataggio successivo.
 */
export function normalizeProjects(arr: unknown): Project[] {
  if (!Array.isArray(arr)) return []
  return arr.map((raw) => {
    const { prompts: _legacy, ...p } = raw as Partial<Project> & { prompts?: unknown }
    return {
      ...(p as Project),
      commands: Array.isArray(p.commands) ? p.commands : []
    }
  })
}

/** Normalizza l'elenco globale dei prompt letto da disco/import. */
export function normalizePrompts(arr: unknown): Prompt[] {
  if (!Array.isArray(arr)) return []
  return arr
    .filter((raw): raw is Partial<Prompt> => !!raw && typeof raw === 'object')
    .map((p) => ({
      id: typeof p.id === 'string' ? p.id : newPromptId(),
      label: typeof p.label === 'string' ? p.label : 'Prompt',
      content: typeof p.content === 'string' ? p.content : ''
    }))
}

/** Stato iniziale quando il file non esiste ancora. */
export function seedProjects(): ProjectsFile {
  return {
    version: PROJECTS_VERSION,
    projects: [makeProject({ label: 'Nome App', icon: 'Folder' })],
    prompts: []
  }
}
