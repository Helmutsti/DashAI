import type { ShellKey } from './projects'

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
  /** (kind='prompt') testo iniziale con cui montare l'editor */
  content?: string
  /** card compressa (solo intestazione visibile) */
  collapsed?: boolean
  /** card estratta in una finestra separata */
  detached?: boolean
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
  return `term-${colSeq}`
}

export const NAV_ITEMS = ['Dashboard', 'Progetti', 'Archivio']
