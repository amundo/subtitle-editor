class CueEditor extends HTMLElement {
  constructor() {
    super()
    this.data = null   // cue object
    this.video = null
    this.onCueChange = null
    this.onPlayCue = null
  }

  connectedCallback() {
    if (this.data) {
      this.render()
    }
  }

  set cue(value) {
    this.data = value
    this.render()
  }

  get cue() {
    return this.data
  }

  // For your usual .data convention
  set data(value) {
    this._cue = value
    if (this.isConnected) this.render()
  }

  get data() {
    return this._cue
  }

  render() {
    const cue = this._cue
    if (!cue) return

    this.innerHTML = `
      <textarea data-role="text"></textarea>

      <div class="row">
        <span data-role="startLabel" class="time-label"></span>
        <button data-role="setStart">Set start = video time</button>
        <button data-role="setEnd">Set end = video time</button>
        <button data-role="playCue">Play cue</button>
        <span data-role="endLabel" class="time-label"></span>
      </div>

      <div class="row">
        <button data-role="startMinus">start -0.1</button>
        <button data-role="startPlus">start +0.1</button>
        <button data-role="endMinus">end -0.1</button>
        <button data-role="endPlus">end +0.1</button>
      </div>
    `

    const textEl = this.querySelector('[data-role="text"]')
    const startLabel = this.querySelector('[data-role="startLabel"]')
    const endLabel = this.querySelector('[data-role="endLabel"]')

    const formatTime = s => {
      s = Math.max(0, s)
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      const sec = (s % 60).toFixed(3)
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(6,'0')}`
    }

    const updateLabels = () => {
      startLabel.textContent = formatTime(cue.start)
      endLabel.textContent = formatTime(cue.end)
    }

    textEl.value = cue.text || ''
    updateLabels()

    textEl.addEventListener('input', () => {
      cue.text = textEl.value
      this.onCueChange && this.onCueChange(cue)
    })

    this.querySelector('[data-role="setStart"]').addEventListener('click', e => {
      e.stopPropagation()
      if (!this.video) return
      cue.start = this.video.currentTime
      if (cue.start > cue.end) cue.end = cue.start + 0.5
      updateLabels()
      this.onCueChange && this.onCueChange(cue)
    })

    this.querySelector('[data-role="setEnd"]').addEventListener('click', e => {
      e.stopPropagation()
      if (!this.video) return
      cue.end = this.video.currentTime
      if (cue.end < cue.start) cue.start = cue.end - 0.5
      updateLabels()
      this.onCueChange && this.onCueChange(cue)
    })

    this.querySelector('[data-role="playCue"]').addEventListener('click', e => {
      e.stopPropagation()
      this.onPlayCue && this.onPlayCue(cue)
    })

    // Nudge buttons
    this.querySelector('[data-role="startMinus"]').addEventListener('click', e => {
      e.stopPropagation()
      cue.start = Math.max(0, cue.start - 0.1)
      if (cue.start > cue.end) cue.end = cue.start
      updateLabels()
      this.onCueChange && this.onCueChange(cue)
    })

    this.querySelector('[data-role="startPlus"]').addEventListener('click', e => {
      e.stopPropagation()
      cue.start += 0.1
      if (cue.start > cue.end) cue.end = cue.start
      updateLabels()
      this.onCueChange && this.onCueChange(cue)
    })

    this.querySelector('[data-role="endMinus"]').addEventListener('click', e => {
      e.stopPropagation()
      cue.end = Math.max(cue.start, cue.end - 0.1)
      updateLabels()
      this.onCueChange && this.onCueChange(cue)
    })

    this.querySelector('[data-role="endPlus"]').addEventListener('click', e => {
      e.stopPropagation()
      cue.end += 0.1
      updateLabels()
      this.onCueChange && this.onCueChange(cue)
    })

    // Click empty space in the card = play cue
    this.addEventListener('click', ev => {
      if (ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'BUTTON') return
      this.onPlayCue && this.onPlayCue(cue)
    })
  }
}

customElements.define('cue-editor', CueEditor)
export { CueEditor }
