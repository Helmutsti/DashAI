/** Tipi minimi per la IFrame Player API di YouTube: solo quanto usato da
 *  YouTubeView, non è una definizione completa della API. */
declare namespace YT {
  enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5
  }

  interface OnStateChangeEvent {
    data: PlayerState
    target: Player
  }

  interface PlayerEvents {
    onReady?: (event: { target: Player }) => void
    onStateChange?: (event: OnStateChangeEvent) => void
  }

  interface PlayerOptions {
    videoId: string
    width?: string | number
    height?: string | number
    playerVars?: Record<string, number | string>
    events?: PlayerEvents
  }

  class Player {
    constructor(el: HTMLElement, opts: PlayerOptions)
    playVideo(): void
    pauseVideo(): void
    stopVideo(): void
    seekTo(seconds: number, allowSeekAhead: boolean): void
    setVolume(volume: number): void
    getVolume(): number
    getDuration(): number
    getCurrentTime(): number
    getPlayerState(): PlayerState
    destroy(): void
  }
}

interface Window {
  YT?: typeof YT
  onYouTubeIframeAPIReady?: () => void
}
