import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'

/** Percorso del file dei progetti (persistente tra gli aggiornamenti). */
function projectsFile(): string {
  return join(app.getPath('userData'), 'projects.json')
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
