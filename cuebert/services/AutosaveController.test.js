import { AutosaveController } from './AutosaveController.js'

function assertEquals(actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return

  throw new Error(
    `Expected ${JSON.stringify(expected, null, 2)}, got ${JSON.stringify(actual, null, 2)}`
  )
}

function createController({ hasInvoke = true } = {}) {
  return new AutosaveController({
    getTauri: () => ({
      core: hasInvoke ? { invoke: () => {} } : {},
      fs: {}
    })
  })
}

Deno.test('AutosaveController targets a sibling Cuebert JSON for aTrain JSON', () => {
  const controller = createController()

  assertEquals(
    controller.getTargetPath({
      loadedTranscriptPath: '/Users/pathall/Desktop/project/transcript.v2.json',
      loadedTranscriptFormat: 'atrain-json'
    }),
    '/Users/pathall/Desktop/project/transcript.cuebert.json'
  )
})

Deno.test('AutosaveController preserves existing Cuebert JSON and VTT targets', () => {
  const controller = createController()

  assertEquals(
    controller.getTargetPath({
      loadedTranscriptPath: '/tmp/transcript.cuebert.json',
      loadedTranscriptFormat: 'atrain-json'
    }),
    '/tmp/transcript.cuebert.json'
  )
  assertEquals(
    controller.getTargetPath({
      loadedTranscriptPath: '/tmp/subtitles.vtt',
      loadedTranscriptFormat: 'vtt'
    }),
    '/tmp/subtitles.vtt'
  )
})

Deno.test('AutosaveController reports availability and creation intent', () => {
  const controller = createController()

  assertEquals(
    controller.getAvailability({
      loadedTranscriptPath: '/tmp/source.json',
      loadedTranscriptFormat: 'atrain-json'
    }),
    {
      available: true,
      reason: 'available',
      loadedTranscriptPath: '/tmp/source.json',
      loadedTranscriptFormat: 'atrain-json',
      hasWriteTextFile: false,
      hasTranscriptAutosaveCommand: true,
      isCuebertJson: false,
      targetPath: '/tmp/source.cuebert.json',
      willCreateCuebertJson: true
    }
  )
})

Deno.test('AutosaveController reports missing desktop command', () => {
  const controller = createController({ hasInvoke: false })

  assertEquals(
    controller.getAvailability({
      loadedTranscriptPath: '/tmp/source.json',
      loadedTranscriptFormat: 'atrain-json'
    }).reason,
    'missing-transcript-autosave-command'
  )
})
