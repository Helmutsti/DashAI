# DashIAI — app

App desktop **Electron + React** (cartella autonoma e indipendente dal resto del
repo `DashIAI`). Board di **card ridimensionabili e trascinabili**, tema neutro
greyscale scuro, layout dal design **"Layout Grid App"**.

> **Ogni card è un terminale vero, stile VSCode**: `xterm.js` nel renderer +
> `node-pty` (shell reale) nel main, collegati via IPC. Shell predefinita su
> Windows: **Windows PowerShell**.

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

## Struttura

```
src/
  main/
    index.ts          processo principale Electron (finestra + lifecycle)
    pty.ts            gestore shell node-pty + handler IPC
  preload/index.ts    bridge sicuro renderer<->main (window.dashiai.terminal)
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
  tramite `window.dashiai.terminal` (create/input/resize/dispose + onData/onExit).
- Il main (`pty.ts`) tiene una `node-pty` per ogni `Column.id` e inoltra l'I/O.
- `node-pty` 1.1.0 usa binari **N-API precompilati** (`prebuilds/win32-x64/`):
  nessuna compilazione richiesta. È **externalizzato** dal bundle del main
  (`externalizeDepsPlugin`) perché il suo loader cerca il `.node` a runtime.
- Ogni card ha un `id` stabile: la shell **sopravvive al riordino nella stessa
  riga**. Spostare una card in un'altra riga la rimonta e la shell riparte
  (limite di reconciliation di React; migliorabile con un layer a portali).

## Comportamento (dal design handoff)

- **Parte vuota** (nessuna riga/scheda).
- Sidebar collassabile (`«` / `»`); voce **Impostazioni** aggiunge una scheda
  alla prima riga; il **pallino** cicla il colore della prossima scheda.
- Ogni scheda ha menu **Rinomina / Chiudi / Nuova scheda**; l'header è la
  maniglia di trascinamento.
- **Resize** di righe e colonne trascinando i separatori da 6px.
- **Drag&drop** schede: riordino, spostamento tra righe, e drop-zone per creare
  nuove righe (attive solo durante il trascinamento).

## Scostamenti consapevoli dal prototipo

- Chiudere l'**ultima** scheda di una riga elimina la riga (comportamento
  descritto nel README del handoff; il prototipo `.dc.html` invece la
  bloccava — abbiamo seguito la descrizione, più sensata come UX).
- Hover resi con classi CSS (`app.css`) invece dell'attributo `style-hover`
  del runtime proprietario, che non esiste fuori da quel design system.
