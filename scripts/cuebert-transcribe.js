#!/usr/bin/env -S deno run --allow-run --allow-read --allow-write --allow-env

import { parseWhisperCpp } from "../cuebert/services/TranscriptParser.js";

const MEDIA_EXTENSIONS = new Set([
  ".aac",
  ".aiff",
  ".avi",
  ".flac",
  ".m4a",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".ogg",
  ".wav",
  ".webm",
]);

function usage() {
  return `Cuebert whisper.cpp preprocessor

Usage:
  deno task transcribe -- --model /path/to/ggml-model.bin media-file.mp3
  cuebert-transcribe --model /path/to/ggml-model.bin media-file.mp3

Options:
  --bin PATH         whisper.cpp CLI executable. Default: WHISPER_CPP_BIN or whisper-cli
  --model PATH      ggml model file. Default: WHISPER_CPP_MODEL
  --language LANG   Spoken language code, or auto. Default: auto
  --output-dir DIR  Write JSON files to this directory. Default: next to each media file
  --overwrite       Replace an existing JSON output file
  --setup-check     Check whether whisper.cpp and the model can be found
  --threads N       Pass a thread count to whisper.cpp
  --prompt TEXT     Pass an initial prompt to whisper.cpp
  --vad             Require Voice Activity Detection with a VAD model
  --no-vad          Disable automatic VAD model discovery
  --vad-model PATH  VAD model file. Default: WHISPER_CPP_VAD_MODEL or auto
  --vad-threshold N VAD speech threshold. Default: 0.50
  --vad-silence-ms N
                    Minimum silence duration used to split speech. Default: 350
  --vad-pad-ms N    Speech padding before/after VAD segments. Default: 120
  --vad-overlap N   VAD segment overlap in seconds. Default: 0.15
  --max-len N       Pass a maximum segment length in characters to whisper.cpp
  --no-gpu          Disable GPU/Metal acceleration in whisper.cpp
  --whisper-arg ARG Pass one extra raw argument through to whisper.cpp
  --help            Show this help

Prepared kit layout:
  cuebert-transcribe
  whisper-cli
  lib/*.dylib
  models/ggml-small.bin
  models/ggml-silero-v6.2.0.bin

The output is a Cuebert JSON file with editor-sized cues.
`;
}

function parseArgs(argv) {
  const options = {
    bin: Deno.env.get("WHISPER_CPP_BIN") || "",
    model: Deno.env.get("WHISPER_CPP_MODEL") || "",
    language: "auto",
    outputDir: "",
    overwrite: false,
    setupCheck: false,
    threads: "",
    prompt: "",
    vad: "auto",
    vadModel: Deno.env.get("WHISPER_CPP_VAD_MODEL") || "",
    vadThreshold: "0.50",
    vadSilenceMs: "350",
    vadPadMs: "120",
    vadOverlap: "0.15",
    maxLen: "",
    noGpu: false,
    whisperArgs: [],
    inputs: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--") {
      continue;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--overwrite") {
      options.overwrite = true;
    } else if (arg === "--setup-check") {
      options.setupCheck = true;
    } else if (arg === "--bin") {
      options.bin = requireValue(argv, ++i, arg);
    } else if (arg === "--model") {
      options.model = requireValue(argv, ++i, arg);
    } else if (arg === "--language") {
      options.language = requireValue(argv, ++i, arg);
    } else if (arg === "--output-dir") {
      options.outputDir = requireValue(argv, ++i, arg);
    } else if (arg === "--threads") {
      options.threads = requireValue(argv, ++i, arg);
    } else if (arg === "--prompt") {
      options.prompt = requireValue(argv, ++i, arg);
    } else if (arg === "--vad") {
      options.vad = true;
    } else if (arg === "--no-vad") {
      options.vad = false;
    } else if (arg === "--vad-model") {
      options.vadModel = requireValue(argv, ++i, arg);
      options.vad = true;
    } else if (arg === "--vad-threshold") {
      options.vadThreshold = requireValue(argv, ++i, arg);
    } else if (arg === "--vad-silence-ms") {
      options.vadSilenceMs = requireValue(argv, ++i, arg);
    } else if (arg === "--vad-pad-ms") {
      options.vadPadMs = requireValue(argv, ++i, arg);
    } else if (arg === "--vad-overlap") {
      options.vadOverlap = requireValue(argv, ++i, arg);
    } else if (arg === "--max-len") {
      options.maxLen = requireValue(argv, ++i, arg);
    } else if (arg === "--no-gpu") {
      options.noGpu = true;
    } else if (arg === "--whisper-arg") {
      options.whisperArgs.push(requireAnyValue(argv, ++i, arg));
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.inputs.push(arg);
    }
  }

  return options;
}

function requireAnyValue(argv, index, optionName) {
  const value = argv[index];
  if (!value) {
    throw new Error(`${optionName} requires a value`);
  }
  return value;
}

function requireValue(argv, index, optionName) {
  const value = argv[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`${optionName} requires a value`);
  }
  return value;
}

function expandHome(path) {
  if (path === "~") return Deno.env.get("HOME") || path;
  if (path.startsWith("~/")) {
    const home = Deno.env.get("HOME");
    return home ? `${home}${path.slice(1)}` : path;
  }
  return path;
}

function fileUrlToPath(url) {
  if (!url.startsWith("file://")) return "";
  return decodeURIComponent(new URL(url).pathname);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function getSupportDirectories() {
  const execDir = dirname(Deno.execPath());
  const realExecDir = await Deno.realPath(Deno.execPath())
    .then(dirname)
    .catch(() => "");
  const scriptDir = dirname(fileUrlToPath(import.meta.url));

  return unique([
    Deno.cwd(),
    joinPath(Deno.cwd(), "cuebert-transcription-kit"),
    execDir,
    realExecDir,
    scriptDir,
  ]);
}

function stripMediaExtension(path) {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (!MEDIA_EXTENSIONS.has(extension)) return path;
  return path.slice(0, -extension.length);
}

function basename(path) {
  return path.split(/[\\/]/).pop() || path;
}

function dirname(path) {
  const normalized = path.replaceAll("\\", "/");
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "." : normalized.slice(0, index);
}

function joinPath(directory, name) {
  if (!directory || directory === ".") return name;
  return `${directory.replace(/[\\/]$/, "")}/${name}`;
}

function hasPathSeparator(path) {
  return path.includes("/") || path.includes("\\");
}

function looksLikeWrapper(path) {
  const name = basename(path);
  return name === "cuebert-transcribe" || name === "cuebert-transcribe.exe";
}

async function exists(path) {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

async function findFirstFile(candidates) {
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }

  return "";
}

async function findFirstModelIn(directory) {
  try {
    for await (const entry of Deno.readDir(directory)) {
      const name = entry.name.toLowerCase();
      if (
        entry.isFile &&
        name.endsWith(".bin") &&
        !name.includes("silero") &&
        !name.includes("vad")
      ) {
        return joinPath(directory, entry.name);
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }

  return "";
}

async function discoverWhisperBin() {
  const directories = await getSupportDirectories();
  const names = Deno.build.os === "windows"
    ? ["whisper-cli.exe", "main.exe"]
    : ["whisper-cli", "main"];

  const candidates = directories.flatMap((directory) =>
    names.flatMap((name) => [
      joinPath(directory, name),
      joinPath(joinPath(directory, "bin"), name),
      joinPath(joinPath(directory, "whisper.cpp"), name),
      joinPath(joinPath(joinPath(directory, "whisper.cpp"), "build"), name),
      joinPath(
        joinPath(joinPath(joinPath(directory, "whisper.cpp"), "build"), "bin"),
        name,
      ),
    ])
  );

  return await findFirstFile(candidates);
}

async function discoverWhisperModel() {
  const directories = await getSupportDirectories();

  for (const directory of directories) {
    const direct = await findFirstModelIn(joinPath(directory, "models"));
    if (direct) return direct;

    const whisperCpp = await findFirstModelIn(
      joinPath(joinPath(directory, "whisper.cpp"), "models"),
    );
    if (whisperCpp) return whisperCpp;
  }

  return "";
}

async function discoverVadModel() {
  const directories = await getSupportDirectories();
  const names = [
    "ggml-silero-v6.2.0.bin",
    "silero-v6.2.0-ggml.bin",
    "silero.bin",
  ];

  for (const directory of directories) {
    const modelsDirectory = joinPath(directory, "models");
    const direct = await findFirstFile(
      names.map((name) => joinPath(modelsDirectory, name)),
    );
    if (direct) return direct;

    const discovered = await findFirstVadModelIn(modelsDirectory);
    if (discovered) return discovered;
  }

  return "";
}

async function findFirstVadModelIn(directory) {
  try {
    for await (const entry of Deno.readDir(directory)) {
      const name = entry.name.toLowerCase();
      if (
        entry.isFile &&
        name.endsWith(".bin") &&
        (name.includes("silero") || name.includes("vad"))
      ) {
        return joinPath(directory, entry.name);
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }

  return "";
}

async function assertReadableFile(path, label) {
  const stat = await Deno.stat(path).catch((error) => {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`${label} does not exist: ${path}`);
    }
    throw error;
  });

  if (!stat.isFile) throw new Error(`${label} is not a file: ${path}`);
}

async function assertConfigured(options) {
  if (!options.bin) {
    options.bin = await discoverWhisperBin();
  }
  if (!options.model) {
    options.model = await discoverWhisperModel();
  }

  if (!options.bin) {
    options.bin = "whisper-cli";
  }
  if (looksLikeWrapper(options.bin)) {
    throw new Error(
      "WHISPER_CPP_BIN points to cuebert-transcribe. It must point to whisper-cli instead.",
    );
  }

  if (hasPathSeparator(options.bin)) {
    await assertReadableFile(options.bin, "whisper.cpp executable");
  }
  if (!options.model) {
    throw new Error("Missing model. Pass --model or set WHISPER_CPP_MODEL.");
  }
  await assertReadableFile(options.model, "Whisper model");

  if (options.vad !== false && !options.vadModel) {
    options.vadModel = await discoverVadModel();
  }
  if (options.vad === true && !options.vadModel) {
    throw new Error(
      "Missing VAD model. Pass --vad-model, set WHISPER_CPP_VAD_MODEL, or use --no-vad.",
    );
  }
  if (options.vadModel) {
    await assertReadableFile(options.vadModel, "VAD model");
  }
}

async function transcribe(inputPath, options) {
  await assertReadableFile(inputPath, "Input media");

  if (options.outputDir) {
    await Deno.mkdir(options.outputDir, { recursive: true });
  }

  const outputStem = stripMediaExtension(basename(inputPath));
  const outputBase = joinPath(
    options.outputDir || dirname(inputPath),
    outputStem,
  );
  const outputJson = `${outputBase}.json`;

  if (!options.overwrite && await exists(outputJson)) {
    throw new Error(
      `Output already exists: ${outputJson}\nUse --overwrite to replace it.`,
    );
  }

  const args = [
    "-m",
    options.model,
    "-f",
    inputPath,
    "-l",
    options.language,
    "-oj",
    "-ojf",
    "-of",
    outputBase,
  ];

  if (options.threads) args.push("-t", options.threads);
  if (options.prompt) args.push("--prompt", options.prompt);
  if (options.maxLen) args.push("--max-len", options.maxLen);
  if (options.noGpu) args.push("--no-gpu");
  if (options.vad !== false && options.vadModel) {
    args.push(
      "--vad",
      "--vad-model",
      options.vadModel,
      "--vad-threshold",
      options.vadThreshold,
      "--vad-min-silence-duration-ms",
      options.vadSilenceMs,
      "--vad-speech-pad-ms",
      options.vadPadMs,
      "--vad-samples-overlap",
      options.vadOverlap,
    );
  }
  args.push(...options.whisperArgs);

  console.log(`Transcribing: ${inputPath}`);
  console.log(`Writing:      ${outputJson}`);
  if (options.vad !== false && options.vadModel) {
    console.log(`VAD model:    ${options.vadModel}`);
  }

  const command = new Deno.Command(options.bin, {
    args,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await command.output();

  if (!status.success) {
    throw new Error(
      `whisper.cpp failed for ${inputPath} with exit code ${status.code}`,
    );
  }

  if (!await exists(outputJson)) {
    throw new Error(`whisper.cpp finished, but did not create ${outputJson}`);
  }

  await writeCuebertSegmentedJson(outputJson, {
    vadStatus: options.vad !== false && options.vadModel ? "ok" : "missing",
  });

  console.log(`Done:         ${outputJson}`);
}

async function writeCuebertSegmentedJson(outputJson, { vadStatus }) {
  const rawJson = await Deno.readTextFile(outputJson);
  const cuebertJson = parseWhisperCpp(rawJson, { vadStatus });
  await Deno.writeTextFile(outputJson, `${JSON.stringify(cuebertJson, null, 2)}\n`);
  console.log(`Cue breaks:   ${cuebertJson.segments.length} editor-sized cues`);
  console.log(`VAD:          ${vadStatus}`);
  if (cuebertJson.metadata?.transcriptionStatus?.diarization === "missing") {
    console.log("Diarization:  missing; assign speakers in Cuebert after import");
  }
}

async function setupCheck(options) {
  await assertConfigured(options);

  const command = new Deno.Command(options.bin, {
    args: ["--help"],
    stdin: "null",
    stdout: "null",
    stderr: "piped",
  });
  const status = await command.output();
  if (!status.success) {
    const stderr = new TextDecoder().decode(status.stderr).trim();
    throw new Error(
      `whisper.cpp executable was found but could not run: ${options.bin}` +
        (stderr ? `\n${stderr}` : ""),
    );
  }

  console.log("Cuebert transcription setup looks ready.");
  console.log(`whisper.cpp: ${options.bin}`);
  console.log(`Model:       ${options.model}`);
  console.log(
    options.vad !== false && options.vadModel
      ? `VAD model:   ${options.vadModel}`
      : "VAD model:   not found; transcription will run without VAD unless --vad-model is passed",
  );
}

async function main() {
  const options = parseArgs(Deno.args);

  if (options.help) {
    console.log(usage());
    return;
  }

  options.bin = expandHome(options.bin);
  options.model = expandHome(options.model);
  options.vadModel = expandHome(options.vadModel);
  options.outputDir = options.outputDir ? expandHome(options.outputDir) : "";
  options.inputs = options.inputs.map(expandHome);

  if (options.setupCheck) {
    await setupCheck(options);
    return;
  }

  await assertConfigured(options);

  if (!options.inputs.length) {
    throw new Error("Missing input media file.");
  }

  for (const input of options.inputs) {
    await transcribe(input, options);
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.message || error);
  console.error("\n" + usage());
  Deno.exit(1);
}
