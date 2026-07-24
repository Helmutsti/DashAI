import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { disposeAllPty, registerPtyIpc } from './pty'
import { registerProjectsIpc } from './projects-store'

let mainWindow: BrowserWindow | null = null
/** Finestre delle card estratte, per id terminale. */
const detachedWindows = new Map<string, BrowserWindow>()

const PRELOAD = join(__dirname, '../preload/index.mjs')
const INDEX_HTML = join(__dirname, '../renderer/index.html')

/** Carica il renderer (dev: dev server; prod: file), con querystring opzionale. */
function loadRenderer(win: BrowserWindow, search = ''): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}${search}`)
  } else {
    void win.loadFile(INDEX_HTML, { search })
  }
}

/** Selettore cartella/file nativo. Ritorna il percorso scelto o null se annullato. */
function registerDialogIpc(): void {
  ipcMain.handle('dialog:pickDirectory', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const res = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  // Sceglie l'eseguibile di una shell custom per un terminale del progetto.
  ipcMain.handle('dialog:pickFile', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const res = win
      ? await dialog.showOpenDialog(win, { properties: ['openFile'] })
      : await dialog.showOpenDialog({ properties: ['openFile'] })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })
}

/** Apre la cartella del progetto nel file manager di sistema (Finder/Esplora risorse). */
function registerShellIpc(): void {
  ipcMain.handle('shell:open-path', async (_e, targetPath: string) => {
    const target = targetPath && targetPath.trim() ? targetPath : app.getPath('home')
    const err = await shell.openPath(target)
    return err === ''
  })
}

/** Apre una finestra separata che si aggancia alla pty `id` (card estratta). */
function openDetached(id: string, title: string, color: string): void {
  const existing = detachedWindows.get(id)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return
  }
  const win = new BrowserWindow({
    width: 720,
    height: 520,
    minWidth: 360,
    minHeight: 240,
    show: false,
    title: `${title} — DashAI`,
    icon: join(__dirname, '../../resources/icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#191919',
    webPreferences: {
      preload: PRELOAD,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.on('ready-to-show', () => win.show())
  const params = new URLSearchParams({ term: id, title, color: color || '' }).toString()
  loadRenderer(win, `?${params}`)

  win.on('closed', () => {
    detachedWindows.delete(id)
    // Riaggancio: avvisa la finestra principale di riprendere l'output.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('dashiai:redock', { id })
    }
  })
  detachedWindows.set(id, win)
}

function registerWindowIpc(): void {
  ipcMain.handle('window:is-fullscreen', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    return win ? win.isFullScreen() : false
  })
  ipcMain.handle('terminal:detach-open', (_e, p: { id: string; title: string; color: string }) => {
    openDetached(p.id, p.title, p.color)
    return true
  })
  ipcMain.handle('terminal:detach-close', (_e, { id }: { id: string }) => {
    const w = detachedWindows.get(id)
    if (w && !w.isDestroyed()) w.close()
    return true
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    show: false,
    title: 'DashAI',
    icon: join(__dirname, '../../resources/icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#191919',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: PRELOAD,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow = win

  win.on('ready-to-show', () => win.show())
  // In fullscreen nativo macOS i semafori spariscono: il renderer usa questo
  // evento per azzerare lo spazio riservato in alto (vedi macTrafficLightInset).
  win.on('enter-full-screen', () => win.webContents.send('dashiai:fullscreen', true))
  win.on('leave-full-screen', () => win.webContents.send('dashiai:fullscreen', false))
  win.on('closed', () => {
    mainWindow = null
    // Chiudi eventuali finestre estratte rimaste aperte.
    for (const w of detachedWindows.values()) if (!w.isDestroyed()) w.close()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  loadRenderer(win)
}

app.whenReady().then(() => {
  registerPtyIpc()
  registerDialogIpc()
  registerProjectsIpc()
  registerWindowIpc()
  registerShellIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => disposeAllPty())
