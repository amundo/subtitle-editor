const configPath = new URL("../src-tauri/tauri.conf.json", import.meta.url);
const bundleDir = new URL(
  "../src-tauri/target/debug/bundle/dmg/",
  import.meta.url,
);

const config = JSON.parse(await Deno.readTextFile(configPath));
const productName = config.productName;
const version = config.version;

if (!productName || !version) {
  throw new Error(
    "src-tauri/tauri.conf.json must define productName and version",
  );
}

const debugProductName = `${productName} Debug`;
const sourcePrefix = `${debugProductName}_${version}_`;
const sourceSuffix = ".dmg";
let copied = 0;

for await (const entry of Deno.readDir(bundleDir)) {
  if (!entry.isFile) continue;
  if (!entry.name.startsWith(sourcePrefix)) continue;
  if (!entry.name.endsWith(sourceSuffix)) continue;
  if (entry.name.includes("-debug_")) continue;

  const arch = entry.name.slice(
    sourcePrefix.length,
    entry.name.length - sourceSuffix.length,
  );
  if (!arch) continue;

  const sourcePath = new URL(entry.name, bundleDir);
  const targetName = `${productName}_${version}-debug_${arch}.dmg`;
  const targetPath = new URL(targetName, bundleDir);

  await Deno.copyFile(sourcePath, targetPath);
  console.log(`Copied debug DMG to ${targetPath.pathname}`);
  copied += 1;
}

if (copied === 0) {
  throw new Error(
    `No debug DMG found in ${bundleDir.pathname} matching ${sourcePrefix}*${sourceSuffix}`,
  );
}
