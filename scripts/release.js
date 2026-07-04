const VERSION_FILES = [
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
];

const bump = Deno.args[0];

if (!bump || ["-h", "--help", "help"].includes(bump)) {
  printHelp();
  Deno.exit(bump ? 0 : 1);
}

const repoRoot = new URL("../", import.meta.url);
const productName = "Cuebert";

await assertCleanWorktree();
await assertCommandExists("gh");
await run(["deno", "task", "version", bump]);

const version = await readVersion();
const tag = `v${version}`;
await assertTagDoesNotExist(tag);
await run(["deno", "task", "test"]);
await run(["deno", "task", "build:all"]);

const artifacts = await findReleaseArtifacts(version);
await assertOnlyExpectedFilesChanged();
await stageChangedVersionFiles();
await run(["git", "commit", "-m", `Release ${tag}`]);
await run(["git", "tag", "-a", tag, "-m", `${productName} ${version}`]);

const branch = await currentBranch();
await run(["git", "push", "origin", branch]);
await run(["git", "push", "origin", tag]);
await run([
  "gh",
  "release",
  "create",
  tag,
  ...artifacts,
  "--title",
  `${productName} ${version}`,
  "--generate-notes",
]);

console.log(`Released ${tag}`);
for (const artifact of artifacts) {
  console.log(`Uploaded ${artifact}`);
}

function printHelp() {
  console.log(`Usage:
  deno task release patch
  deno task release minor
  deno task release major
  deno task release 1.2.3

Runs:
  clean worktree check
  deno task version <bump>
  deno task test
  deno task build:all
  git commit + annotated tag
  git push branch + tag
  gh release create --generate-notes`);
}

async function readVersion() {
  const config = JSON.parse(
    await Deno.readTextFile(new URL("src-tauri/tauri.conf.json", repoRoot)),
  );
  if (!config.version) {
    throw new Error("src-tauri/tauri.conf.json must define version");
  }
  return config.version;
}

async function findReleaseArtifacts(version) {
  const releaseDir = "src-tauri/target/release/bundle/dmg";
  const debugDir = "src-tauri/target/debug/bundle/dmg";
  const releasePrefix = `${productName}_${version}_`;
  const debugPrefix = `${productName}_${version}-debug_`;

  const releaseDmgs = await findMatchingDmgs(releaseDir, releasePrefix);
  const debugDmgs = await findMatchingDmgs(debugDir, debugPrefix);

  if (releaseDmgs.length === 0) {
    throw new Error(
      `No release DMG found matching ${releaseDir}/${releasePrefix}*.dmg`,
    );
  }
  if (debugDmgs.length === 0) {
    throw new Error(
      `No debug DMG found matching ${debugDir}/${debugPrefix}*.dmg`,
    );
  }

  return [...releaseDmgs, ...debugDmgs];
}

async function findMatchingDmgs(dir, prefix) {
  const fullDir = new URL(`${dir}/`, repoRoot);
  const matches = [];

  try {
    for await (const entry of Deno.readDir(fullDir)) {
      if (!entry.isFile) continue;
      if (!entry.name.startsWith(prefix)) continue;
      if (!entry.name.endsWith(".dmg")) continue;
      matches.push(`${dir}/${entry.name}`);
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return [];
    throw error;
  }

  return matches.sort();
}

async function assertCleanWorktree() {
  const status = await commandOutput(["git", "status", "--porcelain"]);
  if (status.trim()) {
    throw new Error(
      `Release requires a clean worktree. Commit or stash these changes first:\n${status}`,
    );
  }
}

async function assertTagDoesNotExist(tag) {
  const result = await commandResult([
    "git",
    "rev-parse",
    "--verify",
    "--quiet",
    tag,
  ]);
  if (result.code === 0) {
    throw new Error(`Tag already exists: ${tag}`);
  }
}

async function assertOnlyExpectedFilesChanged() {
  const status = await commandOutput(["git", "status", "--porcelain"]);
  const changed = status
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3));
  const unexpected = changed.filter((path) => !VERSION_FILES.includes(path));

  if (unexpected.length > 0) {
    throw new Error(
      `Release changed unexpected files:\n${unexpected.join("\n")}`,
    );
  }
}

async function stageChangedVersionFiles() {
  const existing = [];
  for (const path of VERSION_FILES) {
    try {
      await Deno.stat(new URL(path, repoRoot));
      existing.push(path);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue;
      throw error;
    }
  }
  await run(["git", "add", ...existing]);
}

async function currentBranch() {
  return (await commandOutput(["git", "branch", "--show-current"])).trim();
}

async function assertCommandExists(command) {
  await run(["which", command]);
}

async function run(command) {
  const result = await commandResult(command, {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.code !== 0) {
    throw new Error(`Command failed: ${command.join(" ")}`);
  }
}

async function commandOutput(command) {
  const result = await commandResult(command);
  if (result.code !== 0) {
    throw new Error(`Command failed: ${command.join(" ")}\n${result.stderr}`);
  }
  return result.stdout;
}

async function commandResult(command, io = {}) {
  const stdoutMode = io.stdout ?? "piped";
  const stderrMode = io.stderr ?? "piped";
  const child = new Deno.Command(command[0], {
    args: command.slice(1),
    cwd: repoRoot.pathname,
    stdout: stdoutMode,
    stderr: stderrMode,
  });
  const result = await child.output();

  return {
    code: result.code,
    stdout: stdoutMode === "piped"
      ? new TextDecoder().decode(result.stdout)
      : "",
    stderr: stderrMode === "piped"
      ? new TextDecoder().decode(result.stderr)
      : "",
  };
}
