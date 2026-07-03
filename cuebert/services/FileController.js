// Handles Tauri-specific file I/O: transcript picking, media discovery, media blob
// fetching, and save dialogs. Falls back to browser APIs when Tauri is unavailable.
class FileController {
  constructor({ getTauri = () => window.__TAURI__ } = {}) {
    this.getTauri = getTauri
  }

  canUseNativeTranscriptPicker() {
    const tauri = this.getTauri()
    return Boolean(tauri?.dialog?.open && tauri?.fs?.readTextFile)
  }

  canFindMatchingMedia() {
    const tauri = this.getTauri()
    return Boolean(tauri?.core?.invoke && tauri?.core?.convertFileSrc)
  }

  // Opens native file picker and reads the selected transcript.
  // Returns { text, path } or null if cancelled.
  async openTranscriptFile() {
    const tauri = this.getTauri()
    const selectedPath = await tauri.dialog.open({
      multiple: false,
      filters: [{ name: 'Transcripts', extensions: ['json'] }]
    })

    if (!selectedPath || Array.isArray(selectedPath)) return null

    const text = await tauri.fs.readTextFile(selectedPath)
    return { text, path: selectedPath }
  }

  // Invokes the Rust command to find a media file alongside a transcript.
  // Returns a file path string or null.
  async findMatchingMedia(transcriptPath) {
    return this.getTauri()?.core?.invoke('find_matching_media', { transcriptPath }) ?? null
  }

  // Converts a local file path to a URL the webview can load.
  convertFileSrc(path) {
    return this.getTauri()?.core?.convertFileSrc(path) ?? path
  }

  // Fetches a Blob for audio analysis from a loaded media URL.
  // Uses direct file read for asset:// URLs (Tauri), fetch otherwise.
  async getMediaBlob(mediaPath, mediaUrl) {
    if (mediaUrl.startsWith('asset://')) {
      return this.readMediaBlobFromPath(mediaPath)
    }

    const response = await fetch(mediaUrl)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.blob()
  }

  async readMediaBlobFromPath(mediaPath) {
    const bytes = await this.getTauri()?.fs?.readFile?.(mediaPath)
    if (!bytes) return null

    return new Blob([bytes], { type: this.getMediaMimeType(mediaPath) })
  }

  getMediaMimeType(path) {
    const extension = path.split('.').pop()?.toLowerCase()
    const mimeTypes = {
      aac: 'audio/aac',
      aiff: 'audio/aiff',
      avi: 'video/x-msvideo',
      flac: 'audio/flac',
      m4a: 'audio/mp4',
      m4v: 'video/mp4',
      mkv: 'video/x-matroska',
      mov: 'video/quicktime',
      mp3: 'audio/mpeg',
      mp4: 'video/mp4',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      webm: 'video/webm'
    }

    return mimeTypes[extension] || 'application/octet-stream'
  }

  // Shows a native save dialog (Tauri) or triggers a browser download fallback.
  // Returns the saved file path, or null on cancel / browser download.
  // Throws on error — callers should catch and display messages.
  async saveTextFile({ defaultPath, filters, contents, mimeType }) {
    const tauri = this.getTauri()
    const tauriDialog = tauri?.dialog
    const tauriFs = tauri?.fs

    if (tauriDialog?.save && tauriFs?.writeTextFile) {
      const targetPath = await tauriDialog.save({ defaultPath, filters })
      if (!targetPath) return null

      await tauriFs.writeTextFile(targetPath, contents)
      console.info(`Saved file to ${targetPath}`)
      return targetPath
    }

    const blob = new Blob([contents], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = defaultPath
    a.click()
    URL.revokeObjectURL(url)
    return null
  }
}

export { FileController }
