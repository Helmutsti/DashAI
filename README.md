# DashAI â€” app

App desktop **Electron + React** (cartella autonoma e indipendente dal resto del
repo `DashAI`). Board di **card ridimensionabili e trascinabili**, tema neutro
greyscale scuro, layout dal design **"Layout Grid App"**.

> **Ogni card Ã¨ un terminale vero, stile VSCode**: `xterm.js` nel renderer +
> `node-pty` (shell reale) nel main, collegati via IPC. La shell Ã¨ selezionabile
> per progetto ed Ã¨ **adattata al sistema**: Windows PowerShell/pwsh/cmd/Git Bash
> su Windows, zsh/bash/fish su macOS e Linux (default = shell predefinita di sistema).

## Requisiti

- Node.js 20+ (testato su 22)

## Comandi

```bash
npm install       # dipendenze (dentro questa cartella)
npm run dev       # sviluppo con hot-reload (electron-vite dev)
npm run build     # bundle di produzione in out/
npm run preview   # avvia il bundle di produzione
npm run typecheck # controllo tipi TypeScript
```

### Il "server" in `npm run dev`

`npm run dev` avvia un **dev server di Vite** (di norma su `http://localhost:5173`,
oppure la porta libera successiva). **Non Ã¨ un server dell'app**: serve solo la UI
React del processo *renderer* con hot-reload, e la finestra Electron la carica
internamente da quell'indirizzo locale. In produzione (`npm run build`) non c'Ã¨
alcun server: Electron carica i file statici da `out/renderer/`.

### Build degli eseguibili (electron-builder)

```bash
npm run dist:win    # installer + eseguibile portabile Windows  â†’ dist/
npm run dist:mac    # .dmg + .zip macOS (arm64 + x64)           â†’ dist/
npm run dist:linux  # AppImage Linux                            â†’ dist/
```

> Il target **macOS si compila solo su un Mac** (limite Apple); Windows solo su
> Windows. Per produrre entrambi da un unico punto c'Ã¨ il workflow GitHub Actions
> in `.github/workflows/build.yml` (build su runner nativi ad ogni tag `v*`).

## Struttura

```
src/
  main/
    index.ts          processo principale Electron (finestra + lifecycle)
    pty.ts            gestore shell node-pty + handler IPC
  preload/index.ts    bridge sicuro renderer<->main (window.dashai.terminal)
  renderer/
    index.html
    src/
      main.tsx        entry React + import font/CSS/xterm
      App.tsx         stato + canvas righe/schede + resize + drag&drop
      Card.tsx        card (header/menu/rename/drag) + terminale
      TerminalView.tsx  xterm.js + FitAddon collegato alla pty
      types.ts        tipi Row/Column (id stabile) + palette
      styles/         tokens.css (design token) + app.css (reset/hover)
```

## Terminali (architettura)

- `TerminalView` crea un `xterm.Terminal` + `FitAddon` e lo lega alla pty
  tramite `window.dashai.terminal` (create/input/resize/dispose + onData/onExit).
- Il main (`pty.ts`) tiene una `node-pty` per ogni `Column.id` e inoltra l'I/O.
- `node-pty` 1.1.0 usa binari **N-API precompilati** (`prebuilds/` per win32-x64/arm64
  e darwin-x64/arm64): nessuna compilazione richiesta, funziona cosÃ¬ anche su Mac.
  Ãˆ **externalizzato** dal bundle del main
  (`externalizeDepsPlugin`) perchÃ© il suo loader cerca il `.node` a runtime.
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
