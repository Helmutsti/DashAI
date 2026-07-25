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

  'settings.title': 'Impostazioni',
  'settings.close': 'Chiudi',
  'settings.done': 'Fatto',

  'settings.section.appearance': 'Aspetto',
  'settings.section.terminal': 'Terminale',
  'settings.section.data': 'Progetti e dati',

  'settings.language': 'Lingua',
  'settings.theme': 'Tema',
  'settings.theme.dark': 'Scuro',
  'settings.theme.light': 'Chiaro',
  'settings.theme.system': 'Sistema',

  'settings.uiScale': 'Dimensione interfaccia',
  'settings.terminalFontSize': 'Dimensione font terminali',

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

  'settings.title': 'Settings',
  'settings.close': 'Close',
  'settings.done': 'Done',

  'settings.section.appearance': 'Appearance',
  'settings.section.terminal': 'Terminal',
  'settings.section.data': 'Projects & data',

  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'settings.theme.dark': 'Dark',
  'settings.theme.light': 'Light',
  'settings.theme.system': 'System',

  'settings.uiScale': 'Interface size',
  'settings.terminalFontSize': 'Terminal font size',

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
