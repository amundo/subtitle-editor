import { parseSubtitleFile, parseWhisperCpp } from './TranscriptParser.js'

function assertEquals(actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return

  throw new Error(
    `Expected ${JSON.stringify(expected, null, 2)}, got ${JSON.stringify(actual, null, 2)}`
  )
}

const whisperCppFixture = {
  model: { type: 'large-v3' },
  params: { language: 'es' },
  result: { language: 'es' },
  transcription: [{
    offsets: { from: 0, to: 3000 },
    text: ' y lo que usted conoce.',
    tokens: [
      { text: '[_BEG_]', offsets: { from: 0, to: 0 }, id: 50364, p: 0.9 },
      { text: ' y', offsets: { from: 10, to: 170 }, id: 288, p: 0.1 },
      { text: ' lo', offsets: { from: 170, to: 500 }, id: 450, p: 0.2 },
      { text: ' que', offsets: { from: 520, to: 1000 }, id: 631, p: 0.9 },
      { text: ' usted', offsets: { from: 1200, to: 1920 }, id: 10467, p: 0.8 },
      { text: ' cono', offsets: { from: 1920, to: 2620 }, id: 33029, p: 0.7 },
      { text: 'ce', offsets: { from: 2620, to: 3000 }, id: 384, p: 0.9 },
      { text: '.', offsets: { from: 3000, to: 3000 }, id: 13, p: 0.5 },
      { text: '[_TT_150]', offsets: { from: 3000, to: 3000 }, id: 50514, p: 0.1 }
    ]
  }]
}

Deno.test('parseSubtitleFile keeps existing Cuebert JSON route', () => {
  const parsed = parseSubtitleFile(
    JSON.stringify({
      metadata: { title: 'Interview' },
      segments: [{ id: 7, start: 1, end: 2, text: ' hello ', speaker: 'Host' }]
    }),
    'interview.json'
  )

  assertEquals(parsed.format, 'atrain-json')
  assertEquals(parsed.cues, [{
    id: 7,
    start: 1,
    end: 2,
    text: 'hello',
    speaker: 'Host',
    sourceSegmentId: 7,
    sourceSegmentIds: [7]
  }])
})

Deno.test('parseSubtitleFile imports whisper.cpp JSON as Cuebert JSON source data', () => {
  const parsed = parseSubtitleFile(
    JSON.stringify(whisperCppFixture),
    'interview.wav.json'
  )

  assertEquals(parsed.format, 'atrain-json')
  assertEquals(parsed.cues, [{
    id: 1,
    start: 0,
    end: 3,
    text: 'y lo que usted conoce.',
    speaker: null,
    sourceSegmentId: 1,
    sourceSegmentIds: [1]
  }])
  assertEquals(parsed.sourceData.metadata.language, 'es')
  assertEquals(parsed.sourceData.metadata.model, 'large-v3')
  assertEquals(
    parsed.sourceData.segments[0].words.map(word => word.word),
    [' y', ' lo', ' que', ' usted', ' conoce.']
  )
})

Deno.test('parseWhisperCpp rejects non-whisper JSON', () => {
  let message = ''

  try {
    parseWhisperCpp({ segments: [] })
  } catch (err) {
    message = err.message
  }

  assertEquals(message, 'Expected whisper.cpp JSON with transcription[]')
})
