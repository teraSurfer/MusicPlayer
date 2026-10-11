import {
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatTime } from '@/shared/lib/format'
import { usePlayer } from './PlayerProvider'

const REPEAT_LABEL = { off: 'Repeat: off', all: 'Repeat: all', one: 'Repeat: one' } as const

export function PlayerBar() {
  const current = usePlayer((s) => s.current)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const currentTime = usePlayer((s) => s.currentTime)
  const duration = usePlayer((s) => s.duration)
  const volume = usePlayer((s) => s.volume)
  const muted = usePlayer((s) => s.muted)
  const repeat = usePlayer((s) => s.repeat)
  const shuffle = usePlayer((s) => s.shuffle)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const next = usePlayer((s) => s.next)
  const previous = usePlayer((s) => s.previous)
  const seek = usePlayer((s) => s.seek)
  const setVolume = usePlayer((s) => s.setVolume)
  const toggleMute = usePlayer((s) => s.toggleMute)
  const cycleRepeat = usePlayer((s) => s.cycleRepeat)
  const toggleShuffle = usePlayer((s) => s.toggleShuffle)

  const disabled = current === null
  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat

  return (
    <section
      aria-label="Player"
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-t bg-background px-4 py-3"
    >
      <p className="sr-only" aria-live="polite">
        {current ? `Now playing: ${current.title}${current.artist ? ` by ${current.artist}` : ''}` : ''}
      </p>

      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
          {current?.coverUrl ? (
            <img src={current.coverUrl} alt="" className="size-full object-cover" />
          ) : (
            <Music2 className="size-5 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" data-testid="player-title">
            {current?.title ?? 'Nothing playing'}
          </p>
          <p className="truncate text-xs text-muted-foreground">{current?.artist ?? '—'}</p>
        </div>
      </div>

      <div className="flex w-[min(32rem,40vw)] min-w-72 flex-col items-center gap-1">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Shuffle"
            aria-pressed={shuffle}
            className={shuffle ? 'text-primary' : undefined}
            onClick={toggleShuffle}
          >
            <Shuffle />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Previous" disabled={disabled} onClick={previous}>
            <SkipBack />
          </Button>
          <Button
            size="icon"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            disabled={disabled}
            onClick={togglePlay}
          >
            {isPlaying ? <Pause /> : <Play />}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next" disabled={disabled} onClick={next}>
            <SkipForward />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={REPEAT_LABEL[repeat]}
            aria-pressed={repeat !== 'off'}
            className={repeat !== 'off' ? 'text-primary' : undefined}
            onClick={cycleRepeat}
          >
            <RepeatIcon />
          </Button>
        </div>

        <div className="flex w-full items-center gap-2 text-xs text-muted-foreground">
          <span className="w-10 text-right tabular-nums" data-testid="elapsed">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            aria-label="Seek"
            className="h-1 w-full cursor-pointer accent-primary disabled:opacity-50"
            min={0}
            max={Math.max(duration, 0)}
            step={1}
            value={Math.min(currentTime, duration || 0)}
            disabled={disabled}
            aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
            onChange={(e) => seek(Number(e.target.value))}
          />
          <span className="w-10 tabular-nums" data-testid="total">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={muted ? 'Unmute' : 'Mute'}
          onClick={toggleMute}
        >
          {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
        </Button>
        <input
          type="range"
          aria-label="Volume"
          className="w-28 cursor-pointer accent-primary"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>
    </section>
  )
}
