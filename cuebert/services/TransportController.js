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
    this.playRequestId = 0
    this.playbackRequested = false
    this.previewRange = null
  }

  bindVideoEvents() {
    this.video.addEventListener('timeupdate', () => {
      this.updateUi()
      this.onPlaybackSync('timeupdate')
      if (
        this.getPreviewEnd() !== null &&
        this.video.currentTime >= this.getPreviewEnd()
      ) {
        this.pausePlayback()
      }
    })

    this.video.addEventListener('loadedmetadata', () => {
      this.updateUi()
    })

    this.video.addEventListener('durationchange', () => {
      this.updateUi()
    })

    this.video.addEventListener('play', () => {
      if (!this.playbackRequested) {
        this.video.pause()
        return
      }
      this.updateUi()
      this.onPlaybackSync('play')
    })

    this.video.addEventListener('pause', () => {
      this.playbackRequested = false
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
      mediaVolume,
      playbackSpeedBtn
    } = this.controls

    this.setPlaybackRate(1)

    mediaPlayBtn?.addEventListener('click', () => {
      this.togglePlayback()
    })

    mediaSeek?.addEventListener('input', () => {
      const nextTime = Number(mediaSeek.value)
      if (Number.isFinite(nextTime)) {
        this.setPreviewEnd(null)
        this.previewRange = null
        this.video.currentTime = nextTime
        this.updateUi()
        this.onPlaybackSync('transport-seek-preview')
      }
    })

    mediaSeek?.addEventListener('change', () => {
      const nextTime = Number(mediaSeek.value)
      if (Number.isFinite(nextTime)) {
        this.setPreviewEnd(null)
        this.previewRange = null
        this.video.currentTime = nextTime
        this.updateUi()
        this.onPlaybackSync('transport-seek')
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

    playbackSpeedBtn?.addEventListener('click', () => {
      this.setPlaybackRate(this.getNextPlaybackRate())
      this.updateUi()
    })
  }

  togglePlayback(source = 'transport-play') {
    if (!this.hasMediaSource()) return

    this.onPlaybackSync(source)
    if (this.isPlaybackActive()) {
      this.pausePlayback()
      return
    }

    this.playMedia()
  }

  pausePlayback() {
    if (!this.video) return

    this.playRequestId++
    this.playbackRequested = false
    this.setPreviewEnd(null)
    this.previewRange = null
    this.video.pause()
    this.updateUi()
  }

  playMedia() {
    if (!this.video) return

    const playRequestId = ++this.playRequestId
    this.playbackRequested = true
    this.updateUi()
    this.video.play().catch(err => {
      if (playRequestId !== this.playRequestId) return
      this.playbackRequested = false
      this.previewRange = null
      this.updateUi()
      console.error('Media playback failed:', err)
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
      mediaVolume,
      playbackSpeedBtn,
      playbackSpeedValue
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
      const playbackActive = this.isPlaybackActive()
      mediaPlayBtn.textContent = playbackActive ? '❚❚' : '▶'
      mediaPlayBtn.disabled = !this.hasMediaSource()
      mediaPlayBtn.setAttribute('aria-label', playbackActive ? 'Pause' : 'Play')
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

    if (playbackSpeedValue) {
      playbackSpeedValue.textContent = `${TransportController.formatPlaybackRate(
        this.video.playbackRate || 1
      )}x`
    }

    if (playbackSpeedBtn) {
      playbackSpeedBtn.setAttribute(
        'aria-label',
        `Playback speed: ${TransportController.formatPlaybackRate(this.video.playbackRate || 1)}x`
      )
    }
  }

  playTimeRange(start, end) {
    if (!this.video || !this.hasMediaSource()) return

    const rangeStart = Math.min(start, end)
    const rangeEnd = Math.max(start, end)
    this.onPlaybackSync('cue-preview')
    this.setPreviewEnd(rangeEnd)
    this.previewRange = { start: rangeStart, end: rangeEnd }
    this.video.currentTime = Math.max(0, rangeStart)
    this.updateUi()
    this.playMedia()
  }

  toggleTimeRange(start, end) {
    if (!this.video || !this.hasMediaSource()) return

    const rangeStart = Math.min(start, end)
    const rangeEnd = Math.max(start, end)
    const isPlayingThisRange = (
      this.isPlaybackActive() &&
      this.previewRange !== null &&
      Math.abs(this.previewRange.start - rangeStart) < 0.001 &&
      Math.abs(this.previewRange.end - rangeEnd) < 0.001
    )

    if (isPlayingThisRange) {
      this.pausePlayback()
      return
    }

    this.playTimeRange(start, end)
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

  hasMediaSource() {
    return Boolean(this.video?.src || this.video?.currentSrc)
  }

  isPlaybackActive() {
    return Boolean(this.playbackRequested || (this.video && !this.video.paused))
  }

  setPlaybackRate(rate) {
    if (!this.video || !Number.isFinite(rate)) return

    this.video.playbackRate = Math.min(2, Math.max(0.25, rate))
  }

  getNextPlaybackRate() {
    const speeds = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.25]
    const currentIndex = speeds.findIndex(speed => (
      Math.abs(speed - this.video.playbackRate) < 0.001
    ))

    if (currentIndex === -1) return 1

    return speeds[(currentIndex + 1) % speeds.length]
  }

  static formatPlaybackRate(rate) {
    return Number(rate.toFixed(2)).toString()
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
