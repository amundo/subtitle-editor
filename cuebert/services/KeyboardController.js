class KeyboardController {
  constructor({
    element,
    onTogglePlayback = () => {},
    onNavigateCue = () => {},
    onFocusCueSearch = () => {},
    getActiveCue = () => null
  } = {}) {
    this.element = element
    this.onTogglePlayback = onTogglePlayback
    this.onNavigateCue = onNavigateCue
    this.onFocusCueSearch = onFocusCueSearch
    this.getActiveCue = getActiveCue
    this._globalHandler = null
  }

  bind() {
    this._globalHandler = event => {
      if (this.isGlobalPlaybackShortcut(event)) {
        event.preventDefault()
        event.stopPropagation()
        this.onTogglePlayback()
        return
      }

      if (this.isCueNavigationShortcut(event)) {
        if (event.target?.closest?.('cue-editor')) return

        const cue = this.getNavigationCue(event)
        if (!cue) return

        event.preventDefault()
        event.stopPropagation()
        this.onNavigateCue(cue, event.key === 'ArrowDown' ? 1 : -1)
      }
    }
    document.addEventListener('keydown', this._globalHandler, true)

    this.element.addEventListener('keydown', event => {
      if (
        event.code !== 'Slash' ||
        !event.metaKey ||
        event.altKey ||
        event.ctrlKey
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      this.onFocusCueSearch()
    })
  }

  unbind() {
    if (!this._globalHandler) return
    document.removeEventListener('keydown', this._globalHandler, true)
    this._globalHandler = null
  }

  isGlobalPlaybackShortcut(event) {
    return (
      event.key === 'Enter' &&
      event.metaKey &&
      event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey
    )
  }

  isCueNavigationShortcut(event) {
    return (
      (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
      event.metaKey &&
      event.altKey &&
      !event.ctrlKey
    )
  }

  getNavigationCue(event) {
    const cueEditor = event.target?.closest?.('cue-editor')
    return cueEditor?.data ?? this.getActiveCue()
  }
}

export { KeyboardController }
