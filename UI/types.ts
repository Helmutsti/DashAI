import type { ShellKey } from './projects'
import type { IconName } from './icons'

/** Dove portare una chat rispetto a quella attiva: al suo posto, a destra o sotto. */
export type Placement = 'replace' | 'right' | 'below'

export interface Column {
  /** id stabile per l'intera vita della scheda: lega la sessione terminale a
   *  questa card, così riordino/drag non ricreano la shell. */
  id: string
  /** progetto di appartenenza (per ricolorare le card del progetto) */
  projectId?: string
  /** peso di larghezza (grow factor flexbox) */
  w: number
  /** tipo di card: terminale (default) o editor di prompt testuale. */
  kind?: 'terminal' | 'prompt'
  title: string
  /** icona del comando che ha aperto la chat (se non è un agente riconosciuto) */
  icon?: IconName
  color: string
  /** configurazione di spawn della shell (per-card, snapshot alla creazione) */
  shell?: ShellKey
  /** percorso dell'eseguibile, usato quando shell === 'custom' */
  shellPath?: string
  cwd?: string
  startupCommand?: string
  /** chiudi la card quando il processo termina (comandi "chiudi al termine") */
  closeOnExit?: boolean
  /** (kind='prompt') id del prompt salvato nel progetto a cui è legata la card */
  promptId?: string
  /** (kind='prompt') testo corrente dell'editor. Vive qui (non nello stato
   *  locale della vista) così sopravvive ai remount dovuti allo spostamento
   *  della card tra le righe, anche se non ancora salvato nel progetto. */
  content?: string
  /** card compressa (solo intestazione visibile) */
  collapsed?: boolean
  /** (chat di un agente) id della sessione ufficiale di Claude Code / Codex */
  sessionId?: string
  /** quando è partita la chat (ms): serve a riconoscere la sua sessione */
  startedAt?: number
  /** titolo scelto a mano: non va sostituito dal nome della sessione */
  titleLocked?: boolean
}

export interface Row {
  /** peso di altezza (grow factor flexbox) */
  h: number
  cols: Column[]
}

/** Genera un id colonna univoco nella sessione. */
let colSeq = 0
export function newColId(): string {
  colSeq += 1
  // Unico anche fra un avvio e l'altro: le chat attive sopravvivono al riavvio.
  return `term-${Date.now().toString(36)}-${colSeq}`
}

export const NAV_ITEMS = ['Dashboard', 'Progetti', 'Archivio']
