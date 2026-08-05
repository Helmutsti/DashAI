/**
 * Carica la IFrame Player API di YouTube una sola volta, condivisa da tutte le
 * card YouTube aperte nella sessione: lo script registra un callback globale
 * (`onYouTubeIframeAPIReady`), quindi va incapsulato qui invece che ripetuto
 * a ogni card.
 */
let apiPromise: Promise<typeof YT> | null = null

export function loadYouTubeApi(): Promise<typeof YT> {
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT)
      return
    }
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(window.YT as typeof YT)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })

  return apiPromise
}
