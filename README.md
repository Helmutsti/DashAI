# DashAI â€” app

App desktop **Tauri + React** (cartella autonoma e indipendente dal resto del
repo `DashAI`). Board di **card ridimensionabili e trascinabili**, tema neutro
greyscale scuro, layout dal design **"Layout Grid App"**.

> **Ogni card Ã¨ un terminale vero, stile VSCode**: `xterm.js` nel renderer +
> `portable-pty` (shell reale) nel backend Rust, collegati via comandi/eventi Tauri. La shell Ã¨ selezionabile
> per progetto ed Ã¨ **adattata al sistema**: Windows PowerShell/pwsh/cmd/Git Bash
> su Windows, zsh/bash/fish su macOS e Linux (default = shell predefinita di sistema).

## Requisiti

- Node.js 20+ (testato su 22)

## Comandi

```bash
npm install       # dipendenze (dentro questa cartella)
npm run dev       # sviluppo con hot-reload (tauri dev)
npm run build     # installer di produzione in output/platform/<os>/
npm run build:UI  # solo la UI compilata da Vite, in output/dist/
```

### Il "server" in `npm run dev`

`npm run dev` avvia un **dev server di Vite** (di norma su `http://localhost:5173`,
oppure la porta libera successiva). **Non Ã¨ un server dell'app**: serve solo la UI
React del processo *renderer* con hot-reload, e la finestra Tauri la carica
internamente da quell'indirizzo locale. In produzione (`npm run build`) non c'Ã¨
alcun server: la webview di sistema carica i file statici da `output/dist/`.

### Build degli eseguibili (tauri bundler)

```bash
npm run build   # dmg (macOS) / nsis (Windows) / appimage (Linux) in base
                # alla piattaforma di build â†’ output/platform/<os>/
```

> Ogni target si compila solo sulla piattaforma nativa corrispondente (limite
> dei bundler di sistema, non di Tauri).

## Struttura

```
BE/                    backend Rust + configurazione Tauri
  src/
    pty.rs             gestore shell portable-pty + comandi Tauri
    stores.rs          persistenza progetti/impostazioni (JSON su disco)
    config_dir.rs      dove vivono projects.json / settings.json
    windows.rs         rilevamento fullscreen (evento dashai:fullscreen)
    os_integration.rs  dialog nativi + apertura file manager
  tauri.conf.json
UI/                    renderer React (nessun annidamento: i file stanno qui)
  index.html
  main.tsx             entry React + import font/CSS/xterm
  dashai-bridge.ts     bridge renderer<->backend (window.dashai.terminal)
  App.tsx              stato + canvas righe/schede + resize + drag&drop
  Card.tsx             card (header/menu/rename/drag) + terminale
  TerminalView.tsx     xterm.js + FitAddon collegato alla pty
  types.ts             tipi Row/Column (id stabile) + palette
  styles/              tokens.css (design token) + app.css (reset/hover)
build.mjs              `npm run build`: compila e raccoglie gli installer
output/                tutto il prodotto della compilazione (ignorato da git)
  dist/                UI compilata da Vite = frontendDist di Tauri
  build/               intermedi Rust (target-dir, vedi BE/.cargo/config.toml)
  platform/win|mac/    installer finali per piattaforma
```

## Terminali (architettura)

- `TerminalView` crea un `xterm.Terminal` + `FitAddon` e lo lega alla pty
  tramite `window.dashai.terminal` (create/input/resize/dispose + onData/onExit).
- Il backend Rust (`pty.rs`) tiene una sessione `portable-pty` per ogni
  `Column.id`, inoltra l'I/O via eventi Tauri e la ridirige verso la finestra
  correntemente "attached" (usato da detach/redock delle card).
- Ogni card ha un `id` stabile: la shell **sopravvive al riordino nella stessa
  riga**. Spostare una card in un'altra riga la rimonta e la shell riparte
  (limite di reconciliation di React; migliorabile con un layer a portali).

## Comportamento (dal design handoff)

- **Parte vuota** (nessuna riga/scheda).
- Sidebar collassabile (`Â«` / `Â»`); voce **Impostazioni** aggiunge una scheda
  alla prima riga; il **pallino** cicla il colore della prossima scheda.
- Ogni scheda ha menu **Rinomina / Chiudi / Nuova scheda**; l'header Ã¨ la
  maniglia di trascinamento.
- **Resize** di righe e colonne trascinando i separatori da 6px.
- **Drag&drop** schede: riordino, spostamento tra righe, e drop-zone per creare
  nuove righe (attive solo durante il trascinamento).

## Scostamenti consapevoli dal prototipo

- Chiudere l'**ultima** scheda di una riga elimina la riga (comportamento
  descritto nel README del handoff; il prototipo `.dc.html` invece la
  bloccava â€” abbiamo seguito la descrizione, piÃ¹ sensata come UX).
- Hover resi con classi CSS (`app.css`) invece dell'attributo `style-hover`
  del runtime proprietario, che non esiste fuori da quel design system.
