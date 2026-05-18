import { buildEnvelopeFromChannelData } from './AudioAnalyzer.js'

self.addEventListener('message', event => {
  const { channelData, sampleRate, options = {} } = event.data ?? {}

  try {
    const envelopeData = buildEnvelopeFromChannelData(
      channelData,
      sampleRate,
      options
    )
    self.postMessage({ type: 'complete', envelopeData })
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error?.message ?? String(error)
    })
  }
})
