/**
 * Accesso alla clipboard di sistema con fallimento silenzioso.
 *
 * Il webview (WebView2 su Windows, WebKit su macOS) può negare la lettura se la
 * chiamata non nasce da un gesto dell'utente: tutte le chiamate qui passano da
 * un handler di `contextmenu`/`click`, quindi il gesto c'è. In caso di rifiuto
 * si ritorna stringa vuota invece di propagare l'errore: nessuna operazione
 * della UI deve rompersi perché la clipboard non è disponibile.
 */
export async function readClipboard(): Promise<string> {
  try {
    return await navigator.clipboard.readText()
  } catch (err) {
    console.error('[dashai] lettura clipboard non consentita:', err)
    return ''
  }
}

export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    console.error('[dashai] scrittura clipboard non consentita:', err)
    return false
  }
}
