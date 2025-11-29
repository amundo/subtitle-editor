// cue-editor/CueEditor.js
class CueEditor extends HTMLElement {
  constructor() {
    super()
    this._data = null
    this.video = null
    this.formatTime = seconds => seconds.toFixed(3)

    // waveform props
    this.envelope = null
    this.frameDuration = null
    this.contextWindow = 0.75 // seconds

    // callbacks wired by SubtitleEditor
    this.onPlayCue = null
    this.onSnapStartToNow = null
    this.onSnapEndToNow = null
    this.onExtendStartBackward = null
    this.onExtendEndForward = null
  }

  connectedCallback() {
    this.render()
  }

  set data(cue) {
    this._data = cue
    this.render()
  }

  get data() {
    return this._data
  }

  render() {
    if (!this._data) {
      this.innerHTML = ''
      return
    }

    const { start, end, text } = this._data

    this.innerHTML = `
      <div class="cue-editor">
        <div class="cue-waveform-wrapper">
          <svg class="cue-waveform" viewBox="0 0 100 40" preserveAspectRatio="none"
               data-role="waveform"></svg>
        </div>

        <div class="cue-time-row">
          <button type="button" class="time-button"
                  data-role="extendStart"
                  title="Extend start backward one lump">
            ◂
          </button>

          <button type="button" class="time-button"
                  data-role="jumpStart"
                  title="Jump video to start time">
            start: <span data-role="startLabel"></span>
          </button>

          <button type="button" class="time-button"
                  data-role="snapStart"
                  title="Set start to current video time">
            🎯
          </button>

          <span class="time-row-spacer"></span>

          <button type="button" class="time-button"
                  data-role="snapEnd"
                  title="Set end to current video time">
            🎯
          </button>

          <button type="button" class="time-button"
                  data-role="jumpEnd"
                  title="Jump video to end time">
            end: <span data-role="endLabel"></span>
          </button>

          <button type="button" class="time-button"
                  data-role="extendEnd"
                  title="Extend end forward one lump">
            +
          </button>

          <button type="button" class="time-button play-button"
                  data-role="playCue"
                  title="Play this cue">
            ▶
          </button>
        </div>

        <textarea class="cue-text" data-role="text">${text ?? ''}</textarea>
      </div>
    `

    this.cacheEls()
    this.updateTimeLabels()
    this.bindEvents()
    this.renderWaveform()
  }

  cacheEls() {
    this.waveformSvg = this.querySelector('[data-role="waveform"]')
    this.startLabel = this.querySelector('[data-role="startLabel"]')
    this.endLabel = this.querySelector('[data-role="endLabel"]')
    this.textarea = this.querySelector('[data-role="text"]')
  }

  bindEvents() {
    const { start, end } = this._data

    this.querySelector('[data-role="jumpStart"]').addEventListener('click', () => {
      if (!this.video) return
      this.video.currentTime = this._data.start
      this.video.play()
    })

    this.querySelector('[data-role="jumpEnd"]').addEventListener('click', () => {
      if (!this.video) return
      this.video.currentTime = this._data.end
      this.video.play()
    })

    const snapStartBtn = this.querySelector('[data-role="snapStart"]')
    if (snapStartBtn) {
      snapStartBtn.addEventListener('click', () => {
        if (this.onSnapStartToNow) this.onSnapStartToNow()
      })
    }

    const snapEndBtn = this.querySelector('[data-role="snapEnd"]')
    if (snapEndBtn) {
      snapEndBtn.addEventListener('click', () => {
        if (this.onSnapEndToNow) this.onSnapEndToNow()
      })
    }

    const extendStartBtn = this.querySelector('[data-role="extendStart"]')
    if (extendStartBtn) {
      extendStartBtn.addEventListener('click', () => {
        if (this.onExtendStartBackward) this.onExtendStartBackward()
      })
    }

    const extendEndBtn = this.querySelector('[data-role="extendEnd"]')
    if (extendEndBtn) {
      extendEndBtn.addEventListener('click', () => {
        if (this.onExtendEndForward) this.onExtendEndForward()
      })
    }

    const playBtn = this.querySelector('[data-role="playCue"]')
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (this.onPlayCue) this.onPlayCue(this._data)
      })
    }

    this.textarea.addEventListener('input', () => {
      this._data.text = this.textarea.value
    })
  }

  updateTimeLabels() {
    if (!this._data) return
    if (this.startLabel) {
      this.startLabel.textContent = this.formatTime(this._data.start)
    }
    if (this.endLabel) {
      this.endLabel.textContent = this.formatTime(this._data.end)
    }
  }

  renderWaveform() {
    if (
      !this.waveformSvg ||
      !this.envelope ||
      !this.frameDuration ||
      !this._data
    ) {
      if (this.waveformSvg) this.waveformSvg.innerHTML = ''
      return
    }

    const env = this.envelope
    const fd = this.frameDuration
    const contextWindow = this.contextWindow || 0.75

    const start = this._data.start
    const end = this._data.end
    const duration = env.length * fd

    const tPrevStart = Math.max(0, start - contextWindow)
    const tPrevEnd = start
    const tCurrStart = start
    const tCurrEnd = end
    const tNextStart = end
    const tNextEnd = Math.min(duration, end + contextWindow)

    const i0 = Math.floor(tPrevStart / fd)
    const i1 = Math.floor(tPrevEnd / fd)
    const i2 = Math.floor(tCurrEnd / fd)
    const i3 = Math.floor(tNextEnd / fd)

    const prevSlice = env.slice(i0, i1)
    const currSlice = env.slice(i1, i2)
    const nextSlice = env.slice(i2, i3)

    const dTotalPrev = (i1 - i0) * fd
    const dCurr = (i2 - i1) * fd
    const dNext = (i3 - i2) * fd
    const total = dTotalPrev + dCurr + dNext || 1

    const width = 100
    const height = 40

    const buildPath = (slice, xStart, xEnd) => {
      if (!slice.length) return ''
      const max = Math.max(...slice) || 1
      const min = 0
      const dx = slice.length > 1 ? (xEnd - xStart) / (slice.length - 1) : 0
      let d = ''
      slice.forEach((v, idx) => {
        const x = xStart + dx * idx
        const norm = (v - min) / (max - min || 1)
        const y = height - norm * (height - 4) - 2 // small vertical padding
        d += (idx === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2) + ' '
      })
      return d
    }

    const xPrevStart = 0
    const xPrevEnd = (dTotalPrev / total) * width
    const xCurrStart = xPrevEnd
    const xCurrEnd = xPrevEnd + (dCurr / total) * width
    const xNextStart = xCurrEnd
    const xNextEnd = width

    const prevPath = buildPath(prevSlice, xPrevStart, xPrevEnd)
    const currPath = buildPath(currSlice, xCurrStart, xCurrEnd)
    const nextPath = buildPath(nextSlice, xNextStart, xNextEnd)

    this.waveformSvg.innerHTML = `
      <path class="wf-prev" d="${prevPath}"></path>
      <path class="wf-current" d="${currPath}"></path>
      <path class="wf-next" d="${nextPath}"></path>
    `
  }
}

customElements.define('cue-editor', CueEditor)
export { CueEditor }
