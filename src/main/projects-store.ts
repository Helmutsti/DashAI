import { readFile, writeFile } from 'node:fs/promises'
import { accessSync, constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, ipcMain } from 'electron'

/**
 * Cartella dove salvare la config (projects.json).
 *
 * In modalità **portable** il file sta ACCANTO all'eseguibile, così l'app è
 * autoportante (basta spostare la cartella/exe e la config lo segue):
 *  - portable single-exe di electron-builder → `PORTABLE_EXECUTABLE_DIR`;
 *  - cartella win-unpacked → directory dell'eseguibile.
 * Fallback a `userData` (%APPDATA%) in sviluppo o se la cartella è di sola lettura.
 */
let cachedDir: string | null = null
function configDir(): string {
  if (cachedDir) return cachedDir
  const candidates: string[] = []
  if (process.env.PORTABLE_EXECUTABLE_DIR) candidates.push(process.env.PORTABLE_EXECUTABLE_DIR)
  if (app.isPackaged) candidates.push(dirname(app.getPath('exe')))
  candidates.push(app.getPath('userData'))
  for (const dir of candidates) {
    try {
      accessSync(dir, constants.W_OK)
      cachedDir = dir
      return dir
    } catch {
      /* non scrivibile: prova il candidato successivo */
    }
  }
  cachedDir = app.getPath('userData')
  return cachedDir
}

/** Percorso del file dei progetti (accanto all'exe in portable, altrimenti userData). */
function projectsFile(): string {
  return join(configDir(), 'projects.json')
}

/** Registra gli handler IPC per leggere/scrivere projects.json. */
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
}
