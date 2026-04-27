// wave-form/WaveForm.js

class WaveForm extends HTMLElement {
  constructor() {
    super()

    this.envelope = null
    this.frameDuration = null
    this.start = null
    this.end = null
    this.contextWindow = 0.75

    this.svg = null
  }

  connectedCallback() {
    if (!this.svg) this.render()
  }

  set data({ envelope, frameDuration, start, end, contextWindow } = {}) {
    this.envelope = envelope ?? this.envelope
    this.frameDuration = frameDuration ?? this.frameDuration
    this.start = start ?? this.start
    this.end = end ?? this.end
    this.contextWindow = contextWindow ?? this.contextWindow

    if (!this.svg) {
      this.render()
      return
    }

    this.renderWaveform()
  }

  render() {
    this.innerHTML = `
      <div class="wave-form-wrapper">
        <svg class="wave-form-svg"
             viewBox="0 0 100 40"
             preserveAspectRatio="none"></svg>
      </div>
    `

    this.svg = this.querySelector('.wave-form-svg')
    this.renderWaveform()
  }

  renderWaveform() {
    if (!this.svg) return

    if (
      !this.envelope ||
      !this.frameDuration ||
      this.start == null ||
      this.end == null
    ) {
      this.svg.innerHTML = ''
      return
    }

    const env = this.envelope
    const fd = this.frameDuration
    const contextWindow = this.contextWindow || 0.75

    const start = this.start
    const end = this.end
    const duration = env.length * fd

    const tPrevStart = Math.max(0, start - contextWindow)
    const tPrevEnd = start
    const tCurrEnd = end
    const tNextEnd = Math.min(duration, end + contextWindow)

    const i0 = Math.floor(tPrevStart / fd)
    const i1 = Math.floor(tPrevEnd / fd)
    const i2 = Math.floor(tCurrEnd / fd)
    const i3 = Math.floor(tNextEnd / fd)

    const prevSlice = env.slice(i0, i1)
    const currSlice = env.slice(i1, i2)
    const nextSlice = env.slice(i2, i3)

    const dPrev = (i1 - i0) * fd
    const dCurr = (i2 - i1) * fd
    const dNext = (i3 - i2) * fd
    const total = dPrev + dCurr + dNext || 1

    const width = 100
    const height = 40

    const buildPath = (slice, xStart, xEnd) => {
      if (!slice.length) return ''

      const max = Math.max(...slice) || 1
      const dx = slice.length > 1
        ? (xEnd - xStart) / (slice.length - 1)
        : 0

      return slice.map((v, idx) => {
        const x = xStart + dx * idx
        const norm = v / max
        const y = height - norm * (height - 4) - 2

        return `${idx === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
      }).join(' ')
    }

    const xPrevStart = 0
    const xPrevEnd = (dPrev / total) * width
    const xCurrStart = xPrevEnd
    const xCurrEnd = xPrevEnd + (dCurr / total) * width
    const xNextStart = xCurrEnd
    const xNextEnd = width

    const prevPath = buildPath(prevSlice, xPrevStart, xPrevEnd)
    const currPath = buildPath(currSlice, xCurrStart, xCurrEnd)
    const nextPath = buildPath(nextSlice, xNextStart, xNextEnd)

    this.svg.innerHTML = `
      <path class="wf-prev" d="${prevPath}"></path>
      <path class="wf-current" d="${currPath}"></path>
      <path class="wf-next" d="${nextPath}"></path>
    `
  }
}

customElements.define('wave-form', WaveForm)

export { WaveForm }