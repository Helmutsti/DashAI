import type { AgentSession, CreateOpts } from './dashai-bridge'
import { makeProject, PROJECTS_VERSION, type ProjectsFile } from './projects'

/**
 * Bridge di scorta per l'anteprima in un browser qualsiasi, senza il backend
 * Tauri: tutto vive in memoria (nessun filesystem, nessuna shell reale).
 * Serve solo a provare la UI — in particolare il riordino dei progetti —
 * senza dover compilare/avviare l'app nativa.
 */
function seedFile(): ProjectsFile {
  return {
    version: PROJECTS_VERSION,
    projects: [
      makeProject({ label: 'Sito Vetrina', color: '#1069da', order: 0 }),
      makeProject({ label: 'App Mobile', color: '#009e77', order: 1 }),
      makeProject({ label: 'Backend API', color: '#e66700', order: 2 }),
      makeProject({ label: 'Automazioni', color: '#9b75f9', order: 3 }),
      makeProject({ label: 'Sandbox', color: '#a738a2', order: 4 })
    ],
    prompts: []
  }
}

let projectsFile: ProjectsFile = seedFile()
let settingsFile: unknown = null

export function createBrowserBridge() {
  return {
    version: '0.0.0-browser-preview',
    platform: 'win32' as const,
    terminal: {
      create: (_opts: CreateOpts): Promise<boolean> => Promise.resolve(false),
      input: (): void => {},
      resize: (): void => {},
      dispose: (): void => {},
      onData: (): (() => void) => () => {},
      onExit: (): (() => void) => () => {}
    },
    projects: {
      load: (): Promise<unknown> => Promise.resolve(projectsFile),
      save: (data: unknown): Promise<boolean> => {
        projectsFile = data as ProjectsFile
        return Promise.resolve(true)
      },
      path: (): Promise<string> => Promise.resolve('(anteprima browser, nessun file su disco)'),
      export: (): Promise<boolean> => Promise.resolve(false),
      import: (): Promise<unknown> => Promise.resolve(null)
    },
    settings: {
      load: (): Promise<unknown> => Promise.resolve(settingsFile),
      save: (data: unknown): Promise<boolean> => {
        settingsFile = data
        return Promise.resolve(true)
      },
      path: (): Promise<string> => Promise.resolve('(anteprima browser, nessun file su disco)')
    },
    pickDirectory: (): Promise<string | null> => Promise.resolve(null),
    pickFile: (): Promise<string | null> => Promise.resolve(null),
    openInFileManager: (): Promise<boolean> => Promise.resolve(false),
    openUrl: (url: string): Promise<boolean> => {
      window.open(url, '_blank')
      return Promise.resolve(true)
    },
    isFullScreen: (): Promise<boolean> => Promise.resolve(false),
    // Anteprima: qualche sessione finta per vedere l'elenco "Riprendi".
    agentSessions: (_cwd: string): Promise<AgentSession[]> =>
      Promise.resolve([
        { agent: 'claude', id: 'demo-1', title: 'Rifai il login con OAuth', updated: Date.now() - 3600e3, messages: 38 },
        { agent: 'codex', id: 'demo-2', title: 'Scrivi i test per il carrello', updated: Date.now() - 5 * 3600e3, messages: null },
        { agent: 'claude', id: 'demo-3', title: 'Sistema il layout della pagina prodotto su mobile', updated: Date.now() - 30 * 3600e3, messages: 54 }
      ]),
    onFullScreenChange: (): (() => void) => () => {},
    isDirectory: (): Promise<boolean> => Promise.resolve(false),
    onFolderDrag: (): (() => void) => () => {},
    win: {
      minimize: (): Promise<void> => Promise.resolve(),
      toggleMaximize: (): Promise<void> => Promise.resolve(),
      close: (): Promise<void> => Promise.resolve(),
      isMaximized: (): Promise<boolean> => Promise.resolve(false),
      onResized: (): (() => void) => () => {}
    }
  }
}
