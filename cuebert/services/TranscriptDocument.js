import { parseSubtitleFile } from './TranscriptParser.js'
import { buildAtrainJson, buildPlainText, buildVtt } from './TranscriptExporter.js'

class TranscriptDocument {
  parseText(text, { fileName = '', sourcePath = null } = {}) {
    const parsed = parseSubtitleFile(text, fileName)

    return {
      cues: parsed.cues,
      sourceData: parsed.sourceData,
      format: parsed.format,
      path: sourcePath
    }
  }

  buildContents({
    format,
    cues,
    sourceData,
    mediaPath = null,
    speakers = [],
    title = 'Untitled'
  }) {
    if (format === 'atrain-json') {
      const json = buildAtrainJson(cues, sourceData, {
        mediaPath,
        speakers,
        title
      })
      return `${JSON.stringify(json, null, 2)}\n`
    }

    if (format === 'vtt') {
      return buildVtt(cues)
    }

    throw new Error(`Transcript contents are not available for ${format}`)
  }

  buildCuebertJsonContents({
    cues,
    sourceData,
    mediaPath = null,
    speakers = [],
    title = 'Untitled',
    trailingNewline = false
  }) {
    const json = buildAtrainJson(cues, sourceData, {
      mediaPath,
      speakers,
      title
    })
    const contents = JSON.stringify(json, null, 2)
    return trailingNewline ? `${contents}\n` : contents
  }

  buildVttContents(cues) {
    return buildVtt(cues)
  }

  buildPlainTextContents(cues) {
    return buildPlainText(cues)
  }

  getTranscriptTitle({ sourceData, path, getPathFileName }) {
    const metadataTitle = sourceData?.metadata?.title
    if (typeof metadataTitle === 'string' && metadataTitle.trim()) {
      return metadataTitle.trim()
    }

    const fileName = getPathFileName(path)
    return fileName ? fileName.replace(/\.[^.]+$/, '') : 'Untitled'
  }

  syncMetadata({
    format,
    sourceData,
    mediaPath = null,
    speakers = [],
    title = 'Untitled'
  }) {
    if (format !== 'atrain-json' || !sourceData) return sourceData

    const nextSourceData = Array.isArray(sourceData)
      ? {
        metadata: {},
        segments: sourceData
      }
      : sourceData

    nextSourceData.metadata = {
      ...(nextSourceData.metadata ?? {}),
      title,
      speakers,
      media: mediaPath || nextSourceData.metadata?.media || null
    }

    return nextSourceData
  }
}

export { TranscriptDocument }
