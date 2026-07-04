// Tracks which cue is highlighted during transport playback and keeps
// waveform playheads in sync. Decoupled from CueBert via callbacks.
class PreviewTrackController {
  constructor({
    getVideo = () => null,
    getCues = () => [],
    getCueElement = () => null,
    hasCueElement = () => false,
    forEachCueElement = () => {},
    getPreviewEnd = () => null,
    onSetActiveCue = () => {},
    onDispatch = () => {}
  } = {}) {
    this.getVideo = getVideo
    this.getCues = getCues
    this.getCueElement = getCueElement
    this.hasCueElement = hasCueElement
    this.forEachCueElement = forEachCueElement
    this.getPreviewEnd = getPreviewEnd
    this.onSetActiveCue = onSetActiveCue
    this.onDispatch = onDispatch

    this.playbackCue = null
    this.playbackCueElement = null
    this.transportPlaybackHighlightActive = false
    this.lastWaveformPlayheadTime = null
  }

  // Called on every transport event (timeupdate, play, seek, cue-preview).
  sync(source = 'playback') {
    this.updateHighlightState(source)
    const video = this.getVideo()
    if (!video || this.getPreviewEnd() !== null) return
    this.updateWaveformPlayheads()
    if (video.paused && source !== 'transport-seek') return
    if (!this.transportPlaybackHighlightActive) return

    const currentCue = this.findCueAtTime(video.currentTime)
    if (currentCue) {
      if (source === 'transport-seek-preview' && !this.hasCueElement(currentCue)) {
        this.setPlaybackCueReference(currentCue, source)
        return
      }
      this.setPlaybackCue(currentCue, source, {
        scroll: source !== 'transport-seek-preview'
      })
    } else {
      this.clearPlaybackCue(null, source)
    }
  }

  setPlaybackCue(cue, source = 'playback', options = {}) {
    if (this.playbackCue === cue) {
      this.ensurePlaybackCueElement(cue, options)
      return
    }

    const previousCue = this.playbackCue
    if (this.playbackCueElement) {
      this.playbackCueElement.classList.remove('is-playback-active')
    }
    this.playbackCueElement = null
    this.playbackCue = cue

    if (previousCue) {
      this.onDispatch(new CustomEvent('cueend', {
        detail: { cue: previousCue, source },
        bubbles: true
      }))
    }
    if (!cue) return

    const element = this.getCueElement(cue)
    if (!element) return

    this.playbackCueElement = element
    element.classList.add('is-playback-active')
    this.onDispatch(new CustomEvent('cuestart', {
      detail: { cue, source },
      bubbles: true
    }))
    this.onSetActiveCue(cue, element, { scroll: options.scroll })
  }

  ensurePlaybackCueElement(cue, options = {}) {
    if (!cue) return

    const currentElementStillRendered = (
      this.playbackCueElement &&
      this.playbackCueElement.isConnected &&
      this.playbackCueElement.data === cue
    )

    if (currentElementStillRendered) {
      this.playbackCueElement.classList.add('is-playback-active')
      return
    }

    const element = this.getCueElement(cue)
    if (!element) return

    this.playbackCueElement = element
    element.classList.add('is-playback-active')
    this.onSetActiveCue(cue, element, { scroll: options.scroll })
  }

  clearPlaybackCue(cue, source = 'playback') {
    if (cue && this.playbackCue !== cue) return

    const endedCue = this.playbackCue
    if (this.playbackCueElement) {
      this.playbackCueElement.classList.remove('is-playback-active')
    }
    this.playbackCue = null
    this.playbackCueElement = null

    if (endedCue) {
      this.onDispatch(new CustomEvent('cueend', {
        detail: { cue: endedCue, source },
        bubbles: true
      }))
    }
  }

  setPlaybackCueReference(cue, source = 'playback') {
    if (this.playbackCue === cue) return

    const previousCue = this.playbackCue
    if (this.playbackCueElement) {
      this.playbackCueElement.classList.remove('is-playback-active')
    }
    this.playbackCue = cue
    this.playbackCueElement = null

    if (previousCue) {
      this.onDispatch(new CustomEvent('cueend', {
        detail: { cue: previousCue, source },
        bubbles: true
      }))
    }
  }

  updateHighlightState(source) {
    if (
      source === 'transport-play' ||
      source === 'transport-seek' ||
      source === 'transport-seek-preview'
    ) {
      this.transportPlaybackHighlightActive = true
      return
    }

    if (source === 'cue-preview') {
      this.transportPlaybackHighlightActive = false
      this.clearPlaybackCue(null, source)
    }
  }

  findCueAtTime(time) {
    if (!Number.isFinite(time)) return null

    return this.getCues().find(cue =>
      Number.isFinite(cue?.start) &&
      Number.isFinite(cue?.end) &&
      time >= cue.start &&
      time < cue.end
    ) ?? null
  }

  updateWaveformPlayheads(time = this.getVideo()?.currentTime) {
    const playheadTime = Number.isFinite(time) ? time : null
    if (
      playheadTime !== null &&
      this.lastWaveformPlayheadTime !== null &&
      Math.abs(playheadTime - this.lastWaveformPlayheadTime) < 0.025
    ) {
      return
    }

    this.lastWaveformPlayheadTime = playheadTime
    this.forEachCueElement(cueEditor => {
      cueEditor.updatePlayhead?.(playheadTime)
    })
  }
}

export { PreviewTrackController }
