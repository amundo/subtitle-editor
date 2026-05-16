import '../cue-editor/CueEditor.js'

class CueListView extends HTMLElement {
  #data = {}

  constructor() {
    super()
    this.cueElementByCue = new Map()
    this.activeCueElement = null
    this.playbackCueElement = null
    this.renderedRange = { start: 0, end: 0 }
    this.virtualScrollRaf = null
    this.estimatedCueBlockHeight = 214
    this.virtualizationThreshold = 450
    this.virtualOverscan = 8
    this.handleViewportChange = () => {
      if (this.virtualScrollRaf !== null) return

      this.virtualScrollRaf = requestAnimationFrame(() => {
        this.virtualScrollRaf = null
        this.renderVirtualRange()
      })
    }
  }

  connectedCallback() {
    window.addEventListener('scroll', this.handleViewportChange, { passive: true })
    window.addEventListener('resize', this.handleViewportChange)
    this.render()
  }

  disconnectedCallback() {
    window.removeEventListener('scroll', this.handleViewportChange)
    window.removeEventListener('resize', this.handleViewportChange)
    if (this.virtualScrollRaf !== null) {
      cancelAnimationFrame(this.virtualScrollRaf)
      this.virtualScrollRaf = null
    }
  }

  set data(data) {
    this.#data = data ?? {}
    this.render()
  }

  get data() {
    return this.#data
  }

  render() {
    const {
      cues = [],
      allowMerge = true,
      activeCue = null,
      video = null,
      playbackCue = null,
      speakers = [],
      envelope = null,
      frameDuration = null,
      formatTime = seconds => seconds.toFixed(3),
      handlers = {}
    } = this.#data

    if (this.shouldVirtualize(cues)) {
      this.renderVirtualRange()
      return
    }

    this.innerHTML = ''
    this.cueElementByCue = new Map()
    this.activeCueElement = null
    this.playbackCueElement = null

    cues.forEach((cue, index) => {
      this.appendCueBlock(cues, index)
    })

    if (activeCue && !this.activeCueElement) {
      this.activeCueElement = this.cueElementByCue.get(activeCue) ?? null
    }
    this.dispatchRenderEvent()
  }

  shouldVirtualize(cues) {
    return cues.length > this.virtualizationThreshold
  }

  renderVirtualRange({ force = false, range: requestedRange = null } = {}) {
    const { cues = [], activeCue = null } = this.#data
    if (!this.shouldVirtualize(cues)) return

    const range = requestedRange ?? this.getVirtualRange(cues.length)
    if (
      !force &&
      range.start === this.renderedRange.start &&
      range.end === this.renderedRange.end
    ) {
      return
    }

    this.renderedRange = range
    this.innerHTML = ''
    this.cueElementByCue = new Map()
    this.activeCueElement = null
    this.playbackCueElement = null

    const topSpacer = this.createVirtualSpacer(range.start * this.estimatedCueBlockHeight)
    const bottomSpacer = this.createVirtualSpacer(
      (cues.length - range.end) * this.estimatedCueBlockHeight
    )

    this.appendChild(topSpacer)
    for (let index = range.start; index < range.end; index += 1) {
      this.appendCueBlock(cues, index)
    }
    this.appendChild(bottomSpacer)

    if (activeCue && !this.activeCueElement) {
      this.activeCueElement = this.cueElementByCue.get(activeCue) ?? null
    }
    this.dispatchRenderEvent()
  }

  getVirtualRange(cueCount) {
    const rect = this.getBoundingClientRect()
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800
    const scrollTop = Math.max(0, -rect.top)
    const visibleStart = Math.floor(scrollTop / this.estimatedCueBlockHeight)
    const visibleEnd = Math.ceil((scrollTop + viewportHeight) / this.estimatedCueBlockHeight)

    return {
      start: Math.max(0, visibleStart - this.virtualOverscan),
      end: Math.min(cueCount, visibleEnd + this.virtualOverscan)
    }
  }

  createVirtualSpacer(height) {
    const spacer = document.createElement('div')
    spacer.className = 'cue-list-virtual-spacer'
    spacer.style.blockSize = `${Math.max(0, height)}px`
    return spacer
  }

  dispatchRenderEvent() {
    this.dispatchEvent(new CustomEvent('cuelistrender', { bubbles: true }))
  }

  appendCueBlock(cues, index) {
    const {
      allowMerge = true,
      activeCue = null,
      video = null,
      playbackCue = null,
      speakers = [],
      envelope = null,
      frameDuration = null,
      formatTime = seconds => seconds.toFixed(3),
      handlers = {}
    } = this.#data
    const cue = cues[index]
    if (!cue) return

    if (allowMerge && index > 0) {
      this.appendChild(this.createMergeCueRow(cues[index - 1], cue, handlers))
    }

    const cueEditor = document.createElement('cue-editor')
    cueEditor.video = video
    cueEditor.formatTime = formatTime
    cueEditor.speakerOptions = speakers
    cueEditor.envelope = envelope
    cueEditor.frameDuration = frameDuration
    cueEditor.contextWindow = 0.75
    cueEditor.data = cue

    this.cueElementByCue.set(cue, cueEditor)

    if (activeCue === cue) {
      this.activeCueElement = cueEditor
    }

    if (playbackCue === cue) {
      cueEditor.classList.add('is-playback-active')
      this.playbackCueElement = cueEditor
    }

    cueEditor.onPlayCue = selectedCue => {
      handlers.onPlayCue?.(selectedCue, cueEditor)
    }

    cueEditor.onSetSpeaker = nextSpeaker => {
      handlers.onSetSpeaker?.(cue, nextSpeaker, cueEditor)
    }

    cueEditor.onSplitCue = selection => {
      handlers.onSplitCue?.(cue, selection, cueEditor)
    }

    cueEditor.onDeleteCue = () => {
      handlers.onDeleteCue?.(cue, cueEditor)
    }

    cueEditor.onNavigateCue = direction => {
      handlers.onNavigateCue?.(cue, direction, cueEditor)
    }

    cueEditor.onWaveformSeek = time => {
      handlers.onWaveformSeek?.(cue, time, cueEditor)
    }

    cueEditor.onWaveformBoundaryChange = detail => {
      handlers.onWaveformBoundaryChange?.(cue, detail, cueEditor)
    }

    cueEditor.onWaveformBoundaryCommit = detail => {
      handlers.onWaveformBoundaryCommit?.(cue, detail, cueEditor)
    }

    cueEditor.addEventListener('focusin', () => {
      handlers.onFocusCue?.(cue, cueEditor)
    })
    cueEditor.addEventListener('click', () => {
      handlers.onFocusCue?.(cue, cueEditor)
    })
    cueEditor.addEventListener('cuechange', () => {
      handlers.onCueChange?.(cue, cueEditor)
    })

    this.appendChild(cueEditor)
  }

  ensureCueRendered(cue, { scroll = false } = {}) {
    const { cues = [] } = this.#data
    const index = cues.indexOf(cue)
    if (index === -1) return null

    if (this.shouldVirtualize(cues)) {
      const rangeContainsCue = (
        index >= this.renderedRange.start &&
        index < this.renderedRange.end
      )
      if (!rangeContainsCue || !this.cueElementByCue.has(cue)) {
        const range = {
          start: Math.max(0, index - this.virtualOverscan),
          end: Math.min(cues.length, index + this.virtualOverscan + 1)
        }
        this.renderVirtualRange({ force: true, range })
      }
    }

    const cueEditor = this.cueElementByCue.get(cue) ?? null
    if (scroll && cueEditor) {
      cueEditor.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }

    return cueEditor
  }

  createMergeCueRow(previousCue, nextCue, handlers) {
    const row = document.createElement('div')
    row.className = 'cue-merge-row'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cue-merge-button'
    button.textContent = '▲ merge ▼'
    button.title = 'Merge the cue above with the cue below'
    button.addEventListener('click', () => {
      handlers.onMergeCues?.(previousCue, nextCue)
    })

    row.appendChild(button)
    return row
  }
}

customElements.define('cue-list-view', CueListView)
export { CueListView }
