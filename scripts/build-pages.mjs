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

  // 2. Copy songs.sig if present
  if (fs.existsSync(SONGS_SIG_PATH)) {
    const sigBytes = fs.readFileSync(SONGS_SIG_PATH);
    fs.writeFileSync(path.join(DIST_DIR, "songs.sig"), sigBytes);
    totalBytes += sigBytes.length;
    fileCount++;
    console.log("Included songs.sig in distribution.");
  }

  // 3. Copy referenced jacket and chart assets only
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
