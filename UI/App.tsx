import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowsDownUp,
  Terminal,
  CaretDoubleLeft,
  Check,
  DotsSixVertical,
  Folder,
  Gear,
  Plus
} from '@phosphor-icons/react'
import Card from './Card'
import ChatList, { ChatRail } from './ChatList'
import ProjectMenu from './ProjectMenu'
import PromptMenu from './PromptMenu'
import { AGENT_LABEL, detectAgent, type AgentKey } from './agents'
import type { AgentSession } from './dashai-bridge'
import { endSession, onAttention, onSessionExit, onUserInput } from './terminalHub'
import BrandMark from './BrandMark'
import ProjectEditorModal from './ProjectEditorModal'
import SettingsModal from './SettingsModal'
import { useSettings } from './SettingsContext'
import { newColId, type Column, type Row } from './types'
import WindowControls, { WIN_TITLEBAR_PX } from './WindowControls'
import { hitAt, startPointerDrag } from './pointerDrag'
import {
  PROJECTS_VERSION,
  TOP_COLORS,
  makePrompt,
  makeProject,
  normalizeProjects,
  normalizePrompts,
  seedProjects,
  type Project,
  type Prompt,
  type ProjectsFile,
  type QuickCommand
} from './projects'

const HANDLE = 6
const MIN_FR = 0.3

type DropTarget = { r: number; c: number; side: 'before' | 'after' } | null
type CardHit = { kind: 'card'; r: number; c: number; side: 'before' | 'after' } | { kind: 'zone'; idx: number } | null
type DragCard = { r: number; c: number } | null

type ResizeDrag =
  | { type: 'row'; index: number; rect: DOMRect; start: number; startSizes: number[] }
  | { type: 'col'; rowIndex: number; index: number; rect: DOMRect; start: number; startSizes: number[] }
  | null

export default function App(): React.ReactElement {
  const [rows, setRows] = useState<Row[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [dragCard, setDragCard] = useState<DragCard>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [dropZone, setDropZone] = useState<number | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  // Ultimo elenco disegnato: lo leggono i gestori che vivono più di un render
  // (fine del riordino, cartelle trascinate da fuori).
  const latestProjects = useRef(projects)
  latestProjects.current = projects
  // Elenco unico dei prompt: non appartengono più a un progetto.
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [editingIsNew, setEditingIsNew] = useState(false)
  // Chat attive: tutte le sessioni terminale vive, visibili o no. La griglia
  // (`rows`) mostra solo quelle scelte; le altre restano vive nel registro
  // delle sessioni (terminalHub) e tornano visibili con un clic.
  const [chats, setChats] = useState<Column[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dashai.chats') || '[]') as Column[]
      // Si riprende la sessione dell'agente invece di rilanciare il comando.
      return saved.map((c) => ({ ...c, startupCommand: resumeCommand(c) }))
    } catch {
      return []
    }
  })
  // Chat che aspettano il tuo intervento (riga arancione con «!»).
  const [waiting, setWaiting] = useState<Set<string>>(new Set())
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('dashai.sidebarWidth')) || 280
    } catch {
      return 280
    }
  })
  const [chatsHeight, setChatsHeight] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('dashai.chatsHeight')) || 240
    } catch {
      return 240
    }
  })
  // Progetto con il menu aperto (clic sulla riga del progetto).
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Modalità "riordina progetti" (stile iPhone): le card progetto restano
  // chiuse e non interagibili, spostabili solo trascinandole. `reorderDragId`
  // è il progetto attualmente afferrato; `null` quando non si sta trascinando.
  const [reorderMode, setReorderMode] = useState(false)
  const [reorderDragId, setReorderDragId] = useState<string | null>(null)
  const projectTreeRef = useRef<HTMLDivElement>(null)
  /** cartelle trascinate da Esplora file sopra l'elenco dei progetti */
  const [folderOver, setFolderOver] = useState(false)
  // Posizioni pre-riordino, per l'animazione FLIP che simula lo "spostarsi per
  // fare spazio" delle icone iOS quando un progetto scavalca gli altri.
  const prevProjectRectsRef = useRef<Map<string, DOMRect>>(new Map())
  // Card "attiva": bersaglio delle shortcut da tastiera. `focusTick` viene
  // incrementato solo quando *noi* vogliamo spostare il fuoco del DOM (shortcut,
  // apertura, chiusura): un clic si porta già il fuoco da solo e non deve
  // rifocalizzare nulla.
  const [activeId, setActiveId] = useState<string | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  // Evidenziazione momentanea: il bordo serve a dire "sei finito qui" quando ci
  // si sposta da tastiera, non a marcare uno stato permanente. Compare solo sul
  // salto e sfuma da sé (con un clic sai già dove sei andato).
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { t, settings } = useSettings()

  // Orientamento della griglia. Il modello dati non cambia mai: una `Row` è una
  // *traccia* (`h` = peso lungo l'asse del canvas) e le sue `cols` sono le card
  // (`w` = peso lungo l'asse interno alla traccia). Questo flag decide solo
  // quale asse dello schermo corrisponde a quale dei due:
  //   true  → tracce impilate in verticale, card affiancate (righe di colonne)
  //   false → tracce affiancate in orizzontale, card impilate (colonne di righe)
  const byRows = settings.gridOrientation === 'rows'

  // Su macOS con titleBarStyle 'hiddenInset' i semafori (chiudi/min/max) stanno
  // in alto a sinistra, sovrapposti al web content: riserviamo un'intera striscia
  // in alto (stesso sfondo della finestra, non della sidebar) cosÃ¬ i pallini non
  // "sbattono" contro il pannello arrotondato. Su Windows/Linux resta 0.
  // In fullscreen nativo i semafori spariscono: niente da riservare.
  const [isFullScreen, setIsFullScreen] = useState(false)
  useEffect(() => {
    void window.dashai.isFullScreen().then(setIsFullScreen)
    return window.dashai.onFullScreenChange(setIsFullScreen)
  }, [])
  const isMac = window.dashai.platform === 'darwin'
  const isWin = window.dashai.platform === 'win32'
  // Striscia in alto su tutta la finestra, dello stesso colore dello sfondo e
  // trascinabile: su macOS ospita i semafori a sinistra, su Windows (dove la
  // barra di sistema è nascosta) riduci/ingrandisci/chiudi a destra.
  const macTrafficLightInset = isMac && !isFullScreen ? 28 : 0
  const titleInset = isFullScreen ? 0 : isMac ? 28 : isWin ? WIN_TITLEBAR_PX : 0


  const outerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<ResizeDrag>(null)

  // --- Riordino progetti (FLIP: "First, Last, Invert, Play") --------------
  // Ad ogni cambio d'ordine si confronta la posizione precedente di ciascuna
  // card con quella nuova appena assegnata dal layout, e la si fa "arrivare"
  // dalla vecchia posizione animando solo un transform: l'effetto è lo stesso
  // "farsi spazio" delle icone della home di iOS, senza librerie esterne.
  useLayoutEffect(() => {
    if (!reorderMode) {
      prevProjectRectsRef.current.clear()
      return
    }
    const container = projectTreeRef.current
    if (!container) return
    const nodes = container.querySelectorAll<HTMLElement>('[data-project-id]')
    nodes.forEach((node) => {
      const id = node.dataset.projectId
      if (!id) return
      const newRect = node.getBoundingClientRect()
      const oldRect = prevProjectRectsRef.current.get(id)
      if (oldRect) {
        const dx = oldRect.left - newRect.left
        const dy = oldRect.top - newRect.top
        if (dx || dy) {
          node.style.transition = 'none'
          node.style.transform = `translate(${dx}px, ${dy}px)`
          requestAnimationFrame(() => {
            node.style.transition = 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)'
            node.style.transform = ''
          })
        }
      }
      prevProjectRectsRef.current.set(id, newRect)
    })
  }, [projects, reorderMode])

  // Il trascinamento è fatto a mano con gli eventi del puntatore e non con
  // il drag&drop HTML5: la finestra accetta le cartelle trascinate da Esplora
  // file, e su Windows questo impedisce il drag&drop HTML5 dentro la pagina.
  // Si sposta dal vivo il progetto afferrato sopra quello sorvolato: gli altri
  // si spostano di conseguenza, ed è proprio quel movimento che l'effetto FLIP
  // sopra anima. Lo scambio scatta solo quando il cursore supera la metà della
  // riga sorvolata (e nel verso in cui ci si sta muovendo): senza questa
  // isteresi, due righe adiacenti si scambiavano avanti e indietro ad ogni
  // minimo tremore del mouse, con un effetto scattoso e disorientante.
  const startProjectDrag = (id: string, e: React.PointerEvent): void => {
    if (e.button !== 0) return
    startPointerDrag(e, e.currentTarget as HTMLElement, {
      onStart: () => setReorderDragId(id),
      onMove: (x, y) => {
        const over = hitAt(x, y, '[data-project-id]')
        const overId = over?.dataset.projectId
        if (!over || !overId || overId === id) return
        const rect = over.getBoundingClientRect()
        const pastMidpoint = y - rect.top > rect.height / 2
        setProjects((prev) => {
          const from = prev.findIndex((p) => p.id === id)
          const to = prev.findIndex((p) => p.id === overId)
          if (from < 0 || to < 0 || from === to) return prev
          const movingDown = from < to
          if (movingDown && !pastMidpoint) return prev
          if (!movingDown && pastMidpoint) return prev
          const next = prev.slice()
          const [moved] = next.splice(from, 1)
          next.splice(to, 0, moved)
          return next
        })
      },
      onEnd: () => {
        persistProjects(latestProjects.current)
        setReorderDragId(null)
      }
    })
  }

  // --- Persistenza progetti (projects.json) -------------------------------
  useEffect(() => {
    let alive = true
    void (async () => {
      const data = (await window.dashai.projects.load()) as ProjectsFile | null
      if (!alive) return
      if (data && Array.isArray(data.projects) && data.projects.length > 0) {
        const list = normalizeProjects(data.projects)
        setProjects(list)
        // I prompt dei file in versione 1 (annidati nei progetti) non vengono
        // recuperati: si legge solo l'elenco globale.
        setPrompts(normalizePrompts(data.prompts))
      } else {
        const seed = seedProjects()
        setProjects(seed.projects)
        setPrompts(seed.prompts)
        void window.dashai.projects.save(seed)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // projects.json contiene sia i progetti sia l'elenco globale dei prompt: ogni
  // salvataggio riscrive il file intero, quindi va passata anche la parte che
  // non sta cambiando.
  const persist = (nextProjects: Project[], nextPrompts: Prompt[]): void => {
    setProjects(nextProjects)
    setPrompts(nextPrompts)
    void window.dashai.projects.save({
      version: PROJECTS_VERSION,
      projects: nextProjects,
      prompts: nextPrompts
    } satisfies ProjectsFile)
  }
  // Il campo `order` rispecchia sempre la posizione nell'array: viene
  // ristampato ad ogni salvataggio così resta coerente anche dopo aggiunte o
  // rimozioni, non solo dopo un riordino esplicito.
  const persistProjects = (next: Project[]): void =>
    persist(
      next.map((p, i) => ({ ...p, order: i })),
      prompts
    )
  const persistPrompts = (next: Prompt[]): void => persist(projects, next)

  // --- Cartelle trascinate da Esplora file / Finder -------------------------
  // Rilasciate sull'elenco dei progetti, diventano subito progetti: nome della
  // cartella, cartella già impostata, un colore non ancora usato. I file
  // (non cartelle) e le cartelle che sono già un progetto si ignorano.
  const persistRef = useRef(persistProjects)
  persistRef.current = persistProjects
  useEffect(() => {
    const overProjects = (x: number, y: number): boolean => {
      const box = projectTreeRef.current
      const el = document.elementFromPoint(x, y)
      return !!box && !!el && box.contains(el)
    }
    return window.dashai.onFolderDrag(async (ev) => {
      if (ev.type === 'leave') return setFolderOver(false)
      const inside = overProjects(ev.x, ev.y)
      if (ev.type === 'over') return setFolderOver(inside)
      setFolderOver(false)
      if (!inside) return
      const known = new Set(latestProjects.current.map((p) => p.cwd.toLowerCase()))
      const added: Project[] = []
      for (const path of ev.paths) {
        if (known.has(path.toLowerCase()) || !(await window.dashai.isDirectory(path))) continue
        known.add(path.toLowerCase())
        const label = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
        const used = new Set([...latestProjects.current, ...added].map((p) => p.color))
        const color = TOP_COLORS.slice(1).find((c) => !used.has(c)) ?? TOP_COLORS[1 + ((latestProjects.current.length + added.length) % (TOP_COLORS.length - 1))]
        added.push(makeProject({ label, cwd: path, color }))
      }
      if (added.length) persistRef.current([...latestProjects.current, ...added])
    })
  }, [])

  // Il "+" apre una BOZZA: nulla viene aggiunto finchÃ© non si salva.
  const addProject = (): void => {
    setEditingProject(makeProject({ label: `Progetto ${projects.length + 1}` }))
    setEditingIsNew(true)
  }
  const editProject = (p: Project): void => {
    setEditingProject(p)
    setEditingIsNew(false)
  }
  const closeEditor = (): void => {
    setEditingProject(null)
    setEditingIsNew(false)
  }
  const saveProject = (p: Project): void => {
    if (editingIsNew) {
      persistProjects([...projects, p])
    } else {
      persistProjects(projects.map((x) => (x.id === p.id ? p : x)))
      // Il colore progetto Ã¨ il colore delle sue card: applicalo alle card aperte.
      setRows((s) =>
        s.map((row) => ({
          ...row,
          cols: row.cols.map((c) => (c.projectId === p.id ? { ...c, color: p.color } : c))
        }))
      )
      setChats((s) => s.map((c) => (c.projectId === p.id ? { ...c, color: p.color } : c)))
    }
    closeEditor()
  }
  const deleteProject = (id: string): void => {
    // Se Ã¨ una bozza non ancora salvata, si limita a scartarla.
    if (!editingIsNew) persistProjects(projects.filter((x) => x.id !== id))
    closeEditor()
  }

  // --- Apertura card da progetto / comando --------------------------------
  const openColumn = (partial: Omit<Column, 'id' | 'w'>, w = 1, beside = true): void => {
    const col: Column = { id: newColId(), w, ...partial }
    if (col.kind !== 'prompt') setChats((s) => [...s, col])
    placeCol(col, beside)
    // La card appena aperta è quella su cui si vuole scrivere.
    setActiveId(col.id)
    setFocusTick((n) => n + 1)
  }
  const openCommandCard = (p: Project, cmd: QuickCommand, beside = false): void =>
    openColumn({
      projectId: p.id,
      title: cmd.label,
      icon: cmd.icon,
      color: p.color,
      shell: cmd.shell,
      shellPath: cmd.shellPath,
      cwd: p.cwd,
      startupCommand: cmd.command,
      closeOnExit: cmd.closeOnExit,
      startedAt: Date.now()
    }, 1, beside)

  const launchAgent = (p: Project, agent: AgentKey, beside: boolean): void =>
    openColumn({
      projectId: p.id,
      title: AGENT_LABEL[agent],
      color: p.color,
      cwd: p.cwd,
      startupCommand: settings.agents[agent].command,
      startedAt: Date.now()
    }, 1, beside)

  const resumeAgentSession = (p: Project, sess: AgentSession, beside: boolean): void => {
    // Già aperta tra le chat attive: basta mostrarla.
    const open = chats.find((c) => c.sessionId === sess.id)
    if (open) {
      showChat(open.id, beside)
      return
    }
    openColumn({
      projectId: p.id,
      title: sess.title,
      color: p.color,
      cwd: p.cwd,
      sessionId: sess.id,
      startedAt: Date.now(),
      startupCommand: sess.agent === 'claude' ? `claude --resume ${sess.id}` : `codex resume ${sess.id}`
    }, 1, beside)
  }

  // Apre una card editor: nuovo prompt vuoto oppure uno dell'elenco globale.
  // Nasce più stretta dei terminali (w<1) così si distingue anche per dimensione.
  // Senza progetto e senza colore: color '' fa cadere la card sulla superficie
  // neutra, e senza projectId l'intestazione non mostra alcun prefisso.
  const openPromptCard = (prompt?: Prompt): void =>
    openColumn(
      {
        kind: 'prompt',
        title: prompt?.label ?? t('prompts.newCard'),
        color: '',
        promptId: prompt?.id,
        content: prompt?.content ?? ''
      },
      0.6
    )

  // Il testo dell'editor vive nello stato delle righe (col.content): così
  // spostare la card in un'altra riga la rimonta senza perdere ciò che è stato
  // scritto ma non ancora salvato nel progetto.
  const setPromptContent = (id: string, content: string): void =>
    setRows((s) =>
      s.map((row) => ({
        ...row,
        cols: row.cols.map((c) => (c.id === id ? { ...c, content } : c))
      }))
    )

  // Salva il testo di una card prompt nell'elenco globale: aggiorna quello
  // legato (promptId) o ne crea uno nuovo, legando poi la card al prompt creato.
  const savePrompt = (col: Column, content: string): void => {
    if (col.promptId) {
      const pid = col.promptId
      persistPrompts(
        prompts.map((pr) => (pr.id === pid ? { ...pr, label: col.title || pr.label, content } : pr))
      )
      return
    }
    const created = makePrompt({ label: col.title || t('prompts.newCard'), content })
    persistPrompts([...prompts, created])
    // Lega la card al prompt appena creato: i salvataggi successivi lo aggiornano.
    setRows((s) =>
      s.map((row) => ({
        ...row,
        cols: row.cols.map((c) => (c.id === col.id ? { ...c, promptId: created.id } : c))
      }))
    )
  }

  const deletePrompt = (promptId: string): void =>
    persistPrompts(prompts.filter((pr) => pr.id !== promptId))

  // --- Card attiva --------------------------------------------------------
  /** Card in ordine di lettura (riga → colonna): ordine del ciclo e di Alt+N. */
  const cardOrder = rows.flatMap((row, r) => row.cols.map((col, c) => ({ id: col.id, r, c })))

  /** Card su cui spostare il fuoco quando `id` viene chiusa. */
  const cardAfter = (id: string): string | null => {
    const i = cardOrder.findIndex((x) => x.id === id)
    if (i < 0) return null
    return cardOrder[i + 1]?.id ?? cardOrder[i - 1]?.id ?? null
  }

  /** Rende attiva una card, la riapre se compressa e le porta il fuoco. */
  const focusCard = (id: string | null | undefined): void => {
    if (!id) return
    setActiveId(id)
    setHighlightId(id)
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS)
    setRows((s) =>
      s.map((row) => ({
        ...row,
        cols: row.cols.map((c) => (c.id === id && c.collapsed ? { ...c, collapsed: false } : c))
      }))
    )
    setFocusTick((n) => n + 1)
  }

  const removeColById = (id: string): void => {
    endSession(id)
    setChats((s) => s.filter((c) => c.id !== id))
    // Card chiusa da sola (processo terminato): l'attiva passa alla vicina, ma
    // senza rubare il fuoco a dove sta scrivendo l'utente.
    if (activeId === id) setActiveId(cardAfter(id))
    setRows((s) =>
      s
        .map((row) => ({ ...row, cols: row.cols.filter((c) => c.id !== id) }))
        .filter((row) => row.cols.length > 0)
    )
  }

  /**
   * Mette una card nella griglia. `beside`: accanto a quella attiva (o in
   * coda se non ce n'è una); altrimenti prende il posto della chat attiva.
   */
  const placeCol = (col: Column, beside: boolean): void => {
    setRows((s) => {
      if (s.length === 0) return [{ h: 1, cols: [col] }]
      let r = s.findIndex((row) => row.cols.some((c) => c.id === activeId))
      const c = r >= 0 ? s[r].cols.findIndex((x) => x.id === activeId) : -1
      if (r < 0) r = 0
      return s.map((row, i) => {
        if (i !== r) return row
        const cols = row.cols.slice()
        if (!beside && c >= 0 && cols[c].kind !== 'prompt') cols[c] = { ...col, w: cols[c].w }
        else cols.splice(c >= 0 ? c + 1 : cols.length, 0, col)
        return { ...row, cols }
      })
    })
  }

  /** Chat attiva scelta dalla barra laterale: la mostra (o la affianca). */
  const showChat = (id: string, beside: boolean): void => {
    const visible = rows.some((row) => row.cols.some((c) => c.id === id))
    const col = chats.find((c) => c.id === id)
    // Già sullo schermo: un clic la toglie dalla vista (resta tra le chat
    // attive); con Ctrl/Cmd porta solo il fuoco su di lei.
    if (visible && !beside) {
      hideChat(id)
      return
    }
    if (!visible && col) placeCol({ ...col, collapsed: false }, beside)
    focusCard(id)
  }

  /** Toglie una chat dallo schermo: la sessione resta viva tra le chat attive. */
  const hideChat = (id: string): void => {
    if (activeId === id) setActiveId(cardAfter(id))
    setRows((s) =>
      s
        .map((row) => ({ ...row, cols: row.cols.filter((c) => c.id !== id) }))
        .filter((row) => row.cols.length > 0)
    )
  }

  /** Chiude davvero una chat: termina la sessione e la toglie ovunque. */
  const closeChat = (id: string): void => {
    endSession(id)
    if (activeId === id) setActiveId(cardAfter(id))
    setChats((s) => s.filter((c) => c.id !== id))
    setWaiting((w) => {
      if (!w.has(id)) return w
      const n = new Set(w)
      n.delete(id)
      return n
    })
    setRows((s) =>
      s
        .map((row) => ({ ...row, cols: row.cols.filter((c) => c.id !== id) }))
        .filter((row) => row.cols.length > 0)
    )
  }

  /** Applica una modifica a una card sia nella griglia sia tra le chat attive. */
  const patchCol = (id: string, patch: Partial<Column>): void => {
    setRows((s) =>
      s.map((row) => ({ ...row, cols: row.cols.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
    )
    setChats((s) => s.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  // Segnali dal registro delle sessioni: "ti aspetto", input dell'utente,
  // processo terminato (con "chiudi al termine" la chat sparisce).
  const chatsRef = useRef(chats)
  chatsRef.current = chats
  useEffect(() => {
    const offAtt = onAttention((id) =>
      setWaiting((w) => (w.has(id) ? w : new Set(w).add(id)))
    )
    const offIn = onUserInput((id) =>
      setWaiting((w) => {
        if (!w.has(id)) return w
        const n = new Set(w)
        n.delete(id)
        return n
      })
    )
    const offExit = onSessionExit((id) => {
      const col = chatsRef.current.find((c) => c.id === id)
      if (col?.closeOnExit) closeChatRef.current(id)
    })
    return () => {
      offAtt()
      offIn()
      offExit()
    }
  }, [])
  const closeChatRef = useRef(closeChat)
  closeChatRef.current = closeChat

  // Le chat attive si ricordano fra un avvio e l'altro (senza il testo dei prompt).
  useEffect(() => {
    try {
      localStorage.setItem('dashai.chats', JSON.stringify(chats.map(({ content: _c, ...c }) => c)))
    } catch {
      /* archiviazione non disponibile */
    }
  }, [chats])

  // Ogni tanto si cerca, per le chat di Claude Code e Codex, la sessione più
  // recente della loro cartella nata dopo l'avvio della chat: se ne tiene il
  // codice (per riprenderla) e, se la chat non è stata rinominata a mano, il
  // nome. La rinomina blocca solo il nome, mai l'aggancio della sessione.
  useEffect(() => {
    const tick = async (): Promise<void> => {
      const list = chatsRef.current.filter(
        (c) => c.startedAt && detectAgent(c.startupCommand) !== 'ollama' && detectAgent(c.startupCommand)
      )
      const byCwd = new Map<string, AgentSession[]>()
      for (const c of list) {
        const cwd = c.cwd ?? ''
        if (!byCwd.has(cwd)) byCwd.set(cwd, await window.dashai.agentSessions(cwd).catch(() => []))
        const agent = detectAgent(c.startupCommand)
        const taken = new Set(chatsRef.current.filter((x) => x.id !== c.id).map((x) => x.sessionId))
        const match = c.sessionId
          ? byCwd.get(cwd)!.find((x) => x.id === c.sessionId)
          : byCwd.get(cwd)!.find((x) => x.agent === agent && x.updated >= (c.startedAt as number) - 5000 && !taken.has(x.id))
        if (!match) continue
        const patch: Partial<Column> = {}
        if (match.id !== c.sessionId) patch.sessionId = match.id
        if (!c.titleLocked && match.title !== c.title) patch.title = match.title
        if (Object.keys(patch).length) patchColRef.current(c.id, patch)
      }
    }
    const timer = setInterval(() => void tick(), 15000)
    return () => clearInterval(timer)
  }, [])
  const patchColRef = useRef(patchCol)
  patchColRef.current = patchCol

  useEffect(() => {
    try {
      localStorage.setItem('dashai.chatsHeight', String(Math.round(chatsHeight)))
    } catch {
      /* archiviazione non disponibile */
    }
  }, [chatsHeight])

  const startSidebarResize = (e: React.PointerEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidth
    const onMove = (ev: PointerEvent): void =>
      setSidebarWidth(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, startW + ev.clientX - startX)))
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  useEffect(() => {
    try {
      localStorage.setItem('dashai.sidebarWidth', String(Math.round(sidebarWidth)))
    } catch {
      /* archiviazione non disponibile */
    }
  }, [sidebarWidth])

  /** Nuova chat al volo, senza progetto: parte dalla cartella utente. */
  const launchFreeAgent = (agent: AgentKey, beside: boolean): void =>
    openColumn({
      title: AGENT_LABEL[agent],
      color: '',
      cwd: '',
      startupCommand: settings.agents[agent].command,
      startedAt: Date.now()
    }, 1, beside)

  // --- Ripristino layout --------------------------------------------------
  /**
   * Riporta tutti i pesi a 1: tracce di pari dimensione lungo l'asse del canvas
   * e card di pari dimensione dentro ogni traccia. Vale per entrambi gli
   * orientamenti senza distinzioni, perché sono i due assi a scambiarsi di ruolo,
   * non i pesi.
   */
  const resetLayout = (): void =>
    setRows((s) => s.map((row) => ({ ...row, h: 1, cols: row.cols.map((c) => ({ ...c, w: 1 })) })))

  // --- Comprimi -----------------------------------------------------------
  const toggleCollapse = (id: string): void =>
    setRows((s) =>
      s.map((row) => ({
        ...row,
        cols: row.cols.map((c) => (c.id === id ? { ...c, collapsed: !c.collapsed } : c))
      }))
    )

  // --- Resize (tracce/card) via listener globali --------------------------
  const handleMove = useCallback(
    (e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const sizes = d.startSizes.slice()
    const total = sizes.reduce((a, b) => a + b, 0)
    const idx = d.index

    // Le tracce si ridimensionano lungo l'asse del canvas, le card lungo l'asse
    // interno alla traccia: quale dei due sia quello verticale dipende
    // dall'orientamento scelto.
    const vertical = d.type === 'row' ? byRows : !byRows
    const size = vertical ? d.rect.height : d.rect.width
    const origin = vertical ? e.clientY : e.clientX
    const trackPx = (size - (sizes.length - 1) * HANDLE) / total
    const deltaFr = (origin - d.start) / trackPx

    let a = sizes[idx] + deltaFr
    let b = sizes[idx + 1] - deltaFr
    if (a < MIN_FR) {
      b -= MIN_FR - a
      a = MIN_FR
    }
    if (b < MIN_FR) {
      a -= MIN_FR - b
      b = MIN_FR
    }
    sizes[idx] = Math.max(a, MIN_FR)
    sizes[idx + 1] = Math.max(b, MIN_FR)

    if (d.type === 'row') {
      setRows((prev) => prev.map((r, i) => ({ ...r, h: sizes[i] ?? r.h })))
    } else {
      const rowIndex = d.rowIndex
      setRows((prev) =>
        prev.map((r, i) =>
          i === rowIndex
            ? { ...r, cols: r.cols.map((col, ci) => ({ ...col, w: sizes[ci] ?? col.w })) }
            : r
        )
      )
    }
    },
    [byRows]
  )

  useEffect(() => {
    const onMove = (e: PointerEvent): void => handleMove(e)
    const onUp = (): void => {
      dragRef.current = null
    }
    const onDocClick = (): void => setOpenMenu((m) => (m ? null : m))
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('click', onDocClick)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('click', onDocClick)
    }
  }, [handleMove])

  const startDragRow = (index: number, e: React.PointerEvent): void => {
    e.preventDefault()
    const rect = outerRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = {
      type: 'row',
      index,
      rect,
      start: byRows ? e.clientY : e.clientX,
      startSizes: rows.map((r) => r.h)
    }
  }
  const startDragCol = (rowIndex: number, index: number, e: React.PointerEvent): void => {
    e.preventDefault()
    const parent = (e.currentTarget as HTMLElement).parentElement
    if (!parent) return
    dragRef.current = {
      type: 'col',
      rowIndex,
      index,
      rect: parent.getBoundingClientRect(),
      start: byRows ? e.clientX : e.clientY,
      startSizes: rows[rowIndex].cols.map((c) => c.w)
    }
  }

  // --- Aggiunta / rimozione / rename schede -------------------------------
  const addCardToRow = (r: number, c: number): void => {
    setOpenMenu(null)
    setRows((s) =>
      s.map((row, ri) => {
        if (ri !== r) return row
        const src = row.cols[c]
        const clone: Column = {
          id: newColId(),
          projectId: src.projectId,
          w: 1,
          title: '',
          color: src.color,
          shell: src.shell,
          shellPath: src.shellPath,
          cwd: src.cwd,
          startupCommand: ''
        }
        setChats((list) => [...list, clone])
        return { ...row, cols: [...row.cols.slice(0, c + 1), clone, ...row.cols.slice(c + 1)] }
      })
    )
  }

  const removeCol = (r: number, c: number): void => {
    setOpenMenu(null)
    const col = rows[r]?.cols[c]
    // Una chat chiusa dalla griglia resta tra le chat attive (la sessione vive);
    // si termina davvero con la X nella barra laterale. Un prompt invece sparisce.
    // Chiusura voluta dall'utente: il fuoco passa alla card vicina.
    if (col && activeId === col.id) focusCard(cardAfter(col.id))
    setRows((s) =>
      s
        .map((row, ri) => (ri === r ? { ...row, cols: row.cols.filter((_, ci) => ci !== c) } : row))
        .filter((row) => row.cols.length > 0)
    )
  }

  const commitTitle = (r: number, c: number, value: string): void => {
    setEditing(null)
    const id = rows[r]?.cols[c]?.id
    if (id) patchCol(id, { title: value.trim(), titleLocked: value.trim() !== '' })
  }

  // --- Shortcut da tastiera -----------------------------------------------
  // Porta il fuoco del DOM dentro la card attiva. Sia il terminale (textarea di
  // servizio di xterm) sia l'editor di prompt espongono una textarea: è quella
  // che deve ricevere i tasti.
  useEffect(() => {
    if (focusTick === 0 || !activeId) return
    const host = document.querySelector(`[data-card-id="${activeId}"]`)
    host?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo su richiesta esplicita
  }, [focusTick])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // Niente shortcut mentre si rinomina una card o con un modale aperto.
      if (editing || editingProject || settingsOpen) return

      // Il listener è in fase di capture e ferma la propagazione: senza questo
      // xterm inoltrerebbe comunque i tasti alla shell.
      const take = (): void => {
        e.preventDefault()
        e.stopPropagation()
      }

      // Modificatore principale delle scorciatoie: Cmd su macOS, Ctrl altrove.
      // Ctrl+Tab resta Ctrl anche su mac perché Cmd+Tab è riservato dal sistema
      // per il cambio applicazione.
      const mod = isMac ? e.metaKey : e.ctrlKey

      const step = (delta: number): void => {
        if (cardOrder.length === 0) return
        const i = cardOrder.findIndex((x) => x.id === activeId)
        const next = i < 0 ? 0 : (i + delta + cardOrder.length) % cardOrder.length
        focusCard(cardOrder[next].id)
      }

      // Le frecce lungo l'asse interno scorrono la traccia, le altre cambiano
      // traccia mantenendo la posizione più vicina. Con le righe l'asse interno
      // è ←/→, con le colonne è ↑/↓.
      // Nessun wrap: sui bordi della griglia il fuoco resta dov'è.
      const move = (dir: 'left' | 'right' | 'up' | 'down'): void => {
        const pos = cardOrder.find((x) => x.id === activeId)
        if (!pos) {
          step(1)
          return
        }
        const horizontal = dir === 'left' || dir === 'right'
        const back = dir === 'left' || dir === 'up'
        if (horizontal === byRows) {
          focusCard(rows[pos.r]?.cols[pos.c + (back ? -1 : 1)]?.id)
          return
        }
        const row = rows[pos.r + (back ? -1 : 1)]
        if (row) focusCard(row.cols[Math.min(pos.c, row.cols.length - 1)]?.id)
      }

      // Ctrl+Tab / Ctrl+Shift+Tab → card successiva / precedente (ciclico)
      if (e.ctrlKey && !e.altKey && e.key === 'Tab') {
        take()
        step(e.shiftKey ? -1 : 1)
        return
      }

      // Alt+1…9 → salto diretto alla card N. Si guarda `code` e non `key`:
      // su macOS Alt+1 non produce il carattere '1'.
      if (e.altKey && !e.ctrlKey && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
        const target = cardOrder[Number(e.code.slice(5)) - 1]
        if (target) {
          take()
          focusCard(target.id)
        }
        return
      }

      // Ctrl+Alt+frecce (Cmd+Option+frecce su mac) → fuoco direzionale sulla griglia
      if (mod && e.altKey) {
        const dir = DIRECTIONS[e.key]
        if (dir) {
          take()
          move(dir)
        }
        return
      }

      // Ctrl+Shift+W (Cmd+Shift+W su mac) → chiudi la card attiva. Non solo
      // +W: nella shell cancella la parola precedente (readline) e non va rubato.
      if (mod && e.shiftKey && e.key.toLowerCase() === 'w') {
        const pos = cardOrder.find((x) => x.id === activeId)
        if (pos) {
          take()
          removeCol(pos.r, pos.c)
        }
        return
      }

      // Ctrl+B (Cmd+B su mac) → mostra/nascondi la barra laterale
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b') {
        take()
        setCollapsed((v) => !v)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helper ricreati a ogni render
  }, [rows, activeId, editing, editingProject, settingsOpen, byRows])

  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
    },
    []
  )

  // --- Spostamento schede ---------------------------------------------------
  // Si afferra l'intestazione della scheda. Come per i progetti, è fatto con
  // gli eventi del puntatore (vedi startProjectDrag). I punti di rilascio sono
  // marcati nel DOM: data-drop-card (una scheda: prima o dopo, secondo la metà
  // sorvolata), data-drop-veil (il segnaposto già aperto) e data-drop-zone
  // (una nuova riga fra le righe).
  const cardHitAt = (x: number, y: number): CardHit => {
    const el = hitAt(x, y, '[data-drop-zone],[data-drop-veil],[data-drop-card]')
    if (!el) return null
    if (el.dataset.dropZone !== undefined) return { kind: 'zone', idx: Number(el.dataset.dropZone) }
    if (el.dataset.dropVeil) {
      const [r, c, side] = el.dataset.dropVeil.split('.')
      return { kind: 'card', r: Number(r), c: Number(c), side: side === 'before' ? 'before' : 'after' }
    }
    const [r, c] = (el.dataset.dropCard ?? '').split('.').map(Number)
    // Metà della card lungo l'asse interno alla traccia: orizzontale se le card
    // sono affiancate, verticale se impilate.
    const rect = el.getBoundingClientRect()
    const before = byRows ? x - rect.left < rect.width / 2 : y - rect.top < rect.height / 2
    return { kind: 'card', r, c, side: before ? 'before' : 'after' }
  }
  const startCardDrag = (r: number, c: number, e: React.PointerEvent): void => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('input, textarea')) return
    startPointerDrag(e, e.currentTarget as HTMLElement, {
      onStart: () => {
        setDragCard({ r, c })
        setOpenMenu(null)
      },
      onMove: (x, y) => {
        const hit = cardHitAt(x, y)
        if (hit?.kind === 'card') {
          setDropZone(null)
          setDropTarget((dt) =>
            dt && dt.r === hit.r && dt.c === hit.c && dt.side === hit.side ? dt : { r: hit.r, c: hit.c, side: hit.side }
          )
        } else if (hit?.kind === 'zone') {
          setDropTarget(null)
          setDropZone((z) => (z === hit.idx ? z : hit.idx))
        }
      },
      onEnd: (x, y) => {
        const hit = cardHitAt(x, y)
        if (hit?.kind === 'card') moveToRow(r, c, hit.r, hit.side === 'before' ? hit.c : hit.c + 1)
        else if (hit?.kind === 'zone') moveToNewRow(r, c, hit.idx)
        else endCardDrag()
      }
    })
  }
  const endCardDrag = (): void => {
    setDragCard(null)
    setDropTarget(null)
    setDropZone(null)
  }

  const moveToRow = (fromR: number, fromC: number, toR: number, toC: number): void => {
    setRows((s) => {
      const next = s.map((row) => ({ ...row, cols: row.cols.slice() }))
      if (!next[fromR]) return s
      const card = next[fromR].cols[fromC]
      next[fromR].cols.splice(fromC, 1)
      let tR = toR
      let tC = toC
      if (fromR === toR && fromC < toC) tC--
      if (next[fromR].cols.length === 0) {
        next.splice(fromR, 1)
        if (fromR < tR) tR--
      }
      if (!next[tR]) {
        next.push({ h: 1, cols: [] })
        tR = next.length - 1
        tC = 0
      }
      next[tR].cols.splice(Math.max(0, Math.min(tC, next[tR].cols.length)), 0, card)
      return next
    })
    endCardDrag()
  }
  const moveToNewRow = (fromR: number, fromC: number, idx: number): void => {
    setRows((s) => {
      const next = s.map((row) => ({ ...row, cols: row.cols.slice() }))
      if (!next[fromR]) return s
      const card = next[fromR].cols[fromC]
      next[fromR].cols.splice(fromC, 1)
      let at = idx
      if (next[fromR].cols.length === 0) {
        next.splice(fromR, 1)
        if (fromR < at) at--
      }
      next.splice(Math.max(0, Math.min(at, next.length)), 0, { h: 1, cols: [card] })
      return next
    })
    endCardDrag()
  }

  // --- Render canvas ------------------------------------------------------
  const dragging = !!dragCard

  const renderRow = (row: Row, r: number): React.ReactElement => {
    // Se tutte le card della traccia sono compresse, la traccia si accorcia alle
    // sole intestazioni (traccia di "card parcheggiate").
    // Vale solo per le righe: lì l'asse del canvas è l'altezza, e rinunciarvi
    // lascia le intestazioni leggibili. Fra le colonne l'asse è la larghezza, e
    // stringerla al contenuto renderebbe i titoli illeggibili: le card compresse
    // si accorciano già da sole in verticale, lasciando la colonna vuota sotto.
    const allCollapsed =
      byRows && row.cols.length > 0 && row.cols.every((c) => c.collapsed)
    // Normalizza i pesi SOLO per il render (non lo stato): dopo che una card
    // viene chiusa/estratta/spostata, la somma dei col.w residui puÃ² scendere
    // sotto 1. CSS flexbox non distribuisce lo spazio libero oltre alla somma
    // dei flex-grow quando questa Ã¨ < 1, lasciando un vuoto invece di
    // riempire la riga. Il drag-resize continua a leggere col.w grezzo dallo
    // stato (rapporti relativi, non toccati da questa normalizzazione).
    const totalW = row.cols.reduce((sum, c) => sum + c.w, 0) || row.cols.length || 1
    return (
    <div
      key={`row-${r}`}
      style={{
        flex: allCollapsed ? '0 0 auto' : `${row.h} 1 0%`,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0
      }}
    >
      <div
        style={{
          flex: allCollapsed ? '0 0 auto' : '1 1 0%',
          display: 'flex',
          minWidth: 0,
          minHeight: 0
        }}
      >
        {/* grid: occupa sempre tutta la traccia (flex:1) cosÃ¬ le card compresse
            NON perdono la dimensione sull'asse trasversale */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: byRows ? 'row' : 'column',
            minWidth: 0,
            minHeight: 0,
            position: 'relative'
          }}
        >
          {row.cols.map((col, c) => {
            const id = col.id
            const dropSide =
              dropTarget && dropTarget.r === r && dropTarget.c === c ? dropTarget.side : null
            return (
              <Fragment key={id}>
                {dropSide === 'before' && veil(r, c, 'before')}
                <Card
                  r={r}
                  c={c}
                  col={{ ...col, w: (col.w / totalW) * row.cols.length }}
                  projectLabel={projects.find((p) => p.id === col.projectId)?.label}
                  isMenuOpen={openMenu === id}
                  isEditing={editing === id}
                  isDragged={!!dragCard && dragCard.r === r && dragCard.c === c}
                  isActive={highlightId === id}
                  waiting={waiting.has(id)}
                  headerExtra={
                    col.kind !== 'prompt' ? (
                      <PromptMenu
                        prompts={prompts}
                        copiedLabel={t('prompts.copied')}
                        onEdit={(pr) => {
                          setActiveId(id)
                          openPromptCard(pr)
                        }}
                        onDelete={(pr) => deletePrompt(pr.id)}
                        onNew={() => {
                          setActiveId(id)
                          openPromptCard()
                        }}
                      />
                    ) : undefined
                  }
                  byRows={byRows}
                  onActivate={() => setActiveId(id)}
                  dropSide={null}
                  onToggleMenu={(e) => {
                    e.stopPropagation()
                    setOpenMenu((m) => (m === id ? null : id))
                  }}
                  onRename={(e) => {
                    e.stopPropagation()
                    setOpenMenu(null)
                    setEditing(id)
                  }}
                  onClose={(e) => {
                    e.stopPropagation()
                    removeCol(r, c)
                  }}
                  onNewCard={(e) => {
                    e.stopPropagation()
                    addCardToRow(r, c)
                  }}
                  onCommitTitle={(value) => commitTitle(r, c, value)}
                  onCancelEdit={() => setEditing(null)}
                  onDragStart={(e) => startCardDrag(r, c, e)}
                  onProcessExit={() => removeColById(id)}
                  onToggleCollapse={() => toggleCollapse(id)}
                  onSavePrompt={(content) => savePrompt(col, content)}
                  onChangePrompt={(content) => setPromptContent(id, content)}
                />
                {dropSide === 'after' && veil(r, c, 'after')}
                {c < row.cols.length - 1 && (
                  <div
                    onPointerDown={(e) => startDragCol(r, c, e)}
                    style={{
                      flex: `0 0 ${HANDLE}px`,
                      alignSelf: 'stretch',
                      cursor: byRows ? 'col-resize' : 'row-resize',
                      position: 'relative',
                      zIndex: 2
                    }}
                  />
                )}
              </Fragment>
            )
          })}
        </div>
      </div>
    </div>
    )
  }

  // Velo di rilascio: occupa il posto dove andrà la chat trascinata; la card
  // di destinazione si stringe da sola perché condivide lo spazio della traccia.
  const veil = (r: number, c: number, side: 'before' | 'after'): React.ReactElement => {
    const dragged = dragCard ? rows[dragCard.r]?.cols[dragCard.c] : undefined
    const color = dragged?.color || 'var(--color-accent)'
    return (
      <div
        key="veil"
        data-drop-veil={`${r}.${c}.${side}`}
        style={{
          flex: '1 1 0%',
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-2)',
          borderRadius: 'var(--radius-lg)',
          border: `1.5px dashed ${color}`,
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
          color,
          fontSize: 13,
          fontWeight: 500
        }}
      >
        Rilascia qui
      </div>
    )
  }

  const zone = (idx: number): React.ReactElement => (
    <div
      key={`z-${idx}`}
      data-drop-zone={idx}
      style={{
        flex: '0 0 auto',
        // Striscia trasversale al canvas: bassa e larga fra le righe, stretta e
        // alta fra le colonne.
        ...(byRows
          ? { height: 44, margin: 'var(--space-1) 0' }
          : { width: 44, alignSelf: 'stretch', margin: '0 var(--space-1)' }),
        borderRadius: 'var(--radius-md)',
        border: `1.5px dashed ${dropZone === idx ? 'var(--color-accent)' : 'var(--color-divider)'}`,
        background:
          dropZone === idx ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'transparent'
      }}
    />
  )

  const canvasChildren: React.ReactElement[] = []
  if (dragging) {
    rows.forEach((row, i) => {
      canvasChildren.push(zone(i))
      canvasChildren.push(renderRow(row, i))
    })
    canvasChildren.push(zone(rows.length))
  } else {
    rows.forEach((row, i) => {
      canvasChildren.push(renderRow(row, i))
      if (i < rows.length - 1) {
        canvasChildren.push(
          <div
            key={`rh-${i}`}
            onPointerDown={(e) => startDragRow(i, e)}
            style={{
              flex: `0 0 ${HANDLE}px`,
              ...(byRows
                ? { width: '100%', height: HANDLE, cursor: 'row-resize' }
                : { width: HANDLE, height: '100%', cursor: 'col-resize' })
            }}
          />
        )
      }
    })
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--app-bg)',
        color: 'var(--color-text)',
        fontFamily: 'var(--font-body)',
        padding: 'var(--space-4)',
        paddingTop: `calc(var(--space-4) + ${titleInset}px)`,
        gap: 'var(--space-4)'
      }}
    >
      {titleInset > 0 && (
        <div
          data-tauri-drag-region
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: `calc(var(--space-4) + ${titleInset}px)`
          }}
        />
      )}
      {isWin && !isFullScreen && <WindowControls />}
      {!collapsed && (
        <div
          style={{
            flex: `0 0 ${sidebarWidth}px`,
            // Il contenuto (titoli lunghi) non deve mai allargare la barra.
            minWidth: 0,
            position: 'relative',
            height: '100%',
            // Barra fusa nello sfondo: niente riquadro né ombra, le "isole" sono
            // solo le chat.
            color: 'var(--color-text)',
            display: 'flex',
            flexDirection: 'column',
            padding: 'var(--space-3) var(--space-2) var(--space-2)',
            gap: 'var(--space-5)',
            minHeight: 0
          } as React.CSSProperties}
        >
          {/* Bordo destro trascinabile: allarga o stringe la barra */}
          <div className="sidebar-resizer" onPointerDown={startSidebarResize} />

          {/* Brand + chiudi barra */}
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                marginRight: 'auto',
                minWidth: 0
              }}
            >
              <BrandMark size={26} />
              <span
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 600,
                  fontSize: 18,
                  letterSpacing: '-0.03em',
                  color: 'var(--color-text)'
                }}
              >
                DashAI
              </span>
            </div>
            <div className="gear-btn" title={t('sidebar.collapse')} onClick={() => setCollapsed(true)} style={plainIconBtn}>
              <CaretDoubleLeft size={15} />
            </div>
          </div>

          {/* Albero progetti */}
          <div
            ref={projectTreeRef}
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-1)',
              // Cartelle trascinate sopra: l'area si segna come punto di
              // rilascio, come i segnaposto delle chat (contorno, non bordo,
              // così le righe non si spostano).
              borderRadius: 'var(--radius-md)',
              outline: folderOver ? '1.5px dashed var(--color-accent)' : 'none',
              background: folderOver ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : undefined
            }}
          >
            {/* Titolo "Progetti": qui stanno il + per un nuovo progetto e il
                riordino, non più nell'intestazione. `order: -1` lo tiene in cima. */}
            <div style={{ order: -1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={sectionTitleStyle}>{t('sidebar.projects')}</span>
              <div
                className={`gear-btn${reorderMode ? ' reorder-toggle-btn active' : ''}`}
                title={reorderMode ? t('sidebar.reorderDone') : t('sidebar.reorder')}
                onClick={() => {
                  setReorderDragId(null)
                  setProjectMenuId(null)
                  setReorderMode((v) => !v)
                }}
                style={plainIconBtn}
              >
                {reorderMode ? <Check size={14} /> : <ArrowsDownUp size={14} />}
              </div>
              {!reorderMode && (
                <div className="gear-btn" title={t('sidebar.newProject')} onClick={addProject} style={plainIconBtn}>
                  <Plus size={14} />
                </div>
              )}
            </div>

            {projects.map((p, idx) => {
              const isDragged = reorderDragId === p.id
              return (
              <div
                key={p.id}
                data-project-id={p.id}
                onPointerDown={(e) => reorderMode && startProjectDrag(p.id, e)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-1)'
                }}
              >
                {/* Riga progetto compatta: pallino del colore e nome. Clic = apre
                    il menu del progetto (disabilitato in riordino); cartella e
                    ingranaggio compaiono solo al passaggio del mouse. In riordino
                    oscilla come le icone della home di iOS; la riga afferrata non
                    oscilla e resta come spazio tratteggiato (contenuto invisibile,
                    non rimosso, così mantiene le stesse dimensioni). */}
                <div style={{ position: 'relative' }}>
                <div
                  className={`project-row${projectMenuId === p.id ? ' is-open' : ''}${
                    reorderMode && !isDragged ? ` reorder-wiggle${idx % 2 ? ' reorder-wiggle--alt' : ''}` : ''
                  }`}
                  onClick={() => !reorderMode && setProjectMenuId((m) => (m === p.id ? null : p.id))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-1) var(--space-2)',
                    borderRadius: 'var(--radius-md)',
                    cursor: reorderMode ? 'grab' : 'pointer',
                    minWidth: 0,
                    border: isDragged ? '1.5px dashed var(--color-accent)' : '1.5px solid transparent',
                    background: isDragged
                      ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)'
                      : undefined
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      flex: '1 1 auto',
                      minWidth: 0,
                      visibility: isDragged ? 'hidden' : 'visible'
                    }}
                  >
                  {/* Scatola 22×22 come i pulsanti cartella/ingranaggio: fissa
                      l'altezza della riga in ogni modalità. */}
                  <span style={projectRowIconBox}>
                    {reorderMode ? (
                      <DotsSixVertical size={14} color="var(--color-neutral-500)" />
                    ) : (
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color }} />
                    )}
                  </span>
                  <span
                    style={{
                      flex: '1 1 auto',
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 500,
                      fontSize: 13,
                      color: 'var(--color-text)'
                    }}
                  >
                    {p.label}
                  </span>
                  {!reorderMode && (
                    <div className="row-actions" style={{ display: 'flex', alignItems: 'center' }}>
                      <div
                        className="gear-btn"
                        title={t('project.openFolder')}
                        onClick={(e) => {
                          e.stopPropagation()
                          void window.dashai.openInFileManager(p.cwd)
                        }}
                        style={projectRowIconBtn}
                      >
                        <Folder size={16} />
                      </div>
                      <div
                        className="gear-btn"
                        title={t('project.configure')}
                        onClick={(e) => {
                          e.stopPropagation()
                          setProjectMenuId(null)
                          editProject(p)
                        }}
                        style={projectRowIconBtn}
                      >
                        <Gear size={16} />
                      </div>
                    </div>
                  )}
                  </div>
                </div>

                {/* Menu del progetto: si apre al clic sulla riga. Per ora elenca i
                    comandi del progetto (gli agenti arrivano con le impostazioni
                    del progetto). */}
                {projectMenuId === p.id && !reorderMode && (
                  <ProjectMenu
                    project={p}
                    onClose={() => setProjectMenuId(null)}
                    onAgent={(agent, beside) => {
                      setProjectMenuId(null)
                      launchAgent(p, agent, beside)
                    }}
                    onCommand={(cmd, beside) => {
                      setProjectMenuId(null)
                      openCommandCard(p, cmd, beside)
                    }}
                    onResume={(sess, beside) => {
                      setProjectMenuId(null)
                      resumeAgentSession(p, sess, beside)
                    }}
                  />
                )}
                </div>
              </div>
              )
            })}
          </div>

          <ChatList
            chats={chats}
            projects={projects}
            waiting={waiting}
            visibleIds={new Set(rows.flatMap((row) => row.cols.map((c) => c.id)))}
            activeId={activeId}
            height={chatsHeight}
            onResize={setChatsHeight}
            projectsRef={projectTreeRef}
            onShow={showChat}
            onClose={closeChat}
            onNewChat={launchFreeAgent}
            newChatLabel={t('sidebar.newChat')}
            label={t('sidebar.activeChats')}
          />

          {/* Impostazioni (in basso) */}
          <div
            className="nav-item"
            onClick={() => setSettingsOpen(true)}
            style={{
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-2)',
              borderRadius: 'var(--radius-md)',
              fontSize: 14,
              color: 'var(--color-neutral-300)',
              cursor: 'pointer'
            }}
          >
            <Gear size={17} style={{ flex: '0 0 auto' }} />
            <span>{t('nav.settings')}</span>
          </div>
        </div>
      )}

      {collapsed && (
        <ChatRail
          chats={chats}
          waiting={waiting}
          activeId={activeId}
          topInset={macTrafficLightInset}
          onOpen={() => setCollapsed(false)}
          onShow={showChat}
          onSettings={() => setSettingsOpen(true)}
          onNewChat={launchFreeAgent}
          newChatLabel={t('sidebar.newChat')}
          openLabel={t('sidebar.expand')}
        />
      )}

      <div
        ref={outerRef}
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          height: '100%',
          overflow: 'auto',
          display: 'flex',
          flexDirection: byRows ? 'column' : 'row',
          // Nessun margine proprio: la distanza dalla barra (aperta o chiusa) è
          // il gap del contenitore, uguale al margine della finestra.
          padding: 0
        }}
      >
        {canvasChildren.length > 0 ? (
          canvasChildren
        ) : (
          // Nessuna chat da guardare: un invito, non un'area vuota.
          <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-5)' }}>
            <Terminal size={32} color="var(--color-neutral-500)" />
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>{t('empty.title')}</span>
            <span style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-neutral-500)' }}>{t('empty.hint')}</span>
          </div>
        )}
      </div>

      {editingProject && (
        <ProjectEditorModal
          project={editingProject}
          isNew={editingIsNew}
          onSave={saveProject}
          onDelete={deleteProject}
          onClose={closeEditor}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          projects={projects}
          prompts={prompts}
          projectsVersion={PROJECTS_VERSION}
          onResetLayout={resetLayout}
          onReplaceData={(nextProjects, nextPrompts) => persist(nextProjects, nextPrompts)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}


/** Durata dell'evidenziazione della card raggiunta da tastiera. */
const HIGHLIGHT_MS = 900

/** Frecce → direzione, per il fuoco direzionale con Ctrl+Alt. */
const DIRECTIONS: Record<string, 'left' | 'right' | 'up' | 'down' | undefined> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down'
}


/**
 * Comando con cui riaprire una chat dopo un riavvio: la sessione dell'agente se
 * la conosciamo, altrimenti il comando originale.
 */
function resumeCommand(c: Column): string | undefined {
  const agent = detectAgent(c.startupCommand)
  if (c.sessionId && agent === 'claude') return `claude --resume ${c.sessionId}`
  if (c.sessionId && agent === 'codex') return `codex resume ${c.sessionId}`
  return c.startupCommand
}

const SIDEBAR_MIN = 200
const SIDEBAR_MAX = 520

/** Pulsante solo icona, senza bordo (chiudi barra, +, riordina). */
const plainIconBtn: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 'var(--radius-sm)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--color-neutral-400)',
  cursor: 'pointer',
  flex: '0 0 auto'
}

/** Titolo di sezione della barra laterale ("Progetti"). */
const sectionTitleStyle: React.CSSProperties = {
  flex: '1 1 auto',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-neutral-500)'
}

/** Cartella e ingranaggio nella riga progetto (visibili al passaggio del mouse). */
const projectRowIconBtn: React.CSSProperties = {
  ...plainIconBtn,
  color: 'var(--color-neutral-500)'
}



/** Stessa scatola 22×22 dei pulsanti cartella/ingranaggio: è lei a fissare
 *  l'altezza della riga progetto, non l'icona di stato al suo interno. */
const projectRowIconBox: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22
}
