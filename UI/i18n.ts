/**
 * i18n minimale, senza librerie: due dizionari (it/en) + funzione `t`.
 * Le chiavi mancanti ricadono sull'italiano e, in ultima istanza, sulla chiave.
 *
 * Per ora sono tradotte le stringhe della finestra Impostazioni e la voce di
 * menu "Impostazioni"; il resto dell'app verra estratto in modo incrementale.
 */
export type Language = 'it' | 'en'

type Dict = Record<string, string>

const it: Dict = {
  'nav.settings': 'Impostazioni',

  'sidebar.projects': 'Progetti',
  'sidebar.collapse': 'Chiudi la barra laterale',
  'sidebar.expand': 'Apri la barra laterale',
  'sidebar.activeChats': 'Chat attive',
  'sidebar.newChat': 'Nuova chat',
  'sidebar.noProject': 'Senza progetto',
  'empty.title': 'Nessuna chat da guardare',
  'empty.hint': 'Scegli una chat attiva a sinistra, oppure lancia un agente da un progetto.',
  'sidebar.newProject': 'Nuovo progetto',
  'sidebar.reorder': 'Riordina progetti',
  'sidebar.reorderDone': 'Fine riordino',
  'project.openFolder': 'Apri cartella progetto',
  'project.configure': 'Configura progetto',
  'project.menu.commands': 'Comandi',
  'project.menu.empty': 'Nessun comando: aggiungilo dall’ingranaggio.',

  'prompts.title': 'Prompt',
  'prompts.new': 'nuovo prompt',
  'prompts.newCard': 'Nuovo prompt',
  'prompts.delete': 'Elimina prompt',
  'prompts.copied': 'Copiato',

  'settings.title': 'Impostazioni',
  'settings.close': 'Chiudi',
  'settings.done': 'Fatto',

  'settings.section.appearance': 'Aspetto',
  'settings.section.agents': 'Agenti',
  'settings.agents.hint': 'Quali agenti compaiono nei menu «Nuova chat», per tutti i progetti, e con quale comando partono.',
  'settings.transparency': 'Trasparenza della finestra',
  'settings.transparency.hint': 'Lascia intravedere il desktop dietro la barra laterale. Vale dal prossimo avvio se la finestra resta scura.',
  'settings.section.data': 'Progetti e dati',
  'settings.section.shortcuts': 'Scorciatoie',

  'shortcut.next': 'Scheda successiva',
  'shortcut.prev': 'Scheda precedente',
  'shortcut.jump': 'Vai alla scheda N',
  'shortcut.move': 'Sposta il fuoco sulla griglia',
  'shortcut.close': 'Chiudi la scheda attiva',
  'shortcut.sidebar': 'Mostra/nascondi la barra laterale',
  'settings.shortcuts.hint':
    'La scheda attiva è quella col bordo evidenziato. Ctrl+W non è usato: nella shell serve a cancellare la parola precedente.',
  'settings.version': 'Versione',

  'settings.language': 'Lingua',
  'settings.theme': 'Tema',
  'settings.theme.dark': 'Scuro',
  'settings.theme.light': 'Chiaro',
  'settings.theme.system': 'Sistema',
  'settings.grid': 'Griglia',
  'settings.grid.rows': 'Righe',
  'settings.grid.columns': 'Colonne',
  'settings.grid.hint':
    'Righe: la griglia impila righe e ogni riga contiene card affiancate. Colonne: la griglia affianca colonne e ogni colonna contiene card impilate.',
  'settings.layout.reset': 'Ripristina layout',
  'settings.layout.reset.hint':
    'Riporta tracce e card a dimensioni uguali, secondo l’orientamento scelto qui sopra.',

  'settings.export': 'Esporta dati (db.json)',
  'settings.import': 'Importa dati (db.json)',
  'settings.import.confirm':
    "L'importazione sostituira progetti, prompt e impostazioni attuali. Continuare?",
  'settings.export.ok': 'Dati esportati in db.json.',
  'settings.import.ok': 'Dati importati.',
  'settings.import.invalid': 'File non valido: nessun dato importato.',
  'settings.data.hint':
    'Esporta/importa un unico file db.json con progetti, prompt e impostazioni.'
}

const en: Dict = {
  'nav.settings': 'Settings',

  'sidebar.projects': 'Projects',
  'sidebar.collapse': 'Hide the sidebar',
  'sidebar.expand': 'Show the sidebar',
  'sidebar.activeChats': 'Active chats',
  'sidebar.newChat': 'New chat',
  'sidebar.noProject': 'No project',
  'empty.title': 'No chat to show',
  'empty.hint': 'Pick an active chat on the left, or launch an agent from a project.',
  'sidebar.newProject': 'New project',
  'sidebar.reorder': 'Reorder projects',
  'sidebar.reorderDone': 'Done reordering',
  'project.openFolder': 'Open project folder',
  'project.configure': 'Project settings',
  'project.menu.commands': 'Commands',
  'project.menu.empty': 'No commands yet: add one from the gear.',

  'prompts.title': 'Prompts',
  'prompts.new': 'new prompt',
  'prompts.newCard': 'New prompt',
  'prompts.delete': 'Delete prompt',
  'prompts.copied': 'Copied',

  'settings.title': 'Settings',
  'settings.close': 'Close',
  'settings.done': 'Done',

  'settings.section.appearance': 'Appearance',
  'settings.section.agents': 'Agents',
  'settings.agents.hint': 'Which agents appear in the "New chat" menus, for every project, and the command that starts them.',
  'settings.transparency': 'Window transparency',
  'settings.transparency.hint': 'Lets the desktop show through behind the sidebar. Applies on next launch if the window stays dark.',
  'settings.section.data': 'Projects & data',
  'settings.section.shortcuts': 'Shortcuts',

  'shortcut.next': 'Next card',
  'shortcut.prev': 'Previous card',
  'shortcut.jump': 'Go to card N',
  'shortcut.move': 'Move focus across the grid',
  'shortcut.close': 'Close the active card',
  'shortcut.sidebar': 'Show/hide the sidebar',
  'settings.shortcuts.hint':
    'The active card is the one with the highlighted border. Ctrl+W is left alone: in the shell it deletes the previous word.',
  'settings.version': 'Version',

  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'settings.theme.dark': 'Dark',
  'settings.theme.light': 'Light',
  'settings.theme.system': 'System',
  'settings.grid': 'Grid',
  'settings.grid.rows': 'Rows',
  'settings.grid.columns': 'Columns',
  'settings.grid.hint':
    'Rows: the grid stacks rows and each row holds cards side by side. Columns: the grid places columns side by side and each column stacks its cards.',
  'settings.layout.reset': 'Reset layout',
  'settings.layout.reset.hint':
    'Gives every track and card the same size, following the orientation chosen above.',

  'settings.export': 'Export data (db.json)',
  'settings.import': 'Import data (db.json)',
  'settings.import.confirm':
    'Importing will replace current projects, prompts and settings. Continue?',
  'settings.export.ok': 'Data exported to db.json.',
  'settings.import.ok': 'Data imported.',
  'settings.import.invalid': 'Invalid file: nothing imported.',
  'settings.data.hint':
    'Export/import a single db.json file with projects, prompts and settings.'
}

const DICTS: Record<Language, Dict> = { it, en }

/** Ritorna la traduzione per `key` nella lingua `lang` (fallback: it -> key). */
export function translate(lang: Language, key: string): string {
  return DICTS[lang]?.[key] ?? it[key] ?? key
}
