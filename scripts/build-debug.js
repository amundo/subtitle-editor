const repoRoot = new URL("../", import.meta.url);
const tauriConfigPath = new URL("src-tauri/tauri.conf.json", repoRoot);
const debugConfigPath = new URL(
  "src-tauri/target/cuebert-debug.conf.json",
  repoRoot,
);

const tauriConfig = JSON.parse(await Deno.readTextFile(tauriConfigPath));
const productName = tauriConfig.productName;
const version = tauriConfig.version;

if (!productName || !version) {
  throw new Error(
    "src-tauri/tauri.conf.json must define productName and version",
  );
}

await Deno.mkdir(new URL("src-tauri/target/", repoRoot), { recursive: true });
await Deno.writeTextFile(
  debugConfigPath,
  `${
    JSON.stringify(
      {
        productName: `${productName} Debug`,
      },
      null,
      2,
    )
  }\n`,
);

await run([
  "deno",
  "task",
  "tauri",
  "build",
  "--debug",
  "--config",
  debugConfigPath.pathname,
]);
await run([
  "deno",
  "run",
  "--allow-read",
  "--allow-write",
  "scripts/copy-debug-dmg.js",
]);

async function run(command) {
  const child = new Deno.Command(command[0], {
    args: command.slice(1),
    cwd: repoRoot.pathname,
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await child.output();

  if (!status.success) {
    throw new Error(`Command failed: ${command.join(" ")}`);
  }
}
