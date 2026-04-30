class AutosaveController {
  constructor({ getTauri = () => window.__TAURI__ } = {}) {
    this.getTauri = getTauri
  }

  getAvailability({ loadedTranscriptPath, loadedTranscriptFormat }) {
    const tauri = this.getTauri()
    const hasWriteTextFile = Boolean(tauri?.fs?.writeTextFile)
    const hasTranscriptAutosaveCommand = Boolean(tauri?.core?.invoke)
    const hasTranscriptPath = Boolean(loadedTranscriptPath)
    const isCuebertJson = this.isCuebertJsonPath(loadedTranscriptPath)
    const targetPath = this.getTargetPath({
      loadedTranscriptPath,
      loadedTranscriptFormat
    })
    let reason = 'available'

    if (!hasTranscriptPath) {
      reason = 'missing-loadedTranscriptPath'
    } else if (!targetPath) {
      reason = 'unsupported-format'
    } else if (!this.hasWriterForTarget(targetPath)) {
      reason = 'missing-transcript-autosave-command'
    }

    return {
      available: reason === 'available',
      reason,
      loadedTranscriptPath,
      loadedTranscriptFormat,
      hasWriteTextFile,
      hasTranscriptAutosaveCommand,
      isCuebertJson,
      targetPath,
      willCreateCuebertJson: loadedTranscriptFormat === 'atrain-json' &&
        Boolean(targetPath) &&
        targetPath !== loadedTranscriptPath
    }
  }

  hasWriterForTarget(targetPath) {
    if (!targetPath) return false
    return Boolean(this.getTauri()?.core?.invoke)
  }

  getTargetPath({ loadedTranscriptPath, loadedTranscriptFormat }) {
    if (!loadedTranscriptPath) return null
    if (loadedTranscriptFormat === 'vtt') return loadedTranscriptPath
    if (loadedTranscriptFormat !== 'atrain-json') return null
    if (this.isCuebertJsonPath(loadedTranscriptPath)) return loadedTranscriptPath

    return this.getCuebertJsonPathForSource(loadedTranscriptPath)
  }

  async writeContents({ sourcePath, targetPath, contents }) {
    await this.getTauri()?.core?.invoke('write_transcript_autosave', {
      sourcePath,
      targetPath,
      contents
    })
  }

  getUnavailableMessage(autosave) {
    if (!autosave.hasTranscriptAutosaveCommand) return 'Autosave desktop only'
    if (!autosave.loadedTranscriptPath) return 'Open from disk to autosave'

    return 'Autosave unavailable'
  }

  getPathFileName(path) {
    return typeof path === 'string'
      ? path.split(/[\\/]/).pop() || ''
      : ''
  }

  getPathDirectory(path) {
    if (typeof path !== 'string') return ''

    const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    return index === -1 ? '' : path.slice(0, index)
  }

  joinPath(directory, fileName) {
    if (!directory) return fileName
    const separator = directory.includes('\\') ? '\\' : '/'
    return `${directory}${separator}${fileName}`
  }

  getCuebertJsonFileNameForSource(sourcePath, fallbackTitle = 'transcription') {
    const sourceName = this.getPathFileName(sourcePath)
    const baseName = sourceName
      ? sourceName.replace(/(?:\.cuebert)?\.json$/i, '').replace(/\.[^.]+$/, '')
      : fallbackTitle

    return `${baseName || 'transcription'}.cuebert.json`
  }

  getCuebertJsonPathForSource(sourcePath, fallbackTitle = 'transcription') {
    const directory = this.getPathDirectory(sourcePath)
    return this.joinPath(
      directory,
      this.getCuebertJsonFileNameForSource(sourcePath, fallbackTitle)
    )
  }

  isCuebertJsonPath(path) {
    return typeof path === 'string' && /\.cuebert\.json$/i.test(path)
  }
}

export { AutosaveController }
