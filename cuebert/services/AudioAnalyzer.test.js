import {
  buildEnvelope,
  getAudibleCueGaps,
  hasSoundInRange,
} from "./AudioAnalyzer.js";

function assertEquals(actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return;

  throw new Error(
    `Expected ${JSON.stringify(expected, null, 2)}, got ${
      JSON.stringify(actual, null, 2)
    }`,
  );
}

Deno.test("hasSoundInRange detects frames above the sound threshold", () => {
  const audio = {
    envelope: [0, 0.005, 0.04, 0],
    frameDuration: 1,
  };

  assertEquals(hasSoundInRange(audio, 1, 3, { threshold: 0.01 }), true);
  assertEquals(hasSoundInRange(audio, 0, 2, { threshold: 0.01 }), false);
});

Deno.test("buildEnvelope can sparsely sample frames", () => {
  const audioBuffer = {
    sampleRate: 8,
    getChannelData: () => new Float32Array([1, 1, 1, 1, 0, 0, 0, 0]),
  };

  const envelope = buildEnvelope(audioBuffer, {
    windowSize: 4,
    sampleStride: 2,
  });

  assertEquals(envelope, {
    envelope: [1, 0],
    frameDuration: 0.5,
  });
});

Deno.test("getAudibleCueGaps returns only gaps with sound between cues", () => {
  const firstCue = { id: 1, start: 0, end: 2, text: "first" };
  const secondCue = { id: 2, start: 4, end: 6, text: "second" };
  const thirdCue = { id: 3, start: 8, end: 10, text: "third" };

  const gaps = getAudibleCueGaps(
    [thirdCue, firstCue, secondCue],
    {
      envelope: [0, 0, 0.03, 0.04, 0, 0, 0, 0, 0, 0],
      frameDuration: 1,
    },
    { threshold: 0.01 },
  );

  assertEquals(gaps, [{
    start: 2,
    end: 4,
    previousCue: firstCue,
    nextCue: secondCue,
  }]);
});

Deno.test("getAudibleCueGaps ignores overlaps and tiny boundary gaps", () => {
  const gaps = getAudibleCueGaps(
    [
      { id: 1, start: 0, end: 2, text: "first" },
      { id: 2, start: 1.5, end: 3, text: "overlap" },
      { id: 3, start: 3.05, end: 4, text: "tiny" },
    ],
    {
      envelope: [0.02, 0.02, 0.02, 0.02],
      frameDuration: 1,
    },
    { threshold: 0.01 },
  );

  assertEquals(gaps, []);
});

Deno.test("getAudibleCueGaps ignores audible gaps shorter than 500ms", () => {
  const gaps = getAudibleCueGaps(
    [
      { id: 1, start: 0, end: 1, text: "first" },
      { id: 2, start: 1.4, end: 2, text: "second" },
    ],
    {
      envelope: [0, 0.02, 0.02],
      frameDuration: 0.25,
    },
    { threshold: 0.01 },
  );

  assertEquals(gaps, []);
});
