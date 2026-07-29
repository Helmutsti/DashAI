/**
 * Scrittura sulla clipboard di sistema con fallimento silenzioso.
 *
 * Il webview (WebView2 su Windows, WebKit su macOS) può negare l'accesso se la
 * chiamata non nasce da un gesto dell'utente: qui si passa sempre da un handler
 * di `click`, quindi il gesto c'è. In caso di rifiuto si torna `false` invece di
 * propagare l'errore: nessuna operazione della UI deve rompersi perché la
 * clipboard non è disponibile.
 */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    console.error('[dashai] scrittura clipboard non consentita:', err)
    return false
  }
}
