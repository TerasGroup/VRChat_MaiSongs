import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, "dist");
const SONGS_JSON_PATH = path.join(ROOT_DIR, "songs.json");
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
    <p class="meta">${songCount} song(s), ${chartCount} chart(s).</p>
    <p>This GitHub Pages site publishes the machine-readable VMC song catalog and chart assets.</p>
    <p><a href="./songs.json">Open songs.json</a></p>
    <p><code>vmc-song-catalog/v1</code></p>
  </main>
</body>
</html>
`;
}

function copyAsset(relPath, expectedSha256) {
  const src = path.join(ROOT_DIR, relPath);
  const dest = path.join(DIST_DIR, relPath);

  if (!fs.existsSync(src)) {
    throw new Error(`Referenced asset missing: "${relPath}"`);
  }

  const data = fs.readFileSync(src);
  if (expectedSha256) {
    const actualSha256 = computeSha256(data);
    if (actualSha256 !== expectedSha256) {
      throw new Error(`SHA-256 mismatch for "${relPath}": expected ${expectedSha256}, got ${actualSha256}`);
    }
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data);
  return data.length;
}

function main() {
  if (!fs.existsSync(SONGS_JSON_PATH)) {
    console.error("ERROR: songs.json does not exist. Run 'npm run catalog' first.");
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(SONGS_JSON_PATH, "utf8"));

  // Clean and recreate dist directory
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Add .nojekyll to prevent GitHub Pages Jekyll processing
  fs.writeFileSync(path.join(DIST_DIR, ".nojekyll"), "");

  let totalBytes = 0;
  let fileCount = 0;

  // 1. Copy songs.json
  const songsJsonBytes = fs.readFileSync(SONGS_JSON_PATH);
  fs.writeFileSync(path.join(DIST_DIR, "songs.json"), songsJsonBytes);
  totalBytes += songsJsonBytes.length;
  fileCount++;

  // 2. Generate a lightweight landing page so the repository root does not return 404.
  const indexHtml = buildIndexHtml(catalog);
  fs.writeFileSync(path.join(DIST_DIR, "index.html"), indexHtml, "utf8");
  totalBytes += Buffer.byteLength(indexHtml, "utf8");
  fileCount++;

  // 3. Copy songs.sig if present
  if (fs.existsSync(SONGS_SIG_PATH)) {
    const sigBytes = fs.readFileSync(SONGS_SIG_PATH);
    fs.writeFileSync(path.join(DIST_DIR, "songs.sig"), sigBytes);
    totalBytes += sigBytes.length;
    fileCount++;
    console.log("Included songs.sig in distribution.");
  }

  // 4. Copy referenced jacket and chart assets only
  for (const song of catalog.songs || []) {
    if (song.jacket?.path) {
      const bytes = copyAsset(song.jacket.path, song.jacket.sha256);
      totalBytes += bytes;
      fileCount++;
    }
    for (const chart of song.charts || []) {
      if (chart.path) {
        const bytes = copyAsset(chart.path, chart.sha256);
        totalBytes += bytes;
        fileCount++;
      }
    }
  }

  console.log(
    `Pages build completed: ${fileCount} files copied to dist/ (${(totalBytes / 1024).toFixed(2)} KB).`
  );
}

main();
