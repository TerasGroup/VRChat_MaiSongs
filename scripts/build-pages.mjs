import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, "dist");
const SONGS_JSON_PATH = path.join(ROOT_DIR, "songs.json");
const RUNTIME_REGISTRY_PATH = path.join(ROOT_DIR, "runtime-url-registry.json");
const SONGS_SIG_PATH = path.join(ROOT_DIR, "songs.sig");

function computeSha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildIndexHtml(catalog) {
  const pack = catalog.pack || {};
  const title = escapeHtml(pack.name || "VMC Song Pack");
  const description = escapeHtml(pack.description || "");
  const songCount = Number(catalog.songCount || 0);
  const chartCount = Number(catalog.chartCount || 0);
  const slotCount = Number(catalog.runtime?.slotCount || 0);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { max-width: 760px; margin: 0 auto; padding: 48px 24px; line-height: 1.55; }
    code { padding: 0.15rem 0.35rem; border-radius: 0.3rem; background: color-mix(in srgb, currentColor 10%, transparent); }
    a { font-weight: 600; }
    .meta { opacity: 0.78; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    ${description ? `<p>${description}</p>` : ""}
    <p class="meta">${songCount} song(s), ${chartCount} chart(s), ${slotCount} pre-registered runtime slots.</p>
    <p>This site publishes catalog v2 and fixed VRChat runtime-slot assets. Udon selects pre-registered VRCUrl values by numeric indexes and does not construct URLs at runtime.</p>
    <p><a href="./songs.json">Open songs.json</a> · <a href="./runtime-url-registry.json">Open runtime URL registry</a></p>
    <p><code>vmc-song-catalog/v2</code></p>
  </main>
</body>
</html>
`;
}

function safeSource(relPath) {
  if (!relPath || path.isAbsolute(relPath) || relPath.includes("\\")) {
    throw new Error(`Invalid repository-relative source path: "${relPath}"`);
  }
  const full = path.resolve(ROOT_DIR, relPath);
  const rootPrefix = ROOT_DIR.endsWith(path.sep) ? ROOT_DIR : ROOT_DIR + path.sep;
  if (full !== ROOT_DIR && !full.startsWith(rootPrefix)) {
    throw new Error(`Source path escapes repository root: "${relPath}"`);
  }
  return full;
}

function copyAsset(sourceRelPath, destinationRelPath) {
  const src = safeSource(sourceRelPath);
  const dest = path.join(DIST_DIR, destinationRelPath);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
    throw new Error(`Referenced asset missing: "${sourceRelPath}"`);
  }
  const data = fs.readFileSync(src);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data);
  return data.length;
}

function copyTextFile(sourcePath, destinationName) {
  const data = fs.readFileSync(sourcePath);
  fs.writeFileSync(path.join(DIST_DIR, destinationName), data);
  return data.length;
}

function main() {
  if (!fs.existsSync(SONGS_JSON_PATH)) {
    throw new Error("songs.json does not exist. Run 'npm run catalog' first.");
  }
  if (!fs.existsSync(RUNTIME_REGISTRY_PATH)) {
    throw new Error("runtime-url-registry.json does not exist. Run 'npm run catalog' first.");
  }

  const catalog = JSON.parse(fs.readFileSync(SONGS_JSON_PATH, "utf8"));
  if (catalog.schema !== "vmc-song-catalog/v2") {
    throw new Error(`Expected vmc-song-catalog/v2, got "${catalog.schema}".`);
  }

  if (fs.existsSync(DIST_DIR)) fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, ".nojekyll"), "");

  let totalBytes = 0;
  let fileCount = 0;

  totalBytes += copyTextFile(SONGS_JSON_PATH, "songs.json");
  fileCount++;
  totalBytes += copyTextFile(RUNTIME_REGISTRY_PATH, "runtime-url-registry.json");
  fileCount++;

  const indexHtml = buildIndexHtml(catalog);
  fs.writeFileSync(path.join(DIST_DIR, "index.html"), indexHtml, "utf8");
  totalBytes += Buffer.byteLength(indexHtml, "utf8");
  fileCount++;

  if (fs.existsSync(SONGS_SIG_PATH)) {
    totalBytes += copyTextFile(SONGS_SIG_PATH, "songs.sig");
    fileCount++;
  }

  const padWidth = catalog.runtime.slotPadWidth;

  for (const song of catalog.songs || []) {
    const songDirRel = `songs/${song.songId}`;
    const sourceSongPath = path.join(ROOT_DIR, songDirRel, "song.json");
    if (!fs.existsSync(sourceSongPath)) {
      throw new Error(`Missing source song.json for song ${song.songId}.`);
    }
    const sourceSong = JSON.parse(fs.readFileSync(sourceSongPath, "utf8"));
    if (sourceSong.runtimeSlot !== song.runtimeSlot) {
      throw new Error(`runtimeSlot mismatch for song ${song.songId}.`);
    }

    const slot = String(song.runtimeSlot).padStart(padWidth, "0");
    const runtimeRoot = `runtime/${slot}`;

    const audioSource = sourceSong.media?.audio?.path;
    const audioDest = `${runtimeRoot}/audio${song.media.audio.extension}`;
    totalBytes += copyAsset(audioSource, audioDest);
    fileCount++;

    if (song.media.background) {
      const backgroundSource = sourceSong.media?.background?.path;
      const backgroundDest = `${runtimeRoot}/background${song.media.background.extension}`;
      totalBytes += copyAsset(backgroundSource, backgroundDest);
      fileCount++;
    }

    const jacketSource = `${songDirRel}/jacket${song.jacket.extension}`;
    const jacketRuntimeDest = `${runtimeRoot}/jacket${song.jacket.extension}`;
    totalBytes += copyAsset(jacketSource, jacketRuntimeDest);
    fileCount++;

    // Preserve legacy Pages jacket URL while clients migrate to runtime slots.
    totalBytes += copyAsset(jacketSource, jacketSource);
    fileCount++;

    for (const chart of song.charts || []) {
      const chartSource = `${songDirRel}/charts/${chart.difficulty}.vmcchart`;
      const chartRuntimeDest = `${runtimeRoot}/charts/${chart.difficulty}.vmcchart`;
      totalBytes += copyAsset(chartSource, chartRuntimeDest);
      fileCount++;

      // Preserve legacy Pages chart URL while clients migrate to runtime slots.
      totalBytes += copyAsset(chartSource, chartSource);
      fileCount++;
    }
  }

  console.log(
    `Pages build completed: ${fileCount} files written to dist/ (${(totalBytes / 1024).toFixed(2)} KB), runtime assets addressed by fixed slots.`
  );
  console.log(`Catalog SHA-256: ${computeSha256(fs.readFileSync(SONGS_JSON_PATH))}`);
}

try {
  main();
} catch (err) {
  console.error("ERROR:", err.message);
  process.exit(1);
}
