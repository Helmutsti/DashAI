import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { configDir } from './config-dir'

/** Percorso del file dei progetti (accanto all'exe in portable, altrimenti userData). */
function projectsFile(): string {
  return join(configDir(), 'projects.json')
}

/** Registra gli handler IPC per leggere/scrivere/esportare/importare projects.json. */
export function registerProjectsIpc(): void {
  ipcMain.handle('projects:load', async () => {
    try {
      const raw = await readFile(projectsFile(), 'utf8')
      return JSON.parse(raw)
    } catch {
      // File assente o illeggibile: il renderer inizializza col seed.
      return null
    }
  })

  ipcMain.handle('projects:save', async (_e, data: unknown) => {
    await writeFile(projectsFile(), JSON.stringify(data, null, 2), 'utf8')
    return true
  })

  ipcMain.handle('projects:path', () => projectsFile())

  // Esporta: chiede dove salvare e scrive il DB (progetti + prompt + settings).
  ipcMain.handle('projects:export', async (e, data: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const opts = {
      title: 'Esporta dati',
      defaultPath: 'db.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return false
    await writeFile(res.filePath, JSON.stringify(data, null, 2), 'utf8')
    return true
  })

  // Importa: chiede un file e ritorna il contenuto parseato (o null se annullato/invalido).
  ipcMain.handle('projects:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const opts = {
      title: 'Importa dati',
      properties: ['openFile' as const],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || res.filePaths.length === 0) return null // annullato
    try {
      const raw = await readFile(res.filePaths[0], 'utf8')
      return JSON.parse(raw)
    } catch {
      return false // file illeggibile o JSON invalido
    }
  })
}
