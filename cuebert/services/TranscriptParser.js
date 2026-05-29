import { parseTime } from './time.js'

function parseSubtitleFile(text, fileName = '') {
  const trimmed = text.trimStart()
  const looksLikeJson =
    fileName.toLowerCase().endsWith('.json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')

  if (looksLikeJson) {
    try {
      const parsed = JSON.parse(text)
      const sourceData = isWhisperCppJson(parsed)
        ? parseWhisperCpp(parsed)
        : parsed

      return parseAtrainJson(sourceData)
    } catch (err) {
      if (!trimmed.startsWith('WEBVTT')) throw err
    }
  }

  return {
    format: 'vtt',
    cues: parseVtt(text),
    sourceData: null
  }
}

function parseVtt(text) {
  const lines = text.replace(/\r/g, '').split('\n')
  const cues = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trim()
    i++

    if (!line || line.startsWith('WEBVTT')) continue

    let id = null
    let timeLine = line

    if (!line.includes('-->')) {
      id = line
      timeLine = (lines[i++] || '').trim()
    }

    const m = timeLine.match(/([\d:.]+)\s*-->\s*([\d:.]+)/)
    if (!m) continue

    const start = parseTime(m[1])
    const end = parseTime(m[2])

    const textLines = []

    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i++])
    }

    const cueText = textLines.join('\n')

    cues.push({
      id: id ?? cues.length + 1,
      start,
      end,
      text: cueText
    })
  }

  return cues
}

function parseWhisperCpp(text) {
  const input = typeof text === 'string' ? JSON.parse(text) : text

  if (!isWhisperCppJson(input)) {
    throw new Error('Expected whisper.cpp JSON with transcription[]')
  }

  const isSpecial = token => /^\[_.+\]$/.test(token.text)

  const cleanText = text =>
    text
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .trim()

  const segments = input.transcription.map((segment, index) => {
    const tokens = Array.isArray(segment.tokens) ? segment.tokens : []
    const usableTokens = tokens.filter(token => !isSpecial(token))

    const words = buildWhisperCppWords(usableTokens)

    return {
      id: index + 1,
      seek: segment.offsets?.from ?? 0,
      start: msToSeconds(segment.offsets?.from),
      end: msToSeconds(segment.offsets?.to),
      text: cleanText(segment.text),
      tokens: usableTokens.map(token => token.id),
      temperature: 0,
      avg_logprob: null,
      compression_ratio: null,
      no_speech_prob: null,
      words,
      speaker: null
    }
  })

  return {
    segments,
    metadata: {
      title: null,
      speakers: [],
      media: null,
      language: input.result?.language ?? input.params?.language ?? null,
      model: input.model?.type ?? null
    }
  }
}

function parseAtrainJson(text) {
  const parsed = typeof text === 'string' ? JSON.parse(text) : text
  const segments = Array.isArray(parsed) ? parsed : parsed?.segments

  if (!Array.isArray(segments)) {
    throw new Error('Expected a JSON array or an object with segments[]')
  }

  const cues = segments
    .filter(segment =>
      Number.isFinite(segment?.start) &&
      Number.isFinite(segment?.end)
    )
    .map((segment, index) => {
      const rawText =
        typeof segment.text === 'string'
          ? segment.text
          : ''

      const speaker = getSegmentSpeaker(segment)
      const sourceId = segment.id ?? index + 1

      return {
        id: sourceId,
        start: Number(segment.start),
        end: Number(segment.end),
        text: rawText.trim(),
        speaker,
        sourceSegmentId: sourceId,
        sourceSegmentIds: [sourceId]
      }
    })

  return {
    format: 'atrain-json',
    cues,
    sourceData: parsed
  }
}

function getSegmentSpeaker(segment) {
  if (
    typeof segment?.speaker === 'string' &&
    segment.speaker.trim()
  ) {
    return segment.speaker.trim()
  }

  if (Array.isArray(segment?.words)) {
    const firstWordSpeaker = segment.words.find(
      word =>
        typeof word?.speaker === 'string' &&
        word.speaker.trim()
    )

    if (firstWordSpeaker) {
      return firstWordSpeaker.speaker.trim()
    }
  }

  return null
}

function isWhisperCppJson(value) {
  return Array.isArray(value?.transcription)
}

function buildWhisperCppWords(tokens) {
  const words = []
  let current = null

  for (const token of tokens) {
    const text = typeof token?.text === 'string' ? token.text : ''
    const trimmed = text.trim()
    if (!trimmed) continue

    const startsNewWord =
      !current ||
      /^\s/.test(text) && !/^[,.!?;:]+$/.test(trimmed)

    if (startsNewWord) {
      current = {
        start: msToSeconds(token.offsets?.from),
        end: msToSeconds(token.offsets?.to),
        word: text,
        probability: token.p
      }
      words.push(current)
      continue
    }

    current.word += text
    current.end = msToSeconds(token.offsets?.to)
    current.probability = averageProbabilities(current.probability, token.p)
  }

  return words.filter(word =>
    Number.isFinite(word.start) &&
    Number.isFinite(word.end) &&
    word.word.trim() &&
    !/^[,.!?;:¿¡]+$/.test(word.word.trim())
  )
}

function msToSeconds(ms) {
  return Number.isFinite(ms) ? ms / 1000 : 0
}

function averageProbabilities(a, b) {
  if (!Number.isFinite(a)) return b
  if (!Number.isFinite(b)) return a
  return (a + b) / 2
}

export {
  parseSubtitleFile,
  parseVtt,
  parseWhisperCpp,
  parseAtrainJson
}
