// report-segments.js
const file = Deno.args[0];

if (!file) {
  console.error("Usage: deno run --allow-read report-segments.js transcript.json");
  Deno.exit(1);
}

const data = JSON.parse(await Deno.readTextFile(file));

// Adjust this if your array lives somewhere else
const segments = data.segments ?? data.transcription ?? data;

const wordCounts = segments
  .map((segment) => segment.words)
  .filter((n) => Number.isFinite(n));

const sum = wordCounts.reduce((a, b) => a + b, 0);
const mean = sum / wordCounts.length;

const sorted = [...wordCounts].sort((a, b) => a - b);
const median =
  sorted.length % 2
    ? sorted[Math.floor(sorted.length / 2)]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

const oneWord = wordCounts.filter((n) => n === 1).length;
const twoOrFewer = wordCounts.filter((n) => n <= 2).length;

console.log(`Segments: ${wordCounts.length}`);
console.log(`Total words: ${sum}`);
console.log(`Mean words/segment: ${mean.toFixed(2)}`);
console.log(`Median words/segment: ${median}`);
console.log(`Min words/segment: ${sorted[0]}`);
console.log(`Max words/segment: ${sorted.at(-1)}`);
console.log(`One-word segments: ${oneWord} (${(oneWord / wordCounts.length * 100).toFixed(1)}%)`);
console.log(`≤2-word segments: ${twoOrFewer} (${(twoOrFewer / wordCounts.length * 100).toFixed(1)}%)`);
