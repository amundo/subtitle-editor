import { formatTime } from './time.js'

class TransportController {
  constructor({
    video,
    previewTrack = null,
    controls = {},
    getPreviewEnd = () => null,
    setPreviewEnd = () => {},
    onPlaybackSync = () => {},
    onPreviewTrackLoad = () => {}
  } = {}) {
    this.video = video
    this.previewTrack = previewTrack
    this.controls = controls
    this.getPreviewEnd = getPreviewEnd
    this.setPreviewEnd = setPreviewEnd
    this.onPlaybackSync = onPlaybackSync
    this.onPreviewTrackLoad = onPreviewTrackLoad
  }

  bindVideoEvents() {
    this.video.addEventListener('timeupdate', () => {
      this.updateUi()
      this.onPlaybackSync('timeupdate')
      if (this.getPreviewEnd() !== null && this.video.currentTime >= this.getPreviewEnd()) {
        this.video.pause()
        this.setPreviewEnd(null)
      }
    })

    this.video.addEventListener('loadedmetadata', () => {
      this.updateUi()
    })

    this.video.addEventListener('durationchange', () => {
      this.updateUi()
    })

    this.video.addEventListener('play', () => {
      this.updateUi()
      this.onPlaybackSync('play')
    })

    this.video.addEventListener('pause', () => {
      this.updateUi()
    })

    this.previewTrack?.addEventListener('load', () => {
      this.onPreviewTrackLoad()
      this.onPlaybackSync('trackload')
    })
  }

  bindTransportControls() {
    const {
      mediaPlayBtn,
      mediaSeek,
      mediaMuteBtn,
      mediaVolume
    } = this.controls

    mediaPlayBtn?.addEventListener('click', () => {
      if (!this.video.src) return
      if (this.video.paused) {
        this.video.play().catch(err => {
          console.error('Media playback failed:', err)
        })
      } else {
        this.video.pause()
      }
    })

    mediaSeek?.addEventListener('input', () => {
      const nextTime = Number(mediaSeek.value)
      if (Number.isFinite(nextTime)) {
        this.video.currentTime = nextTime
        this.updateUi()
      }
    })

    mediaMuteBtn?.addEventListener('click', () => {
      this.video.muted = !this.video.muted
      this.updateUi()
    })

    mediaVolume?.addEventListener('input', () => {
      const nextVolume = Number(mediaVolume.value)
      if (!Number.isFinite(nextVolume)) return

      this.video.volume = Math.min(1, Math.max(0, nextVolume))
      this.video.muted = this.video.volume === 0
      this.updateUi()
    })
  }

  updateUi() {
    if (!this.video) return

    const {
      currentTimeLabel,
      durationTimeLabel,
      mediaSeek,
      mediaPlayBtn,
      mediaMuteBtn,
      mediaVolume
    } = this.controls
    const duration = this.getMediaDuration()
    const currentTime = Number.isFinite(this.video.currentTime) ? this.video.currentTime : 0

    if (currentTimeLabel) {
      currentTimeLabel.textContent = formatTime(currentTime)
    }

    if (durationTimeLabel) {
      durationTimeLabel.textContent = formatTime(duration)
    }

    if (mediaSeek) {
      mediaSeek.max = String(duration)
      mediaSeek.value = String(Math.min(currentTime, duration || currentTime))
      mediaSeek.disabled = duration === 0
    }

    if (mediaPlayBtn) {
      mediaPlayBtn.textContent = this.video.paused ? '▶' : '❚❚'
      mediaPlayBtn.disabled = !this.video.src
      mediaPlayBtn.setAttribute('aria-label', this.video.paused ? 'Play' : 'Pause')
    }

    if (mediaMuteBtn) {
      mediaMuteBtn.innerHTML = TransportController.renderVolumeIcon(
        this.video.muted || this.video.volume === 0
      )
      mediaMuteBtn.setAttribute('aria-label', this.video.muted ? 'Unmute' : 'Mute')
    }

    if (mediaVolume) {
      mediaVolume.value = String(this.video.muted ? 0 : this.video.volume)
    }
  }

  playTimeRange(start, end) {
    if (!this.video || !this.video.src) return

    this.setPreviewEnd(Math.max(start, end))
    this.video.currentTime = Math.max(0, start)
    this.updateUi()
    this.video.play().catch(err => {
      console.error('Media playback failed:', err)
    })
  }

  playBoundaryPreview(cue, edge) {
    const previewDuration = 0.75

    if (edge === 'start') {
      this.playTimeRange(cue.start, Math.min(cue.end, cue.start + previewDuration))
      return
    }

    this.playTimeRange(Math.max(cue.start, cue.end - previewDuration), cue.end)
  }

  getMediaDuration() {
    return Number.isFinite(this.video?.duration) ? this.video.duration : 0
  }

  static renderVolumeIcon(muted) {
    const waves = muted
      ? '<line x1="18" y1="9" x2="23" y2="14"></line><line x1="23" y1="9" x2="18" y2="14"></line>'
      : '<path d="M18 9a5 5 0 0 1 0 6"></path><path d="M21 6a9 9 0 0 1 0 12"></path>'

    return `
      <svg class="transport-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 9v6h4l5 4V5L8 9H4z"></path>
        ${waves}
      </svg>
    `
  }
}

export { TransportController }
