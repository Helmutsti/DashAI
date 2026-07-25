import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { configDir } from './config-dir'

/** Percorso del file impostazioni (accanto all'exe in portable, altrimenti userData). */
function settingsFile(): string {
  return join(configDir(), 'settings.json')
}

/** Registra gli handler IPC per leggere/scrivere settings.json. */
export function registerSettingsIpc(): void {
  ipcMain.handle('settings:load', async () => {
    try {
      const raw = await readFile(settingsFile(), 'utf8')
      return JSON.parse(raw)
    } catch {
      // File assente o illeggibile: il renderer usa i valori di default.
      return null
    }
  })

  ipcMain.handle('settings:save', async (_e, data: unknown) => {
    await writeFile(settingsFile(), JSON.stringify(data, null, 2), 'utf8')
    return true
  })

  ipcMain.handle('settings:path', () => settingsFile())
}
