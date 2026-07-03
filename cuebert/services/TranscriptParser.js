function parseSubtitleFile(text, fileName = '') {
  const trimmed = text.trimStart()
  const looksLikeJson =
    fileName.toLowerCase().endsWith('.json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')

  if (looksLikeJson) {
    const parsed = JSON.parse(text)
    if (isWhisperCppJson(parsed)) {
      const sourceData = parseWhisperCpp(parsed)
      return parseAtrainJson(sourceData, { preferSegmentTiming: true })
    }

    return parseAtrainJson(parsed)
  }

  throw new Error('Cuebert only supports JSON transcript files.')
}

function parseWhisperCpp(text, {
  vadStatus = 'unknown'
} = {}) {
  const input = typeof text === 'string' ? JSON.parse(text) : text

  if (!isWhisperCppJson(input)) {
    throw new Error('Expected whisper.cpp JSON with transcription[]')
  }

  const isSpecial = token => {
    const text = typeof token?.text === 'string' ? token.text : ''

    return text.startsWith('[_') &&
      text.endsWith(']') &&
      text.length >= 4
  }
    
  const cleanText = text =>
    text
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .trim()

  const sourceSegments = input.transcription.map((segment, index) => {
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
  const useSourceSegments = vadStatus === 'ok' || hasNonGlobalWordTimings(sourceSegments)
  const segments = useSourceSegments
    ? sourceSegments.map(sourceSegment => ({
      ...sourceSegment,
      words: []
    }))
    : normalizeCueTimeline(segmentWhisperCppCues(sourceSegments))

  return {
    segments,
    metadata: {
      title: null,
      speakers: [],
      media: null,
      language: input.result?.language ?? input.params?.language ?? null,
      model: input.model?.type ?? null,
      transcriptionStatus: {
        vad: vadStatus,
        diarization: 'missing',
        cueSegmentation: 'ok'
      }
    }
  }
}

const CUE_SEGMENTATION = {
  minDuration: 0.05,
  maxDuration: 6.5,
  maxChars: 84,
  maxWords: 16,
  minDurationBeforeSoftBreak: 1.2,
  softBreakPunctuation: /[.!?;:。！？¿¡]$/,
  mediumBreakPunctuation: /[,，]$/
}

function segmentWhisperCppCues(sourceSegments) {
  const cues = []

  sourceSegments.forEach(sourceSegment => {
    const words = Array.isArray(sourceSegment.words)
      ? sourceSegment.words.filter(isTimedWord)
      : []

    if (!words.length) {
      cues.push({
        ...sourceSegment,
        id: cues.length + 1,
        sourceSegmentId: sourceSegment.id
      })
      return
    }

    const wordGroups = splitWordsIntoCueGroups(words)
    wordGroups.forEach(wordGroup => {
      const start = wordGroup[0].start
      const end = wordGroup.at(-1).end
      const text = cleanCueWords(wordGroup)

      if (!text) return

      cues.push({
        ...sourceSegment,
        id: cues.length + 1,
        start,
        end,
        text: ` ${text}`,
        words: wordGroup,
        sourceSegmentId: sourceSegment.id
      })
    })
  })

  return cues
}

function normalizeCueTimeline(cues) {
  const normalized = cues
    .filter(cue =>
      Number.isFinite(cue?.start) &&
      Number.isFinite(cue?.end) &&
      cue.end > cue.start
    )
    .sort((firstCue, secondCue) => {
      if (firstCue.start !== secondCue.start) {
        return firstCue.start - secondCue.start
      }
      return firstCue.end - secondCue.end
    })

  for (let index = 1; index < normalized.length; index++) {
    const previousCue = normalized[index - 1]
    const cue = normalized[index]

    if (cue.start >= previousCue.end) continue

    const boundary = clamp(
      cue.start,
      previousCue.start + CUE_SEGMENTATION.minDuration,
      cue.end - CUE_SEGMENTATION.minDuration
    )

    previousCue.end = Math.min(previousCue.end, boundary)
    cue.start = Math.max(cue.start, boundary)
  }

  return normalized.filter(cue => cue.end > cue.start)
}

function hasNonGlobalWordTimings(sourceSegments) {
  return sourceSegments.some(sourceSegment => {
    const firstWord = sourceSegment.words?.find(isTimedWord)
    if (!firstWord) return false

    return firstWord.start + 1 < sourceSegment.start
  })
}

function splitWordsIntoCueGroups(words) {
  const groups = []
  let group = []

  for (let index = 0; index < words.length; index++) {
    const word = words[index]
    group.push(word)

    if (index === words.length - 1 || shouldEndCueGroup(group, words[index + 1])) {
      groups.push(group)
      group = []
    }
  }

  return groups
}

function shouldEndCueGroup(group, nextWord) {
  if (!nextWord || !group.length) return true

  const firstWord = group[0]
  const lastWord = group.at(-1)
  const duration = lastWord.end - firstWord.start
  const nextDuration = nextWord.end - firstWord.start
  const text = cleanCueWords(group)
  const nextText = cleanCueWords([...group, nextWord])
  const lastText = String(lastWord.word ?? '').trim()

  if (
    duration >= CUE_SEGMENTATION.minDurationBeforeSoftBreak &&
    CUE_SEGMENTATION.softBreakPunctuation.test(lastText)
  ) {
    return true
  }

  if (
    duration >= CUE_SEGMENTATION.minDurationBeforeSoftBreak &&
    CUE_SEGMENTATION.mediumBreakPunctuation.test(lastText) &&
    (nextDuration > CUE_SEGMENTATION.maxDuration || nextText.length > CUE_SEGMENTATION.maxChars)
  ) {
    return true
  }

  return (
    nextDuration > CUE_SEGMENTATION.maxDuration ||
    nextText.length > CUE_SEGMENTATION.maxChars ||
    group.length >= CUE_SEGMENTATION.maxWords ||
    text.length >= CUE_SEGMENTATION.maxChars
  )
}

function cleanCueWords(words) {
  return cleanSegmentText(words.map(word => word.word ?? '').join(''))
}

function cleanSegmentText(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim()
}

function clamp(value, min, max) {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

function isTimedWord(word) {
  return (
    Number.isFinite(word?.start) &&
    Number.isFinite(word?.end) &&
    word.end > word.start &&
    String(word.word ?? '').trim()
  )
}

function parseAtrainJson(text, { preferSegmentTiming = false } = {}) {
  const parsed = typeof text === 'string' ? JSON.parse(text) : text
  const rawSegments = Array.isArray(parsed) ? parsed : parsed?.segments

  if (!Array.isArray(rawSegments)) {
    throw new Error('Expected a JSON array or an object with segments[]')
  }

  const useSegmentTiming =
    preferSegmentTiming ||
    parsed?.metadata?.transcriptionStatus?.vad === 'ok'

  const cues = rawSegments
    .filter(segment =>
      Number.isFinite(segment?.start) &&
      Number.isFinite(segment?.end) &&
      segment?.generatedFromAudioGap !== true
    )
    .map((segment, index) => {
      const rawText =
        typeof segment.text === 'string'
          ? segment.text
          : ''

      const speaker = getSegmentSpeaker(segment)
      const sourceId = segment.id ?? index + 1

      const timing = getSegmentCueTiming(segment, { preferSegmentTiming: useSegmentTiming })

      return {
        id: sourceId,
        start: timing.start,
        end: timing.end,
        text: rawText.trim(),
        speaker,
        sourceSegmentId: sourceId,
        sourceSegmentIds: [sourceId]
      }
    })
    .filter(cue =>
      Number.isFinite(cue?.start) &&
      Number.isFinite(cue?.end) &&
      cue.end > cue.start
    )

  return {
    format: 'atrain-json',
    cues,
    sourceData: parsed
  }
}

function getSegmentCueTiming(segment, { preferSegmentTiming = false } = {}) {
  const segmentTiming = {
    start: Number(segment.start),
    end: Number(segment.end)
  }
  const words = Array.isArray(segment?.words)
    ? segment.words.filter(isTimedWord)
    : []

  if (!words.length || preferSegmentTiming) {
    return segmentTiming
  }

  return {
    start: words[0].start,
    end: words.at(-1).end
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

    const isPunctuationOnly = /^[,.!?;:¿¡]+$/.test(trimmed)
    current.word += text
    if (!isPunctuationOnly) {
      current.end = msToSeconds(token.offsets?.to)
    }
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
  parseWhisperCpp,
  parseAtrainJson
}
