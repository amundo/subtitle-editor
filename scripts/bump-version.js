import { format, increment, parse, tryParse } from "jsr:@std/semver";

const VERSION_FILES = {
  tauriConfig: "src-tauri/tauri.conf.json",
  cargoToml: "src-tauri/Cargo.toml",
};

const bumpType = Deno.args[0];

if (!bumpType || ["-h", "--help", "help"].includes(bumpType)) {
  printHelp();
  Deno.exit(bumpType ? 0 : 1);
}

const tauriConfig = JSON.parse(
  await Deno.readTextFile(VERSION_FILES.tauriConfig),
);

const currentVersion = tauriConfig.version;
const nextVersion = getNextVersion(currentVersion, bumpType);

tauriConfig.version = nextVersion;

await Deno.writeTextFile(
  VERSION_FILES.tauriConfig,
  `${JSON.stringify(tauriConfig, null, 2)}\n`,
);

await replaceInFile(
  VERSION_FILES.cargoToml,
  /^version = "([^"]+)"$/m,
  `version = "${nextVersion}"`,
);

console.log(`Cuebert version bumped: ${currentVersion} -> ${nextVersion}`);

function printHelp() {
  console.log(`Usage:
  deno task version patch
  deno task version minor
  deno task version major
  deno task version prerelease
  deno task version prepatch alpha
  deno task version preminor beta
  deno task version premajor rc
  deno task version 1.2.3
  deno task version 1.2.3-beta.1

Updates:
  ${VERSION_FILES.tauriConfig}
  ${VERSION_FILES.cargoToml}`);
}

function getNextVersion(currentVersion, typeOrVersion) {
  const explicit = tryParse(typeOrVersion);
  if (explicit) return format(explicit);

  const current = parse(currentVersion);
  const preid = Deno.args[1] ?? "alpha";

  switch (typeOrVersion) {
    case "major":
    case "minor":
    case "patch":
      return format(increment(current, typeOrVersion));

    case "premajor":
    case "preminor":
    case "prepatch":
    case "prerelease":
      return format(
        increment(current, typeOrVersion, {
          prerelease: preid,
          build: "",
        }),
      );

    default:
      throw new Error(
        `Expected semver bump type or explicit version, got: ${typeOrVersion}`,
      );
  }
}

async function replaceInFile(path, pattern, replacement) {
  const text = await Deno.readTextFile(path);

  if (!pattern.test(text)) {
    throw new Error(`Could not find version pattern in ${path}`);
  }

  await Deno.writeTextFile(path, text.replace(pattern, replacement));
}