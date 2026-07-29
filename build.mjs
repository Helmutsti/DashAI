/**
 * Build di produzione: compila e raccoglie gli artefatti sotto `output/`.
 *
 *   npm run build                 → installer per la piattaforma corrente
 *   npm run build -- --debug      → gli argomenti extra passano a `tauri build`
 *
 * Perche' serve un wrapper e non basta uno script npm: Cargo impone il layout
 * `<target-dir>/release/bundle/<formato>/`, quindi il bundler non puo' scrivere
 * direttamente in `output/platform/win`. Gli intermedi finiscono in
 * `output/build` (via BE/.cargo/config.toml) e qui, a compilazione finita,
 * copiamo i soli installer nella cartella della piattaforma:
 *
 *   output/dist            → UI compilata da Vite (frontendDist)
 *   output/build           → intermedi Rust (pesante, rigenerabile)
 *   output/platform/win    → .exe / .msi
 *   output/platform/mac    → .dmg
 *   output/platform/linux  → .AppImage / .deb / .rpm
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const buildDir = join(root, 'output', 'build')

/** Cartella di destinazione per la piattaforma su cui stiamo compilando. */
const PLATFORM_DIRS = { win32: 'win', darwin: 'mac' }
const platformDir = PLATFORM_DIRS[process.platform] ?? 'linux'

/** Estensioni che consideriamo "prodotto finale" da consegnare. */
const INSTALLER_EXTS = new Set(['.exe', '.msi', '.dmg', '.appimage', '.deb', '.rpm'])

/** Elenca ricorsivamente i file dentro le cartelle `bundle/` di Cargo. */
function findInstallers(dir) {
  let found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      found = found.concat(findInstallers(abs))
    } else if (INSTALLER_EXTS.has(extname(entry.name).toLowerCase())) {
      found.push(abs)
    }
  }
  return found
}

/** Le cartelle `bundle/` sotto output/build (una per profilo/target). */
function bundleDirs(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const abs = join(dir, entry.name)
    // `deps`, `build`, `.fingerprint` contengono centinaia di migliaia di file
    // e nessun installer: scenderci dentro costerebbe secondi per nulla.
    if (['deps', 'build', 'incremental', '.fingerprint'].includes(entry.name)) continue
    if (entry.name === 'bundle') acc.push(abs)
    else bundleDirs(abs, acc)
  }
  return acc
}

// La CLI di Tauri viene lanciata col node corrente sul suo entry point locale,
// non via `npx`: niente shell di mezzo, quindi nessuna concatenazione degli
// argomenti (che Node segnala come deprecata) e nessuna differenza win/unix.
const extra = process.argv.slice(2)
const cli = join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
const tauri = spawnSync(process.execPath, [cli, 'build', ...extra], {
  cwd: root,
  stdio: 'inherit'
})

if (tauri.status !== 0) {
  process.exit(tauri.status ?? 1)
}

// La raccolta e' best-effort: se il bundler non ha prodotto nulla (es. build
// con --no-bundle) non e' un errore, si segnala e basta.
let dirs = []
try {
  dirs = bundleDirs(buildDir)
} catch {
  console.log(`\nnessuna cartella bundle sotto ${buildDir}`)
}

const installers = dirs.flatMap((d) => findInstallers(d))
if (installers.length === 0) {
  console.log('\nnessun installer da raccogliere')
  process.exit(0)
}

const dest = join(root, 'output', 'platform', platformDir)
mkdirSync(dest, { recursive: true })

console.log(`\nartefatti in output/platform/${platformDir}/`)
for (const file of installers) {
  const target = join(dest, file.split(/[\\/]/).pop())
  copyFileSync(file, target)
  const mb = (statSync(target).size / 1024 / 1024).toFixed(2)
  console.log(`  ${target.slice(root.length + 1)}  (${mb} MB)`)
}
