const DEFAULT_WINDOW_SIZE = 2048;
const DEFAULT_MIN_GAP_DURATION = 0.5;
const DEFAULT_ABSOLUTE_SOUND_THRESHOLD = 0.01;
const DEFAULT_RELATIVE_SOUND_THRESHOLD = 0.08;

function buildEnvelope(audioBuffer, { windowSize = DEFAULT_WINDOW_SIZE } = {}) {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  const envelope = [];
  for (let i = 0; i < channelData.length; i += windowSize) {
    let sum = 0;
    let count = 0;
    for (let j = i; j < i + windowSize && j < channelData.length; j++) {
      const v = channelData[j];
      sum += v * v;
      count++;
    }
    const rms = Math.sqrt(sum / count);
    envelope.push(rms);
  }

  const frameDuration = windowSize / sampleRate;
  return { envelope, frameDuration };
}

function getSoundThreshold(
  envelope,
  {
    absoluteThreshold = DEFAULT_ABSOLUTE_SOUND_THRESHOLD,
    relativeThreshold = DEFAULT_RELATIVE_SOUND_THRESHOLD,
  } = {},
) {
  const peak = envelope.reduce(
    (max, value) => Math.max(max, Number.isFinite(value) ? value : 0),
    0,
  );
  return Math.max(absoluteThreshold, peak * relativeThreshold);
}

function hasSoundInRange(
  { envelope, frameDuration },
  start,
  end,
  { threshold = getSoundThreshold(envelope) } = {},
) {
  if (!Array.isArray(envelope) || !envelope.length || !frameDuration) {
    return false;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return false;
  }

  const firstFrame = Math.max(0, Math.floor(start / frameDuration));
  const lastFrame = Math.min(
    envelope.length - 1,
    Math.ceil(end / frameDuration) - 1,
  );

  for (let index = firstFrame; index <= lastFrame; index++) {
    if ((envelope[index] ?? 0) >= threshold) return true;
  }

  return false;
}

function getAudibleCueGaps(
  cues,
  { envelope, frameDuration },
  {
    minGapDuration = DEFAULT_MIN_GAP_DURATION,
    threshold = getSoundThreshold(envelope ?? []),
  } = {},
) {
  if (!Array.isArray(cues) || cues.length < 2) return [];
  if (!Array.isArray(envelope) || !envelope.length || !frameDuration) return [];

  const sortedCues = [...cues]
    .filter((cue) =>
      Number.isFinite(cue?.start) &&
      Number.isFinite(cue?.end)
    )
    .sort((firstCue, secondCue) => firstCue.start - secondCue.start);

  const gaps = [];
  let previousCue = sortedCues[0];

  for (let index = 1; index < sortedCues.length; index++) {
    const nextCue = sortedCues[index];
    const gapStart = previousCue.end;
    const gapEnd = nextCue.start;

    if (
      gapEnd - gapStart >= minGapDuration &&
      hasSoundInRange(
        { envelope, frameDuration },
        gapStart,
        gapEnd,
        { threshold },
      )
    ) {
      gaps.push({
        start: gapStart,
        end: gapEnd,
        previousCue,
        nextCue,
      });
    }

    if (nextCue.end > previousCue.end) {
      previousCue = nextCue;
    }
  }

  return gaps;
}

function hasSoundAroundBoundary(
  { envelope, frameDuration },
  boundary,
  {
    windowDuration = 0.18,
    threshold = getSoundThreshold(envelope ?? []),
  } = {},
) {
  if (!Number.isFinite(boundary)) return false;

  return (
    hasSoundInRange(
      { envelope, frameDuration },
      boundary - windowDuration,
      boundary,
      { threshold },
    ) &&
    hasSoundInRange(
      { envelope, frameDuration },
      boundary,
      boundary + windowDuration,
      { threshold },
    )
  );
}

export {
  buildEnvelope,
  getAudibleCueGaps,
  getSoundThreshold,
  hasSoundAroundBoundary,
  hasSoundInRange,
};
