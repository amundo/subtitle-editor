import { TransportController } from "./TransportController.js";

function assertEquals(actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return;

  throw new Error(
    `Expected ${JSON.stringify(expected, null, 2)}, got ${
      JSON.stringify(actual, null, 2)
    }`,
  );
}

function createFakeVideo() {
  return {
    src: "blob:test-media",
    currentSrc: "",
    currentTime: 0,
    duration: 10,
    paused: true,
    muted: false,
    volume: 1,
    playbackRate: 1,
    playCount: 0,
    pauseCount: 0,
    addEventListener() {},
    play() {
      this.playCount++;
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      this.pauseCount++;
      this.paused = true;
    },
  };
}

function createPendingPlayVideo() {
  const video = createFakeVideo();
  video.play = function () {
    this.playCount++;
    return new Promise(() => {});
  };
  return video;
}

Deno.test("togglePlayback pauses active media and clears preview range", () => {
  const video = createFakeVideo();
  video.paused = false;
  let previewEnd = 4;

  const controller = new TransportController({
    video,
    getPreviewEnd: () => previewEnd,
    setPreviewEnd: (nextPreviewEnd) => {
      previewEnd = nextPreviewEnd;
    },
  });

  controller.togglePlayback();

  assertEquals(video.paused, true);
  assertEquals(video.pauseCount, 1);
  assertEquals(previewEnd, null);
});

Deno.test("toggleTimeRange stops the currently playing cue preview", () => {
  const video = createFakeVideo();
  video.paused = false;
  video.currentTime = 2.5;
  let previewEnd = 4;

  const controller = new TransportController({
    video,
    getPreviewEnd: () => previewEnd,
    setPreviewEnd: (nextPreviewEnd) => {
      previewEnd = nextPreviewEnd;
    },
  });
  controller.previewRange = { start: 2, end: 4 };

  controller.toggleTimeRange(2, 4);

  assertEquals(video.paused, true);
  assertEquals(video.pauseCount, 1);
  assertEquals(video.playCount, 0);
  assertEquals(previewEnd, null);
});

Deno.test("toggleTimeRange starts a different cue preview", () => {
  const video = createFakeVideo();
  video.paused = false;
  video.currentTime = 2.5;
  let previewEnd = 4;

  const controller = new TransportController({
    video,
    getPreviewEnd: () => previewEnd,
    setPreviewEnd: (nextPreviewEnd) => {
      previewEnd = nextPreviewEnd;
    },
  });
  controller.previewRange = { start: 2, end: 4 };

  controller.toggleTimeRange(5, 7);

  assertEquals(video.paused, false);
  assertEquals(video.pauseCount, 0);
  assertEquals(video.playCount, 1);
  assertEquals(video.currentTime, 5);
  assertEquals(previewEnd, 7);
});

Deno.test("togglePlayback stops a pending play request before media reports playing", () => {
  const video = createPendingPlayVideo();
  let previewEnd = null;

  const controller = new TransportController({
    video,
    getPreviewEnd: () => previewEnd,
    setPreviewEnd: (nextPreviewEnd) => {
      previewEnd = nextPreviewEnd;
    },
  });

  controller.togglePlayback();
  controller.togglePlayback();

  assertEquals(video.paused, true);
  assertEquals(video.playCount, 1);
  assertEquals(video.pauseCount, 1);
  assertEquals(previewEnd, null);
});

Deno.test("toggleTimeRange stops a pending cue preview", () => {
  const video = createPendingPlayVideo();
  let previewEnd = null;

  const controller = new TransportController({
    video,
    getPreviewEnd: () => previewEnd,
    setPreviewEnd: (nextPreviewEnd) => {
      previewEnd = nextPreviewEnd;
    },
  });

  controller.toggleTimeRange(2, 4);
  controller.toggleTimeRange(2, 4);

  assertEquals(video.paused, true);
  assertEquals(video.playCount, 1);
  assertEquals(video.pauseCount, 1);
  assertEquals(previewEnd, null);
});

Deno.test("toggleTimeRange stops the same cue preview when media time is stale", () => {
  const video = createPendingPlayVideo();
  let previewEnd = null;

  const controller = new TransportController({
    video,
    getPreviewEnd: () => previewEnd,
    setPreviewEnd: (nextPreviewEnd) => {
      previewEnd = nextPreviewEnd;
    },
  });

  controller.toggleTimeRange(2, 4);
  video.currentTime = 0;
  controller.toggleTimeRange(2, 4);

  assertEquals(video.paused, true);
  assertEquals(video.playCount, 1);
  assertEquals(video.pauseCount, 1);
  assertEquals(previewEnd, null);
});

Deno.test("toggleTimeRange starts a new preview for a different range with the same end", () => {
  const video = createFakeVideo();
  video.currentTime = 2;
  let previewEnd = 4;

  const controller = new TransportController({
    video,
    getPreviewEnd: () => previewEnd,
    setPreviewEnd: (nextPreviewEnd) => {
      previewEnd = nextPreviewEnd;
    },
  });
  controller.previewRange = { start: 2, end: 4 };
  controller.playbackRequested = true;

  controller.toggleTimeRange(3, 4);

  assertEquals(video.paused, false);
  assertEquals(video.playCount, 1);
  assertEquals(video.pauseCount, 0);
  assertEquals(video.currentTime, 3);
  assertEquals(previewEnd, 4);
});
