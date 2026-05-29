#!/usr/bin/env -S deno run --allow-run --allow-read --allow-write --allow-env

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
  --help            Show this help

Prepared kit layout:
  cuebert-transcribe
  whisper-cli
  models/ggml-large-v3.bin

The output is a whisper.cpp JSON file that Cuebert can load directly.
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
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.inputs.push(arg);
    }
  }

  return options;
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

function getSupportDirectories() {
  const execDir = dirname(Deno.execPath());
  const scriptDir = dirname(fileUrlToPath(import.meta.url));

  return unique([
    Deno.cwd(),
    execDir,
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
      if (entry.isFile && entry.name.endsWith(".bin")) {
        return joinPath(directory, entry.name);
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }

  return "";
}

async function discoverWhisperBin() {
  const directories = getSupportDirectories();
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
  const directories = getSupportDirectories();

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

  if (hasPathSeparator(options.bin)) {
    await assertReadableFile(options.bin, "whisper.cpp executable");
  }
  if (!options.model) {
    throw new Error("Missing model. Pass --model or set WHISPER_CPP_MODEL.");
  }
  await assertReadableFile(options.model, "Whisper model");
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

  console.log(`Transcribing: ${inputPath}`);
  console.log(`Writing:      ${outputJson}`);

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

  console.log(`Done:         ${outputJson}`);
}

async function setupCheck(options) {
  await assertConfigured(options);

  console.log("Cuebert transcription setup looks ready.");
  console.log(`whisper.cpp: ${options.bin}`);
  console.log(`Model:       ${options.model}`);
}

async function main() {
  const options = parseArgs(Deno.args);

  if (options.help) {
    console.log(usage());
    return;
  }

  options.bin = expandHome(options.bin);
  options.model = expandHome(options.model);
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
