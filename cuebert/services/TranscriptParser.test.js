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

Deno.test('parseSubtitleFile tightens generated Cuebert JSON timing from words', () => {
  const parsed = parseSubtitleFile(
    JSON.stringify({
      metadata: { transcriptionStatus: { cueSegmentation: 'ok' } },
      segments: [{
        id: 9,
        start: 349.7,
        end: 357.2,
        text: 'Me quedé en Ometepe, exactamente',
        words: [
          { start: 350.1, end: 350.4, word: ' Me' },
          { start: 350.4, end: 350.9, word: ' quedé' },
          { start: 350.9, end: 351.1, word: ' en' },
          { start: 351.1, end: 351.8, word: ' Ometepe,' },
          { start: 351.8, end: 352.5, word: ' exactamente' }
        ]
      }]
    }),
    'interview.json'
  )

  assertEquals(parsed.cues[0].start, 350.1)
  assertEquals(parsed.cues[0].end, 352.5)
})

Deno.test('parseSubtitleFile drops generated empty audio-gap cues on import', () => {
  const parsed = parseSubtitleFile(
    JSON.stringify({
      segments: [
        { id: 1, start: 0, end: 1, text: 'Real text' },
        {
          id: '1-gap-1',
          start: 1,
          end: 5,
          text: '',
          generatedFromAudioGap: true
        },
        { id: 2, start: 5, end: 6, text: 'More text' }
      ]
    }),
    'interview.cuebert.json'
  )

  assertEquals(parsed.cues.map(cue => cue.id), [1, 2])
})

Deno.test('parseSubtitleFile preserves generated VAD segment text without reflowing', () => {
  const parsed = parseSubtitleFile(
    JSON.stringify({
      metadata: { transcriptionStatus: { vad: 'ok', cueSegmentation: 'ok' } },
      segments: [
        {
          id: 7,
          seek: 5941350,
          start: 5941.35,
          end: 5947.25,
          text: ' lo va a hacer',
          words: [{ start: 5862.49, end: 5867.58, word: ' lo' }]
        },
        {
          id: 8,
          seek: 5947250,
          start: 5947.25,
          end: 5953.09,
          text: ' con mucho gusto',
          words: [{ start: 5867.58, end: 5868.36, word: ' gusto' }]
        }
      ]
    }),
    'interview.json'
  )

  assertEquals(
    parsed.cues.map(cue => [cue.id, cue.start, cue.end, cue.text]),
    [
      [7, 5941.35, 5947.25, 'lo va a hacer'],
      [8, 5947.25, 5953.09, 'con mucho gusto']
    ]
  )
})

Deno.test('parseWhisperCpp preserves VAD source segment timing', () => {
  const parsed = parseWhisperCpp({
    transcription: [{
      offsets: { from: 5941350, to: 5947250 },
      text: ' lo va a hacer con mucho gusto',
      tokens: [
        { text: ' lo', offsets: { from: 5862490, to: 5862620 }, id: 1, p: 0.9 },
        { text: ' gusto', offsets: { from: 5867580, to: 5868360 }, id: 2, p: 0.9 }
      ]
    }]
  }, { vadStatus: 'ok' })

  assertEquals(
    parsed.segments.map(segment => [segment.start, segment.end, segment.text, segment.words.length]),
    [[5941.35, 5947.25, 'lo va a hacer con mucho gusto', 0]]
  )
})

Deno.test('parseSubtitleFile imports whisper.cpp JSON as Cuebert JSON source data', () => {
  const parsed = parseSubtitleFile(
    JSON.stringify(whisperCppFixture),
    'interview.wav.json'
  )

  assertEquals(parsed.format, 'atrain-json')
  assertEquals(parsed.cues, [{
    id: 1,
    start: 0.01,
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

Deno.test('parseSubtitleFile splits long whisper.cpp segments into editor-sized cues', () => {
  const makeToken = (text, index) => ({
    text,
    offsets: { from: index * 500, to: (index + 1) * 500 },
    id: index + 1,
    p: 0.9
  })
  const words = [
    ' lo', ' que', ' usted', ' conoce,', ' verdad?', ' Sí,', ' sí,',
    ' eso,', ' eso', ' me', ' parece', ' muy', ' bien.', ' Primero',
    ' vamos', ' a', ' hacer', ' esa', ' pregunta', ' al', ' del',
    ' permiso.', ' Ya', ' está', ' grabando', ' esa', ' cosa.', ' Ok.'
  ]
  const parsed = parseSubtitleFile(
    JSON.stringify({
      model: { type: 'small' },
      params: { language: 'es' },
      transcription: [{
        offsets: { from: 0, to: words.length * 500 },
        text: words.join(''),
        tokens: words.map(makeToken)
      }]
    }),
    'interview.wav.json'
  )

  assertEquals(
    parsed.cues.map(cue => cue.text),
    [
      'lo que usted conoce, verdad?',
      'Sí, sí, eso, eso me parece muy bien.',
      'Primero vamos a hacer esa pregunta al del permiso.',
      'Ya está grabando esa cosa.',
      'Ok.'
    ]
  )
  assertEquals(
    parsed.sourceData.segments.map(segment => segment.sourceSegmentId),
    [1, 1, 1, 1, 1]
  )
  assertEquals(parsed.sourceData.metadata.transcriptionStatus, {
    vad: 'unknown',
    diarization: 'missing',
    cueSegmentation: 'ok'
  })
})

Deno.test('parseSubtitleFile uses word timing instead of overlapping VAD padding', () => {
  const parsed = parseSubtitleFile(
    JSON.stringify({
      model: { type: 'small' },
      params: { language: 'es' },
      transcription: [
        {
          offsets: { from: 264000, to: 267181 },
          text: ' él me',
          tokens: [
            { text: ' él', offsets: { from: 265900, to: 266400 }, id: 1, p: 0.9 },
            { text: ' me', offsets: { from: 266400, to: 267000 }, id: 2, p: 0.9 }
          ]
        },
        {
          offsets: { from: 265250, to: 269480 },
          text: ' estuviera viendo',
          tokens: [
            { text: ' estuviera', offsets: { from: 267120, to: 268200 }, id: 3, p: 0.9 },
            { text: ' viendo', offsets: { from: 268200, to: 269200 }, id: 4, p: 0.9 }
          ]
        }
      ]
    }),
    'interview.wav.json'
  )

  assertEquals(
    parsed.cues.map(cue => [cue.start, cue.end, cue.text]),
    [
      [265.9, 267, 'él me'],
      [267.12, 269.2, 'estuviera viendo']
    ]
  )
})

Deno.test('parseSubtitleFile trims remaining whisper.cpp cue overlaps', () => {
  const parsed = parseSubtitleFile(
    JSON.stringify({
      transcription: [
        {
          offsets: { from: 0, to: 2000 },
          text: ' first',
          tokens: [
            { text: ' first', offsets: { from: 0, to: 2000 }, id: 1, p: 0.9 }
          ]
        },
        {
          offsets: { from: 1000, to: 3000 },
          text: ' second',
          tokens: [
            { text: ' second', offsets: { from: 1000, to: 3000 }, id: 2, p: 0.9 }
          ]
        }
      ]
    }),
    'overlap.wav.json'
  )

  assertEquals(
    parsed.cues.map(cue => [cue.start, cue.end, cue.text]),
    [
      [0, 1, 'first'],
      [1, 3, 'second']
    ]
  )
})

Deno.test('parseSubtitleFile does not let punctuation tokens stretch cue timing', () => {
  const parsed = parseSubtitleFile(
    JSON.stringify({
      transcription: [{
        offsets: { from: 349700, to: 357200 },
        text: ' Me quedé en Ometepe, exactamente.',
        tokens: [
          { text: ' Me', offsets: { from: 349700, to: 350000 }, id: 1, p: 0.9 },
          { text: ' quedé', offsets: { from: 350000, to: 350500 }, id: 2, p: 0.9 },
          { text: ' en', offsets: { from: 350500, to: 350700 }, id: 3, p: 0.9 },
          { text: ' Ometepe', offsets: { from: 350700, to: 351300 }, id: 4, p: 0.9 },
          { text: ',', offsets: { from: 357200, to: 357200 }, id: 5, p: 0.9 },
          { text: ' exactamente', offsets: { from: 351500, to: 352400 }, id: 6, p: 0.9 },
          { text: '.', offsets: { from: 357200, to: 357200 }, id: 7, p: 0.9 }
        ]
      }]
    }),
    'punctuation.wav.json'
  )

  assertEquals(parsed.cues[0].text, 'Me quedé en Ometepe, exactamente.')
  assertEquals(parsed.cues[0].start, 349.7)
  assertEquals(parsed.cues[0].end, 352.4)
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
