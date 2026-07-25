import { accessSync, constants } from 'node:fs'
import { dirname } from 'node:path'
import { app } from 'electron'

/**
 * Cartella dove salvare i file di config (projects.json, settings.json).
 *
 * In modalita **portable** i file stanno ACCANTO all'eseguibile, cosi l'app e
 * autoportante (basta spostare la cartella/exe e la config lo segue):
 *  - portable single-exe di electron-builder -> `PORTABLE_EXECUTABLE_DIR`;
 *  - cartella win-unpacked -> directory dell'eseguibile.
 * Fallback a `userData` (%APPDATA%) in sviluppo o se la cartella e di sola lettura.
 */
let cachedDir: string | null = null

export function configDir(): string {
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
