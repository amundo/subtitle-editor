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
    this.visibleStart = 0
    this.visibleEnd = 0
    this.draggingEdge = null
    this.dragVisibleStart = 0
    this.dragVisibleEnd = 0
    this.suppressNextClick = false
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
    this.svg.addEventListener('click', event => {
      if (this.draggingEdge || this.suppressNextClick) {
        event.preventDefault()
        event.stopPropagation()
        this.suppressNextClick = false
        return
      }
      this.dispatchTimeEvent('waveformseek', this.getTimeFromPointerEvent(event))
    })

    this.svg.addEventListener('pointerdown', event => {
      const edge = event.target?.dataset?.edge
      if (!edge) return

      event.preventDefault()
      event.stopPropagation()
      this.draggingEdge = edge
      this.dragVisibleStart = this.visibleStart
      this.dragVisibleEnd = this.visibleEnd
      this.svg.setPointerCapture(event.pointerId)
      this.classList.add('is-dragging')
      this.dispatchBoundaryEvent('waveformboundarystart', edge, this.getTimeFromPointerEvent(event))
    })

    this.svg.addEventListener('pointermove', event => {
      if (!this.draggingEdge) return

      event.preventDefault()
      this.dispatchBoundaryEvent(
        'waveformboundarychange',
        this.draggingEdge,
        this.getTimeFromPointerEvent(event)
      )
    })

    this.svg.addEventListener('pointerup', event => {
      event.stopPropagation()
      this.endBoundaryDrag(event)
    })

    this.svg.addEventListener('pointercancel', event => {
      event.stopPropagation()
      this.endBoundaryDrag(event)
    })

    this.svg.addEventListener('lostpointercapture', () => {
      this.draggingEdge = null
      this.classList.remove('is-dragging')
    })
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
    this.visibleStart = tPrevStart
    this.visibleEnd = tNextEnd

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
    const bottomY = height

    const visibleSlice = env.slice(i0, i3)
    const max = Math.max(...visibleSlice) || 1

    const buildAreaPath = (slice, xStart, xEnd) => {
      if (!slice.length) return ''

      const dx = slice.length > 1
        ? (xEnd - xStart) / (slice.length - 1)
        : 0

      const points = slice.map((v, idx) => {
        const x = xStart + dx * idx
        const norm = v / max
        const y = height - norm * (height - 4) - 2
        return [x, y]
      })

      return [
        `M ${xStart.toFixed(2)} ${bottomY.toFixed(2)}`,
        ...points.map(([x, y], idx) => {
          const command = idx === 0 ? 'L' : 'L'
          return `${command} ${x.toFixed(2)} ${y.toFixed(2)}`
        }),
        `L ${xEnd.toFixed(2)} ${bottomY.toFixed(2)}`,
        'Z'
      ].join(' ')
    }

    const xPrevStart = 0
    const xPrevEnd = (dPrev / total) * width

    const xCurrStart = xPrevEnd
    const xCurrEnd = xPrevEnd + (dCurr / total) * width

    const xNextStart = xCurrEnd
    const xNextEnd = width

    const prevPath = buildAreaPath(prevSlice, xPrevStart, xPrevEnd)
    const currPath = buildAreaPath(currSlice, xCurrStart, xCurrEnd)
    const nextPath = buildAreaPath(nextSlice, xNextStart, xNextEnd)

    this.svg.innerHTML = `
      <path class="wf-prev" d="${prevPath}"></path>
      <path class="wf-current" d="${currPath}"></path>
      <path class="wf-next" d="${nextPath}"></path>
      <line class="wf-boundary" x1="${xCurrStart.toFixed(2)}" y1="0" x2="${xCurrStart.toFixed(2)}" y2="${height}"></line>
      <line class="wf-boundary" x1="${xCurrEnd.toFixed(2)}" y1="0" x2="${xCurrEnd.toFixed(2)}" y2="${height}"></line>
      <rect class="wf-handle" data-edge="start" x="${Math.max(0, xCurrStart - 1.6).toFixed(2)}" y="0" width="3.2" height="${height}"></rect>
      <rect class="wf-handle" data-edge="end" x="${Math.min(width - 3.2, xCurrEnd - 1.6).toFixed(2)}" y="0" width="3.2" height="${height}"></rect>
    `
  }

  endBoundaryDrag(event) {
    if (!this.draggingEdge) return

    event.preventDefault()
    const edge = this.draggingEdge
    const time = this.getTimeFromPointerEvent(event)
    this.draggingEdge = null
    this.suppressNextClick = true
    this.classList.remove('is-dragging')

    if (this.svg.hasPointerCapture?.(event.pointerId)) {
      this.svg.releasePointerCapture(event.pointerId)
    }

    this.dispatchBoundaryEvent('waveformboundarycommit', edge, time)
  }

  getTimeFromPointerEvent(event) {
    if (!this.svg) return this.start ?? 0

    const rect = this.svg.getBoundingClientRect()
    const x = Math.min(rect.width, Math.max(0, event.clientX - rect.left))
    const ratio = rect.width ? x / rect.width : 0
    const visibleStart = this.draggingEdge ? this.dragVisibleStart : this.visibleStart
    const visibleEnd = this.draggingEdge ? this.dragVisibleEnd : this.visibleEnd
    return visibleStart + ratio * (visibleEnd - visibleStart)
  }

  dispatchTimeEvent(type, time) {
    this.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      detail: { time }
    }))
  }

  dispatchBoundaryEvent(type, edge, time) {
    this.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      detail: { edge, time }
    }))
  }
}

customElements.define('wave-form', WaveForm)

export { WaveForm }
