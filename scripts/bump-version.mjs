/**
 * Avanza la versione di DashAI tenendo allineati i cinque file che la
 * contengono. Sono separati e nessuno dei due ecosistemi (npm / cargo) vede
 * l'altro: se divergono, l'app mostra un numero e l'installer ne porta un
 * altro. Qui si scrivono tutti insieme o non se ne scrive nessuno.
 *
 *   node scripts/bump-version.mjs            → patch (0.5.0 → 0.5.1)
 *   node scripts/bump-version.mjs minor      → 0.5.0 → 0.6.0
 *   node scripts/bump-version.mjs major      → 0.5.0 → 1.0.0
 *   node scripts/bump-version.mjs 1.2.3      → versione esplicita
 *
 * Le sostituzioni sono mirate (regex ancorate) e non riscrivono i JSON da
 * capo: un JSON.stringify normalizzerebbe la formattazione dell'intero
 * package-lock.json, seppellendo la riga che conta sotto migliaia di righe di
 * rumore.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Legge la versione corrente, che è quella di package.json. */
function currentVersion() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version ?? '')) {
    throw new Error(`versione non valida in package.json: ${pkg.version}`)
  }
  return pkg.version
}

/** Risolve l'argomento in una versione concreta a partire da quella corrente. */
function resolveTarget(arg, from) {
  if (!arg || arg === 'patch' || arg === 'minor' || arg === 'major') {
    const [major, minor, patch] = from.split('.').map(Number)
    if (arg === 'major') return `${major + 1}.0.0`
    if (arg === 'minor') return `${major}.${minor + 1}.0`
    return `${major}.${minor}.${patch + 1}`
  }
  if (!/^\d+\.\d+\.\d+$/.test(arg)) {
    throw new Error(`argomento non valido: ${arg} (usa patch|minor|major oppure X.Y.Z)`)
  }
  return arg
}

/**
 * Applica una sostituzione a un file e pretende che avvenga: un file che non
 * combacia piu (rinominato, riformattato) deve fermare il bump, non passare
 * inosservato lasciando quel file indietro.
 */
function patch(relPath, pattern, replacement) {
  const abs = join(root, relPath)
  const before = readFileSync(abs, 'utf8')
  const after = before.replace(pattern, replacement)
  if (after === before) {
    throw new Error(`nessuna sostituzione in ${relPath}: il formato del file e cambiato?`)
  }
  writeFileSync(abs, after)
}

const from = currentVersion()
const to = resolveTarget(process.argv[2], from)

if (to === from) {
  console.log(`versione gia' a ${to}, niente da fare`)
  process.exit(0)
}

// package.json / tauri.conf.json: la prima "version" e sempre quella di
// primo livello, perche' precede ogni oggetto annidato.
patch('package.json', /^(\s*"version":\s*")[^"]*(")/m, `$1${to}$2`)
patch('src-tauri/tauri.conf.json', /^(\s*"version":\s*")[^"]*(")/m, `$1${to}$2`)

// package-lock.json porta la versione due volte: in testa e dentro
// packages[""]. Le ancoriamo all'indentazione per non toccare le dipendenze,
// che stanno piu' in profondita'.
patch('package-lock.json', /^(  "version": ")[^"]*(")/m, `$1${to}$2`)
patch('package-lock.json', /^(      "version": ")[^"]*(")/m, `$1${to}$2`)

// Cargo.toml: la prima chiave `version` e quella di [package]; quelle delle
// dipendenze arrivano dopo.
patch('src-tauri/Cargo.toml', /^version = "[^"]*"/m, `version = "${to}"`)

// Cargo.lock: solo la voce del pacchetto dashai.
patch(
  'src-tauri/Cargo.lock',
  /(name = "dashai"\nversion = ")[^"]*(")/,
  `$1${to}$2`
)

console.log(`versione ${from} -> ${to}`)
console.log(`tag da creare quando vuoi pubblicare: v${to}`)
