import { TranscriptDocument } from './TranscriptDocument.js'

function assertEquals(actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return

  throw new Error(
    `Expected ${JSON.stringify(expected, null, 2)}, got ${JSON.stringify(actual, null, 2)}`
  )
}

Deno.test('TranscriptDocument parses transcript text into document state', () => {
  const document = new TranscriptDocument()
  const result = document.parseText(
    JSON.stringify({
      metadata: { title: 'Interview' },
      segments: [{ id: 7, start: 1, end: 2, text: ' hello ', speaker: 'Host' }]
    }),
    {
      fileName: 'interview.json',
      sourcePath: '/tmp/interview.json'
    }
  )

  assertEquals(result, {
    cues: [{
      id: 7,
      start: 1,
      end: 2,
      text: 'hello',
      speaker: 'Host',
      sourceSegmentId: 7,
      sourceSegmentIds: [7]
    }],
    sourceData: {
      metadata: { title: 'Interview' },
      segments: [{ id: 7, start: 1, end: 2, text: ' hello ', speaker: 'Host' }]
    },
    format: 'atrain-json',
    path: '/tmp/interview.json'
  })
})

Deno.test('TranscriptDocument builds autosave contents for Cuebert JSON', () => {
  const document = new TranscriptDocument()
  const contents = document.buildContents({
    format: 'atrain-json',
    cues: [{ id: 1, start: 0, end: 1, text: 'Hello', speaker: 'Host' }],
    sourceData: {
      metadata: {},
      segments: [{ id: 1, start: 0, end: 1, text: ' Hello' }]
    },
    mediaPath: '/tmp/media.mp4',
    speakers: ['Host'],
    title: 'Session'
  })

  const parsed = JSON.parse(contents)
  assertEquals(parsed.metadata, {
    media: '/tmp/media.mp4',
    speakers: ['Host'],
    title: 'Session'
  })
  assertEquals(contents.endsWith('\n'), true)
})

Deno.test('TranscriptDocument derives title from metadata or path', () => {
  const document = new TranscriptDocument()
  const getPathFileName = path => path.split('/').pop()

  assertEquals(
    document.getTranscriptTitle({
      sourceData: { metadata: { title: ' Metadata Title ' } },
      path: '/tmp/fallback.json',
      getPathFileName
    }),
    'Metadata Title'
  )
  assertEquals(
    document.getTranscriptTitle({
      sourceData: null,
      path: '/tmp/fallback.json',
      getPathFileName
    }),
    'fallback'
  )
})

Deno.test('TranscriptDocument syncs aTrain metadata', () => {
  const document = new TranscriptDocument()
  const sourceData = [{ id: 1, start: 0, end: 1, text: ' Hello' }]

  const result = document.syncMetadata({
    format: 'atrain-json',
    sourceData,
    mediaPath: '/tmp/media.mp4',
    speakers: ['Host'],
    title: 'Session'
  })

  assertEquals(result, {
    metadata: {
      title: 'Session',
      speakers: ['Host'],
      media: '/tmp/media.mp4'
    },
    segments: [{ id: 1, start: 0, end: 1, text: ' Hello' }]
  })
})
