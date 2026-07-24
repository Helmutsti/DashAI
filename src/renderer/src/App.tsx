import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { CaretDown, CaretRight, Folder, Gear, Plus } from '@phosphor-icons/react'
import Card from './Card'
import BrandMark from './BrandMark'
import ProjectEditorModal from './ProjectEditorModal'
import { Icon } from './icons'
import { newColId, type Column, type Row } from './types'
import {
  PROJECTS_VERSION,
  makeProject,
  seedProjects,
  type Project,
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
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [editingIsNew, setEditingIsNew] = useState(false)
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())

  // Su macOS con titleBarStyle 'hiddenInset' i semafori (chiudi/min/max) stanno
  // in alto a sinistra, sovrapposti al web content: riserviamo un'intera striscia
  // in alto (stesso sfondo della finestra, non della sidebar) così i pallini non
  // "sbattono" contro il pannello arrotondato. Su Windows/Linux resta 0.
  // In fullscreen nativo i semafori spariscono: niente da riservare.
  const [isFullScreen, setIsFullScreen] = useState(false)
  useEffect(() => {
    void window.dashiai.isFullScreen().then(setIsFullScreen)
    return window.dashiai.onFullScreenChange(setIsFullScreen)
  }, [])
  const macTrafficLightInset = window.dashiai.platform === 'darwin' && !isFullScreen ? 28 : 0

  const toggleProject = (id: string): void =>
    setCollapsedProjects((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const outerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<ResizeDrag>(null)
  // Card estratte: tolte dalla griglia (nessuno spazio) ma la loro pty resta
  // viva nella finestra separata. Qui conserviamo la colonna per il riaggancio.
  const detachedRef = useRef<Map<string, Column>>(new Map())

  // --- Persistenza progetti (projects.json) -------------------------------
  useEffect(() => {
    let alive = true
    void (async () => {
      const data = (await window.dashiai.projects.load()) as ProjectsFile | null
      if (!alive) return
      if (data && Array.isArray(data.projects) && data.projects.length > 0) {
        setProjects(data.projects)
      } else {
        const seed = seedProjects()
        setProjects(seed.projects)
        void window.dashiai.projects.save(seed)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const persistProjects = (next: Project[]): void => {
    setProjects(next)
    void window.dashiai.projects.save({ version: PROJECTS_VERSION, projects: next } satisfies ProjectsFile)
  }

  // Il "+" apre una BOZZA: nulla viene aggiunto finché non si salva.
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
      // Il colore progetto è il colore delle sue card: applicalo alle card aperte.
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
    // Se è una bozza non ancora salvata, si limita a scartarla.
    if (!editingIsNew) persistProjects(projects.filter((x) => x.id !== id))
    closeEditor()
  }

  // --- Apertura card da progetto / comando --------------------------------
  const openColumn = (partial: Omit<Column, 'id' | 'w'>): void => {
    const col: Column = { id: newColId(), w: 1, ...partial }
    setRows((s) =>
      s.length === 0
        ? [{ h: 1, cols: [col] }]
        : s.map((row, i) => (i === 0 ? { ...row, cols: [...row.cols, col] } : row))
    )
  }
  const openCommandCard = (p: Project, cmd: QuickCommand): void =>
    openColumn({
      projectId: p.id,
      title: cmd.label,
      color: p.color,
      shell: p.shell,
      cwd: p.cwd,
      startupCommand: cmd.command,
      closeOnExit: cmd.closeOnExit
    })

  const removeColById = (id: string): void => {
    window.dashiai.terminal.dispose(id)
    setRows((s) =>
      s
        .map((row) => ({ ...row, cols: row.cols.filter((c) => c.id !== id) }))
        .filter((row) => row.cols.length > 0)
    )
  }

  // --- Comprimi / Estrai / Riaggancia -------------------------------------
  const toggleCollapse = (id: string): void =>
    setRows((s) =>
      s.map((row) => ({
        ...row,
        cols: row.cols.map((c) => (c.id === id ? { ...c, collapsed: !c.collapsed } : c))
      }))
    )

  // Estrai: togli la card dalla griglia (occupa zero spazio), conservala per il
  // riaggancio e apri la finestra separata. La pty resta viva.
  const detachCard = (col: Column): void => {
    detachedRef.current.set(col.id, { ...col, detached: false })
    setRows((s) =>
      s
        .map((row) => ({ ...row, cols: row.cols.filter((c) => c.id !== col.id) }))
        .filter((row) => row.cols.length > 0)
    )
    window.dashiai.terminal.detachOpen(col.id, col.title || 'Terminale', col.color)
  }

  // Riaggancio (finestra estratta chiusa via X o "Riaggancia"): reinserisci la
  // card conservando il colore e riprendi l'output.
  useEffect(() => {
    const off = window.dashiai.terminal.onRedock((id) => {
      const col = detachedRef.current.get(id)
      if (col) {
        detachedRef.current.delete(id)
        setRows((s) =>
          s.length === 0
            ? [{ h: 1, cols: [col] }]
            : s.map((row, i) => (i === 0 ? { ...row, cols: [...row.cols, col] } : row))
        )
      }
      window.dashiai.terminal.attach(id)
    })
    return off
  }, [])

  // --- Resize (righe/colonne) via listener globali ------------------------
  const handleMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const sizes = d.startSizes.slice()
    const total = sizes.reduce((a, b) => a + b, 0)
    const idx = d.index

    const size = d.type === 'row' ? d.rect.height : d.rect.width
    const origin = d.type === 'row' ? e.clientY : e.clientX
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
  }, [])

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
    dragRef.current = { type: 'row', index, rect, start: e.clientY, startSizes: rows.map((r) => r.h) }
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
      start: e.clientX,
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
    if (col) window.dashiai.terminal.dispose(col.id) // termina la shell
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
    const rect = e.currentTarget.getBoundingClientRect()
    const side = e.clientX - rect.left < rect.width / 2 ? 'before' : 'after'
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
    // Se tutte le card della riga sono compresse, la riga si accorcia alle sole
    // intestazioni (riga di "card parcheggiate").
    const allCollapsed = row.cols.length > 0 && row.cols.every((c) => c.collapsed)
    // Normalizza i pesi SOLO per il render (non lo stato): dopo che una card
    // viene chiusa/estratta/spostata, la somma dei col.w residui può scendere
    // sotto 1. CSS flexbox non distribuisce lo spazio libero oltre alla somma
    // dei flex-grow quando questa è < 1, lasciando un vuoto invece di
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
        minHeight: 0
      }}
    >
      <div style={{ flex: allCollapsed ? '0 0 auto' : '1 1 0%', display: 'flex', minHeight: 0 }}>
        {/* grid: sempre a piena larghezza (flex:1) così le card compresse NON
            perdono la dimensione orizzontale */}
        <div style={{ flex: 1, display: 'flex', minWidth: 0, position: 'relative' }}>
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
                  isMenuOpen={openMenu === id}
                  isEditing={editing === id}
                  isDragged={!!dragCard && dragCard.r === r && dragCard.c === c}
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
                  onDetach={() => detachCard(col)}
                />
                {c < row.cols.length - 1 && (
                  <div
                    onPointerDown={(e) => startDragCol(r, c, e)}
                    style={{
                      flex: `0 0 ${HANDLE}px`,
                      alignSelf: 'stretch',
                      cursor: 'col-resize',
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
        height: 44,
        margin: 'var(--space-1) 0',
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
            style={{ flex: `0 0 ${HANDLE}px`, width: '100%', height: HANDLE, cursor: 'row-resize' }}
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
          }}
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
              «
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
            {projects.map((p) => (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                {/* Riga progetto: clic = espandi/comprimi i comandi */}
                <div
                  className="project-row"
                  onClick={() => toggleProject(p.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    minWidth: 0
                  }}
                >
                  {collapsedProjects.has(p.id) ? (
                    <CaretRight size={12} color="var(--color-neutral-500)" style={{ flex: '0 0 auto' }} />
                  ) : (
                    <CaretDown size={12} color="var(--color-neutral-500)" style={{ flex: '0 0 auto' }} />
                  )}
                  <Folder size={17} color={p.color} style={{ flex: '0 0 auto' }} />
                  <span
                    style={{
                      flex: '1 1 auto',
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 500,
                      fontSize: 15,
                      color: 'var(--color-text)'
                    }}
                  >
                    {p.label}
                  </span>
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
                      width: 26,
                      height: 26,
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-neutral-500)',
                      cursor: 'pointer'
                    }}
                  >
                    <Gear size={16} />
                  </div>
                </div>

                {/* Comandi rapidi (annidati) — visibili se il progetto è espanso */}
                {!collapsedProjects.has(p.id) &&
                  p.commands.map((cmd) => (
                  <div
                    key={cmd.id}
                    className="cmd-row"
                    onClick={() => openCommandCard(p, cmd)}
                    title={cmd.command || cmd.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      padding: 'var(--space-2) var(--space-3)',
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
              </div>
            ))}
          </div>

          {/* Impostazioni (in basso) */}
          <div
            className="nav-item"
            style={{
              flex: '0 0 auto',
              marginTop: 'var(--space-3)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              fontSize: 14,
              color: 'var(--color-neutral-300)',
              cursor: 'pointer'
            }}
          >
            <Gear size={17} style={{ flex: '0 0 auto' }} />
            <span>Impostazioni</span>
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
            left: 'var(--space-4)',
            zIndex: 5,
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-surface)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            lineHeight: 1,
            color: 'var(--color-neutral-300)',
            cursor: 'pointer'
          }}
        >
          »
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
          flexDirection: 'column',
          padding: 0,
          paddingLeft: collapsed ? 'calc(36px + var(--space-4) + var(--space-3))' : 0
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
    </div>
  )
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
