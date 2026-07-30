import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretDown,
  CaretRight,
  Folder,
  Gear,
  PencilSimple,
  Plus,
  Trash
} from '@phosphor-icons/react'
import Card from './Card'
import BrandMark from './BrandMark'
import ProjectEditorModal from './ProjectEditorModal'
import SettingsModal from './SettingsModal'
import { useSettings } from './SettingsContext'
import { Icon } from './icons'
import { newColId, type Column, type Row } from './types'
import {
  PROJECTS_VERSION,
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
  // Elenco unico dei prompt: non appartengono più a un progetto.
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [promptsCollapsed, setPromptsCollapsed] = useState(true)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [editingIsNew, setEditingIsNew] = useState(false)
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [settingsOpen, setSettingsOpen] = useState(false)
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
  const macTrafficLightInset = window.dashai.platform === 'darwin' && !isFullScreen ? 28 : 0

  const toggleProject = (id: string): void =>
    setCollapsedProjects((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const outerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<ResizeDrag>(null)

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
        // All'avvio i progetti sono tutti collassati.
        setCollapsedProjects(new Set(list.map((p) => p.id)))
      } else {
        const seed = seedProjects()
        setProjects(seed.projects)
        setPrompts(seed.prompts)
        setCollapsedProjects(new Set(seed.projects.map((p) => p.id)))
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
  const persistProjects = (next: Project[]): void => persist(next, prompts)
  const persistPrompts = (next: Prompt[]): void => persist(projects, next)

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
    }
    closeEditor()
  }
  const deleteProject = (id: string): void => {
    // Se Ã¨ una bozza non ancora salvata, si limita a scartarla.
    if (!editingIsNew) persistProjects(projects.filter((x) => x.id !== id))
    closeEditor()
  }

  // --- Apertura card da progetto / comando --------------------------------
  const openColumn = (partial: Omit<Column, 'id' | 'w'>, w = 1): void => {
    const col: Column = { id: newColId(), w, ...partial }
    setRows((s) =>
      s.length === 0
        ? [{ h: 1, cols: [col] }]
        : s.map((row, i) => (i === 0 ? { ...row, cols: [...row.cols, col] } : row))
    )
    // La card appena aperta è quella su cui si vuole scrivere.
    setActiveId(col.id)
    setFocusTick((n) => n + 1)
  }
  const openCommandCard = (p: Project, cmd: QuickCommand): void =>
    openColumn({
      projectId: p.id,
      title: cmd.label,
      color: p.color,
      shell: cmd.shell,
      shellPath: cmd.shellPath,
      cwd: p.cwd,
      startupCommand: cmd.command,
      closeOnExit: cmd.closeOnExit
    })

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
    window.dashai.terminal.dispose(id)
    // Card chiusa da sola (processo terminato): l'attiva passa alla vicina, ma
    // senza rubare il fuoco a dove sta scrivendo l'utente.
    if (activeId === id) setActiveId(cardAfter(id))
    setRows((s) =>
      s
        .map((row) => ({ ...row, cols: row.cols.filter((c) => c.id !== id) }))
        .filter((row) => row.cols.length > 0)
    )
  }

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
        return { ...row, cols: [...row.cols.slice(0, c + 1), clone, ...row.cols.slice(c + 1)] }
      })
    )
  }

  const removeCol = (r: number, c: number): void => {
    setOpenMenu(null)
    const col = rows[r]?.cols[c]
    if (col) window.dashai.terminal.dispose(col.id) // termina la shell
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
    setRows((s) =>
      s.map((row, ri) =>
        ri === r
          ? { ...row, cols: row.cols.map((col, ci) => (ci === c ? { ...col, title: value.trim() } : col)) }
          : row
      )
    )
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

      // Ctrl+Alt+frecce → fuoco direzionale sulla griglia
      if (e.ctrlKey && e.altKey) {
        const dir = DIRECTIONS[e.key]
        if (dir) {
          take()
          move(dir)
        }
        return
      }

      // Ctrl+Shift+W → chiudi la card attiva. Non Ctrl+W: nella shell cancella
      // la parola precedente (readline) e non va rubato.
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'w') {
        const pos = cardOrder.find((x) => x.id === activeId)
        if (pos) {
          take()
          removeCol(pos.r, pos.c)
        }
        return
      }

      // Ctrl+B → mostra/nascondi la barra laterale
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b') {
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

  // --- Drag & drop schede -------------------------------------------------
  const startCardDrag = (r: number, c: number, e: React.DragEvent): void => {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      try {
        e.dataTransfer.setData('text/plain', `${r}.${c}`)
      } catch {
        /* alcune piattaforme lo vietano in dragstart */
      }
    }
    setTimeout(() => {
      setDragCard({ r, c })
      setOpenMenu(null)
    }, 0)
  }
  const endCardDrag = (): void => {
    setDragCard(null)
    setDropTarget(null)
    setDropZone(null)
  }
  const overCard = (r: number, c: number, e: React.DragEvent): void => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    // Metà della card lungo l'asse interno alla traccia: orizzontale se le card
    // sono affiancate, verticale se impilate.
    const rect = e.currentTarget.getBoundingClientRect()
    const before = byRows
      ? e.clientX - rect.left < rect.width / 2
      : e.clientY - rect.top < rect.height / 2
    const side = before ? 'before' : 'after'
    setDropZone(null)
    setDropTarget((dt) => (dt && dt.r === r && dt.c === c && dt.side === side ? dt : { r, c, side }))
  }
  const dropOnCard = (r: number, c: number, e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    const d = dragCard
    const side = dropTarget && dropTarget.r === r && dropTarget.c === c ? dropTarget.side : 'after'
    if (d) moveToRow(d.r, d.c, r, side === 'before' ? c : c + 1)
    else endCardDrag()
  }
  const overZone = (idx: number, e: React.DragEvent): void => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    setDropTarget(null)
    setDropZone((z) => (z === idx ? z : idx))
  }
  const dropOnZone = (idx: number, e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    const d = dragCard
    if (d) moveToNewRow(d.r, d.c, idx)
    else endCardDrag()
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
                <Card
                  r={r}
                  c={c}
                  col={{ ...col, w: (col.w / totalW) * row.cols.length }}
                  projectLabel={projects.find((p) => p.id === col.projectId)?.label}
                  isMenuOpen={openMenu === id}
                  isEditing={editing === id}
                  isDragged={!!dragCard && dragCard.r === r && dragCard.c === c}
                  isActive={highlightId === id}
                  byRows={byRows}
                  onActivate={() => setActiveId(id)}
                  dropSide={dropSide}
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
                  onDragEnd={endCardDrag}
                  onDragOver={(e) => overCard(r, c, e)}
                  onDrop={(e) => dropOnCard(r, c, e)}
                  onProcessExit={() => removeColById(id)}
                  onToggleCollapse={() => toggleCollapse(id)}
                  onSavePrompt={(content) => savePrompt(col, content)}
                  onChangePrompt={(content) => setPromptContent(id, content)}
                />
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

  const zone = (idx: number): React.ReactElement => (
    <div
      key={`z-${idx}`}
      onDragOver={(e) => overZone(idx, e)}
      onDrop={(e) => dropOnZone(idx, e)}
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
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        fontFamily: 'var(--font-body)',
        padding: 'var(--space-4)',
        paddingTop: `calc(var(--space-4) + ${macTrafficLightInset}px)`,
        gap: 'var(--space-4)'
      }}
    >
      {macTrafficLightInset > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: `calc(var(--space-4) + ${macTrafficLightInset}px)`,
            WebkitAppRegion: 'drag'
          } as React.CSSProperties}
        />
      )}
      {!collapsed && (
        <div
          style={{
            flex: '0 0 280px',
            height: '100%',
            background: 'var(--color-surface)',
            boxShadow: 'var(--shadow-sm)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--color-text)',
            display: 'flex',
            flexDirection: 'column',
            padding: 'var(--space-6) var(--space-4)',
            minHeight: 0
          } as React.CSSProperties}
        >
          {/* Brand + azioni */}
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
            <div className="collapse-btn" title="Nuovo progetto" onClick={addProject} style={iconSquare}>
              <Plus size={15} />
            </div>
            <div className="collapse-btn" title="Collassa" onClick={() => setCollapsed(true)} style={iconSquare}>
              <CaretDoubleLeft size={15} />
            </div>
          </div>

          {/* Albero progetti */}
          <div
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              overflowY: 'auto',
              marginTop: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)'
            }}
          >
            {/* Voce fissa "Prompt": elenco unico. Non è un progetto e non ha
                colore — i prompt non appartengono a nessuno.
                `order: 1` la manda in fondo, sotto tutti i progetti (che stanno
                a 0): resta scritta qui sopra per non spezzare in due il blocco
                dell'albero progetti. */}
            <div style={{ order: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <div
                className="project-row"
                onClick={() => setPromptsCollapsed((v) => !v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  minWidth: 0
                }}
              >
                {promptsCollapsed ? (
                  <CaretRight size={12} color="var(--color-neutral-500)" style={{ flex: '0 0 auto' }} />
                ) : (
                  <CaretDown size={12} color="var(--color-neutral-500)" style={{ flex: '0 0 auto' }} />
                )}
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
                  {t('prompts.title')}
                </span>
                {/* Stessa scatola 22×22 dei pulsanti cartella/ingranaggio delle
                    righe progetto: senza, il numero finirebbe a filo del bordo
                    e non allineato alla loro colonna di icone. */}
                <span
                  style={{
                    flex: '0 0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 22,
                    height: 22,
                    fontSize: 11,
                    color: 'var(--color-neutral-500)'
                  }}
                >
                  {prompts.length}
                </span>
              </div>

              {!promptsCollapsed && (
                <>
                  {/* "nuovo prompt": apre subito una card editor vuota */}
                  <div
                    className="cmd-row"
                    onClick={() => openPromptCard()}
                    title={t('prompts.newCard')}
                    style={promptRowStyle}
                  >
                    <Plus size={13} color="var(--color-neutral-400)" style={{ flex: '0 0 auto' }} />
                    <span
                      style={{
                        flex: '1 1 auto',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: 13,
                        fontStyle: 'italic',
                        color: 'var(--color-neutral-400)'
                      }}
                    >
                      {t('prompts.new')}
                    </span>
                  </div>

                  {/* Prompt salvati: clic = apri la card; cestino = elimina */}
                  {prompts.map((pr) => (
                    <div
                      key={pr.id}
                      className="cmd-row"
                      onClick={() => openPromptCard(pr)}
                      title={pr.label}
                      style={promptRowStyle}
                    >
                      <PencilSimple size={14} color="var(--color-neutral-400)" style={{ flex: '0 0 auto' }} />
                      <span
                        style={{
                          flex: '1 1 auto',
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: 13,
                          color: 'var(--color-neutral-300)'
                        }}
                      >
                        {pr.label}
                      </span>
                      <div
                        className="gear-btn"
                        title={t('prompts.delete')}
                        onClick={(e) => {
                          e.stopPropagation()
                          deletePrompt(pr.id)
                        }}
                        style={{
                          flex: '0 0 auto',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 18,
                          height: 18,
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--color-neutral-500)',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash size={13} />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {projects.map((p) => (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                {/* Riga progetto: clic = espandi/comprimi i comandi. L'intero item
                    è tinto con una versione tenue del colore progetto (--proj-tint). */}
                <div
                  className="project-row"
                  onClick={() => toggleProject(p.id)}
                  style={{
                    ['--proj-tint' as string]: p.color,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-2)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    minWidth: 0
                  } as React.CSSProperties}
                >
                  {collapsedProjects.has(p.id) ? (
                    <CaretRight size={12} color="var(--color-neutral-500)" style={{ flex: '0 0 auto' }} />
                  ) : (
                    <CaretDown size={12} color="var(--color-neutral-500)" style={{ flex: '0 0 auto' }} />
                  )}
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
                  <div
                    className="gear-btn"
                    title="Apri cartella progetto"
                    onClick={(e) => {
                      e.stopPropagation()
                      void window.dashai.openInFileManager(p.cwd)
                    }}
                    style={{
                      flex: '0 0 auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-neutral-500)',
                      cursor: 'pointer'
                    }}
                  >
                    <Folder size={16} />
                  </div>
                  <div
                    className="gear-btn"
                    title="Configura progetto"
                    onClick={(e) => {
                      e.stopPropagation()
                      editProject(p)
                    }}
                    style={{
                      flex: '0 0 auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-neutral-500)',
                      cursor: 'pointer'
                    }}
                  >
                    <Gear size={16} />
                  </div>
                </div>

                {/* Contenuto annidato del progetto (visibile se espanso):
                    i comandi/terminali. I prompt non stanno più qui. */}
                {!collapsedProjects.has(p.id) && (
                  <>
                    {/* Comandi rapidi / terminali */}
                    {p.commands.map((cmd) => (
                      <div
                        key={cmd.id}
                        className="cmd-row"
                        onClick={() => openCommandCard(p, cmd)}
                        title={cmd.command || cmd.label}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-3)',
                          padding: 'var(--space-1) var(--space-2)',
                          marginLeft: 'var(--space-5)',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          minWidth: 0
                        }}
                      >
                        <Icon name={cmd.icon} size={14} color="var(--color-neutral-400)" style={{ flex: '0 0 auto' }} />
                        <span
                          style={{
                            flex: '1 1 auto',
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 13,
                            color: 'var(--color-neutral-300)'
                          }}
                        >
                          {cmd.label}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Impostazioni (in basso) */}
          <div
            className="nav-item"
            onClick={() => setSettingsOpen(true)}
            style={{
              flex: '0 0 auto',
              marginTop: 'var(--space-3)',
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
        <div
          className="reopen-btn"
          title="Apri barra laterale"
          onClick={() => setCollapsed(false)}
          style={{
            position: 'absolute',
            top: `calc(var(--space-4) + ${macTrafficLightInset}px)`,
            left: 0,
            zIndex: 5,
            width: 16,
            height: 44,
            borderRadius: '0 var(--radius-md) var(--radius-md) 0',
            background: 'var(--color-surface)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            color: 'var(--color-neutral-400)',
            cursor: 'pointer'
          }}
        >
          <CaretDoubleRight size={11} />
        </div>
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
          padding: 0,
          // A sidebar chiusa: scosta le card oltre la linguetta (16px, che sborda
          // dal gutter di var(--space-4)) più un po' di respiro.
          paddingLeft: collapsed ? 'calc(16px - var(--space-4) + var(--space-3))' : 0
        }}
      >
        {canvasChildren}
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

/** Riga dell'elenco prompt, rientrata sotto la voce "Prompt". */
const promptRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-1) var(--space-2)',
  marginLeft: 'var(--space-5)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  minWidth: 0
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

const iconSquare: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-divider)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 16,
  lineHeight: 1,
  color: 'var(--color-neutral-400)',
  cursor: 'pointer',
  flex: '0 0 auto'
}
