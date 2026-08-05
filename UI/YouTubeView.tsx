import { useEffect, useRef, useState } from 'react'
import { Pause, Play, SpeakerHigh, SpeakerX, Stop } from '@phosphor-icons/react'
import { loadYouTubeApi } from './youtubeApi'

export interface YouTubeViewProps {
  /** id stabile della card (= Column.id). */
  playerId: string
  /** link incollato dall'utente (già salvato nella card), se presente. */
  url?: string
  /** salva/aggiorna il link nella card. */
  onSetUrl: (url: string) => void
}

/** Accetta watch?v=, youtu.be/, /embed/, music.youtube.com o il solo id. */
function extractVideoId(input: string): string | null {
  const trimmed = input.trim()
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed
  try {
    const u = new URL(trimmed)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null
    const embedMatch = u.pathname.match(/^\/embed\/([\w-]{11})/)
    if (embedMatch) return embedMatch[1]
    return u.searchParams.get('v')
  } catch {
    return null
  }
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const iconBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-text)',
  cursor: 'pointer',
  flex: '0 0 auto'
}

/**
 * Player audio di un video YouTube: l'iframe vero resta montato ma ridotto a
 * pochi pixel e trasparente (nascosto ma non `display:none`, altrimenti molti
 * browser mettono in pausa l'elemento) — sopra ci sono controlli nostri
 * (play/pausa/stop, avanzamento, volume) al posto della UI video di YouTube.
 */
export default function YouTubeView(props: YouTubeViewProps): React.ReactElement {
  const { playerId, url, onSetUrl } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YT.Player | null>(null)
  const [draft, setDraft] = useState('')
  const [playing, setPlaying] = useState(false)
  const [ready, setReady] = useState(false)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [volume, setVolume] = useState(80)

  const videoId = url ? extractVideoId(url) : null

  useEffect(() => {
    if (!videoId) return
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let poll = 0

    void loadYouTubeApi().then((yt) => {
      if (disposed) return
      const player = new yt.Player(host, {
        videoId,
        // Un player a dimensione quasi nulla (es. 2x2) risulta "non valido"
        // per YouTube e blocca la riproduzione: le dimensioni restano quelle
        // normali di un player, è il contenitore attorno a nasconderlo
        // (vedi il wrapper qui sotto, fuori schermo invece che rimpicciolito).
        width: '320',
        height: '180',
        playerVars: {
          controls: 0,
          disablekb: 1,
          playsinline: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (e) => {
            e.target.setVolume(volume)
            setReady(true)
            setDuration(e.target.getDuration())
          },
          onStateChange: (e) => {
            setPlaying(e.data === yt.PlayerState.PLAYING)
            if (e.data === yt.PlayerState.PLAYING) setDuration(e.target.getDuration())
          }
        }
      })
      playerRef.current = player
      poll = window.setInterval(() => {
        const p = playerRef.current
        if (p && typeof p.getCurrentTime === 'function') setCurrent(p.getCurrentTime())
      }, 500)
    })

    return () => {
      disposed = true
      window.clearInterval(poll)
      playerRef.current?.destroy()
      playerRef.current = null
      setReady(false)
      setPlaying(false)
      setCurrent(0)
      setDuration(0)
    }
    // Il player si (ri)crea solo quando cambia video o card: `volume` è letto
    // una volta sola alla creazione, i cambi successivi passano dallo slider.
  }, [playerId, videoId])

  if (!videoId) {
    return (
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-4)'
        }}
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) onSetUrl(draft.trim())
          }}
          placeholder="Incolla il link del video YouTube…"
          style={{
            width: '100%',
            maxWidth: 360,
            fontSize: 13,
            color: 'var(--color-text)',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-divider)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 10px'
          }}
        />
        {draft.trim() && !extractVideoId(draft) && (
          <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>Link non riconosciuto</span>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--space-4)'
      }}
    >
      {/* Player vero: dimensioni normali (richieste da YouTube per riprodurre
          davvero), ma spostato fuori dall'area visibile invece che rimpicciolito
          — resta comunque "visibile" (niente display:none), altrimenti l'audio
          si fermerebbe. */}
      <div style={{ position: 'absolute', left: -9999, top: -9999, overflow: 'hidden' }}>
        <div ref={hostRef} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <div
          className="menu-item"
          style={iconBtnStyle}
          title={playing ? 'Pausa' : 'Play'}
          onClick={() => {
            const p = playerRef.current
            if (!p) return
            if (playing) p.pauseVideo()
            else p.playVideo()
          }}
        >
          {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
        </div>
        <div
          className="menu-item"
          style={iconBtnStyle}
          title="Stop"
          onClick={() => {
            playerRef.current?.stopVideo()
            setCurrent(0)
          }}
        >
          <Stop size={16} weight="fill" />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%', maxWidth: 360 }}>
        <span style={{ fontSize: 11, color: 'var(--color-neutral-400)', width: 34, textAlign: 'right' }}>
          {formatTime(current)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={1}
          value={Math.min(current, duration || 0)}
          disabled={!ready}
          onChange={(e) => {
            const v = Number(e.target.value)
            setCurrent(v)
            playerRef.current?.seekTo(v, true)
          }}
          style={{ flex: '1 1 auto', minWidth: 0 }}
        />
        <span style={{ fontSize: 11, color: 'var(--color-neutral-400)', width: 34 }}>{formatTime(duration)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%', maxWidth: 200 }}>
        {volume === 0 ? (
          <SpeakerX size={15} color="var(--color-neutral-400)" style={{ flex: '0 0 auto' }} />
        ) : (
          <SpeakerHigh size={15} color="var(--color-neutral-400)" style={{ flex: '0 0 auto' }} />
        )}
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={volume}
          onChange={(e) => {
            const v = Number(e.target.value)
            setVolume(v)
            playerRef.current?.setVolume(v)
          }}
          style={{ flex: '1 1 auto', minWidth: 0 }}
        />
      </div>
    </div>
  )
}
