import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT_DIR = process.cwd();
const SONGS_DIR = path.join(ROOT_DIR, "songs");
const REPO_CONFIG_PATH = path.join(ROOT_DIR, "repo.config.json");
const SONGS_SCHEMA_PATH = path.join(ROOT_DIR, "schemas", "songs.schema.json");
const SONG_SOURCE_SCHEMA_PATH = path.join(ROOT_DIR, "schemas", "song-source.schema.json");
const TARGET_SONGS_JSON_PATH = path.join(ROOT_DIR, "songs.json");

const isCheckMode = process.argv.includes("--check");

async function initValidator() {
  try {
    const Ajv2020Module = await import("ajv/dist/2020.js");
    const AjvFormatsModule = await import("ajv-formats");
    const Ajv2020 = Ajv2020Module.default || Ajv2020Module;
    const addFormats = AjvFormatsModule.default || AjvFormatsModule;

    const ajv = new Ajv2020({ allErrors: true });
    addFormats(ajv);

    const songSourceSchema = JSON.parse(fs.readFileSync(SONG_SOURCE_SCHEMA_PATH, "utf8"));
    const songsSchema = JSON.parse(fs.readFileSync(SONGS_SCHEMA_PATH, "utf8"));

    const validateSongSource = ajv.compile(songSourceSchema);
    const validateCatalog = ajv.compile(songsSchema);

    return { validateSongSource, validateCatalog };
  } catch (err) {
    console.warn("WARNING: Schema validation disabled:", err.message);
    return null;
  }
}

function computeSha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function scanForbiddenMediaFiles(dirPath, forbiddenExts) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      scanForbiddenMediaFiles(fullPath, forbiddenExts);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (forbiddenExts.includes(ext)) {
        throw new Error(
          `Forbidden local audio/video file found at "${path.relative(ROOT_DIR, fullPath).replace(/\\/g, "/")}". ` +
            `Audio and video must be hosted remotely; do not commit media files to the repository.`
        );
      }
    }
  }
}

async function main() {
  if (!fs.existsSync(REPO_CONFIG_PATH)) {
    throw new Error("Missing repo.config.json in repository root.");
  }

  const repoConfig = JSON.parse(fs.readFileSync(REPO_CONFIG_PATH, "utf8"));
  const limits = repoConfig.limits || {};
  const maxChartBytes = limits.maxChartBytes ?? 5 * 1024 * 1024;
  const maxJacketBytes = limits.maxJacketBytes ?? 2 * 1024 * 1024;
  const allowedJacketExtensions = limits.allowedJacketExtensions || [".webp", ".png", ".jpg", ".jpeg"];
  const forbiddenMediaExtensions = limits.forbiddenMediaExtensions || [
    ".mp3", ".ogg", ".wav", ".flac", ".aac", ".m4a", ".mp4", ".webm", ".mkv", ".avi", ".mov"
  ];

  const validators = await initValidator();

  // 1. Scan for forbidden media files under songs/
  scanForbiddenMediaFiles(SONGS_DIR, forbiddenMediaExtensions);

  if (!fs.existsSync(SONGS_DIR)) {
    fs.mkdirSync(SONGS_DIR, { recursive: true });
  }

  const songDirEntries = fs.readdirSync(SONGS_DIR, { withFileTypes: true });
  const seenSongIds = new Set();
  const seenChartIds = new Map(); // chartId -> { songId, difficulty }
  const songs = [];

  for (const dirEntry of songDirEntries) {
    if (!dirEntry.isDirectory()) {
      continue;
    }

    const dirName = dirEntry.name;

    // Check directory name is strictly decimal integer without leading zeroes
    if (!/^[1-9]\d*$/.test(dirName)) {
      throw new Error(
        `Invalid song directory name "${dirName}". Directory name must be strictly a positive decimal songId without leading zeroes.`
      );
    }

    const expectedSongId = Number.parseInt(dirName, 10);
    if (expectedSongId <= 0 || expectedSongId > 2147483647) {
      throw new Error(`Directory name "${dirName}" exceeds 32-bit positive integer range.`);
    }

    const currentSongDir = path.join(SONGS_DIR, dirName);
    const songJsonPath = path.join(currentSongDir, "song.json");

    if (!fs.existsSync(songJsonPath)) {
      throw new Error(`Missing song.json in "${path.relative(ROOT_DIR, currentSongDir).replace(/\\/g, "/")}".`);
    }

    let songData;
    try {
      songData = JSON.parse(fs.readFileSync(songJsonPath, "utf8"));
    } catch (err) {
      throw new Error(`Failed to parse ${songJsonPath}: ${err.message}`);
    }

    // Reject directory name differing from songId
    if (dirName !== songData.songId.toString()) {
      throw new Error(
        `Directory name "${dirName}" differs from songId ${songData.songId} in ${songJsonPath}.`
      );
    }

    // Reject duplicate song IDs
    if (seenSongIds.has(songData.songId)) {
      throw new Error(`Duplicate songId ${songData.songId} found in "${dirName}".`);
    }
    seenSongIds.add(songData.songId);

    // Validate song.json with schema if validator available
    if (validators?.validateSongSource) {
      const valid = validators.validateSongSource(songData);
      if (!valid) {
        throw new Error(
          `Schema validation failed for ${songJsonPath}:\n` +
            validators.validateSongSource.errors.map((e) => `  ${e.instancePath} ${e.message}`).join("\n")
        );
      }
    }

    // Check remote media URLs are HTTPS
    if (!songData.media?.audio?.url || !songData.media.audio.url.startsWith("https://")) {
      throw new Error(
        `Non-HTTPS remote audio URL in song ${songData.songId}: "${songData.media?.audio?.url}". HTTPS is required.`
      );
    }
    if (songData.media?.background?.url && !songData.media.background.url.startsWith("https://")) {
      throw new Error(
        `Non-HTTPS remote background URL in song ${songData.songId}: "${songData.media.background.url}". HTTPS is required.`
      );
    }

    // Check jacket files in song directory
    const songFiles = fs.readdirSync(currentSongDir, { withFileTypes: true });
    const jacketFiles = songFiles.filter((f) => {
      if (!f.isFile()) return false;
      const lower = f.name.toLowerCase();
      const ext = path.extname(lower);
      const base = path.basename(lower, ext);
      return base === "jacket" && allowedJacketExtensions.includes(ext);
    });

    if (jacketFiles.length === 0) {
      throw new Error(
        `Missing jacket file in song ${songData.songId}. Exactly one jacket.${allowedJacketExtensions.join("/")} must exist.`
      );
    }
    if (jacketFiles.length > 1) {
      throw new Error(
        `Duplicate jacket files in song ${songData.songId}: ${jacketFiles.map((f) => f.name).join(", ")}. Exactly one is allowed.`
      );
    }

    const jacketFileName = jacketFiles[0].name;
    const jacketFilePath = path.join(currentSongDir, jacketFileName);
    const jacketBuffer = fs.readFileSync(jacketFilePath);
    if (jacketBuffer.length > maxJacketBytes) {
      throw new Error(
        `Jacket file "${jacketFilePath}" exceeds max size of ${maxJacketBytes} bytes (actual: ${jacketBuffer.length}).`
      );
    }

    const jacketRelPath = `songs/${dirName}/${jacketFileName}`;
    const jacketUrl = `${repoConfig.publicBaseUrl.replace(/\/+$/, "")}/${jacketRelPath}`;
    const jacketObj = {
      path: jacketRelPath,
      url: jacketUrl,
      bytes: jacketBuffer.length,
      sha256: computeSha256(jacketBuffer)
    };

    // Check charts directory
    const chartsDir = path.join(currentSongDir, "charts");
    if (!fs.existsSync(chartsDir)) {
      throw new Error(`Missing charts directory in song ${songData.songId} ("${chartsDir}").`);
    }

    const chartFileEntries = fs.readdirSync(chartsDir, { withFileTypes: true });
    const chartFilesOnDisk = new Map(); // difficulty number -> filename

    for (const fileEntry of chartFileEntries) {
      if (!fileEntry.isFile()) continue;
      const match = /^([1-7])\.vmcchart$/.exec(fileEntry.name);
      if (!match) {
        throw new Error(
          `Invalid chart filename "${fileEntry.name}" in songs/${dirName}/charts/. Chart files must be named strictly 1.vmcchart to 7.vmcchart.`
        );
      }
      chartFilesOnDisk.set(Number.parseInt(match[1], 10), fileEntry.name);
    }

    const metadataChartKeys = Object.keys(songData.charts || {});
    if (metadataChartKeys.length === 0) {
      throw new Error(`Song ${songData.songId} has no charts defined in song.json.`);
    }

    // Check chart metadata without matching file
    for (const key of metadataChartKeys) {
      const diffNum = Number.parseInt(key, 10);
      if (Number.isNaN(diffNum) || diffNum < 1 || diffNum > 7) {
        throw new Error(`Invalid chart difficulty key "${key}" in song ${songData.songId}. Must be 1 to 7.`);
      }
      if (!chartFilesOnDisk.has(diffNum)) {
        throw new Error(
          `Chart difficulty "${key}" defined in song ${songData.songId} but file "charts/${key}.vmcchart" does not exist.`
        );
      }
    }

    // Check chart files without matching metadata
    for (const [diffNum, filename] of chartFilesOnDisk.entries()) {
      if (!songData.charts[diffNum.toString()]) {
        throw new Error(
          `Chart file "${filename}" exists in songs/${dirName}/charts/ but is not defined in song.json.charts.`
        );
      }
    }

    // Build chart entries
    const chartsList = [];
    const sortedDifficulties = Array.from(chartFilesOnDisk.keys()).sort((a, b) => a - b);

    for (const diffNum of sortedDifficulties) {
      const diffKey = diffNum.toString();
      const chartMeta = songData.charts[diffKey];
      const chartFileName = chartFilesOnDisk.get(diffNum);
      const chartFilePath = path.join(chartsDir, chartFileName);
      const chartBuffer = fs.readFileSync(chartFilePath);

      if (chartBuffer.length > maxChartBytes) {
        throw new Error(
          `Chart file "${chartFilePath}" exceeds max size of ${maxChartBytes} bytes (actual: ${chartBuffer.length}).`
        );
      }

      // Check duplicate chartId across entire repository
      if (seenChartIds.has(chartMeta.chartId)) {
        const prev = seenChartIds.get(chartMeta.chartId);
        throw new Error(
          `Duplicate chartId ${chartMeta.chartId} found in song ${songData.songId} (diff ${diffNum}), already used by song ${prev.songId} (diff ${prev.difficulty}).`
        );
      }
      seenChartIds.set(chartMeta.chartId, { songId: songData.songId, difficulty: diffNum });

      const chartRelPath = `songs/${dirName}/charts/${chartFileName}`;
      const chartUrl = `${repoConfig.publicBaseUrl.replace(/\/+$/, "")}/${chartRelPath}`;

      chartsList.push({
        chartId: chartMeta.chartId,
        difficulty: diffNum,
        level: chartMeta.level,
        designer: chartMeta.designer,
        version: chartMeta.version,
        path: chartRelPath,
        url: chartUrl,
        bytes: chartBuffer.length,
        sha256: computeSha256(chartBuffer)
      });
    }

    songs.push({
      songId: songData.songId,
      version: songData.version,
      enabled: songData.enabled,
      title: songData.title,
      artist: songData.artist,
      bpm: songData.bpm,
      genre: songData.genre,
      tags: songData.tags,
      media: songData.media,
      jacket: jacketObj,
      charts: chartsList
    });
  }

  // Sort songs ascending by songId
  songs.sort((a, b) => a.songId - b.songId);

  const totalCharts = songs.reduce((acc, song) => acc + song.charts.length, 0);

  const catalog = {
    schema: "vmc-song-catalog/v1",
    schemaVersion: 1,
    catalogVersion: repoConfig.catalogVersion ?? 1,
    publicBaseUrl: repoConfig.publicBaseUrl,
    pack: {
      packId: repoConfig.pack.packId,
      name: repoConfig.pack.name,
      version: repoConfig.pack.version,
      description: repoConfig.pack.description
    },
    songCount: songs.length,
    chartCount: totalCharts,
    songs,
    catalogSha256: ""
  };

  // Compute catalogSha256 over deterministic JSON representation (without catalogSha256 field)
  const contentToHash = JSON.stringify({ ...catalog, catalogSha256: undefined }, null, 2);
  const catalogSha256 = crypto.createHash("sha256").update(contentToHash, "utf8").digest("hex");
  catalog.catalogSha256 = catalogSha256;

  const generatedJsonString = JSON.stringify(catalog, null, 2) + "\n";

  // Validate generated catalog against schema if validator available
  if (validators?.validateCatalog) {
    const valid = validators.validateCatalog(catalog);
    if (!valid) {
      throw new Error(
        `Generated catalog failed schema validation:\n` +
          validators.validateCatalog.errors.map((e) => `  ${e.instancePath} ${e.message}`).join("\n")
      );
    }
  }

  if (isCheckMode) {
    if (!fs.existsSync(TARGET_SONGS_JSON_PATH)) {
      console.error("ERROR: songs.json does not exist. Run 'npm run catalog' to generate it.");
      process.exit(1);
    }

    const existingContent = fs.readFileSync(TARGET_SONGS_JSON_PATH, "utf8");
    // Normalize CRLF to LF for reliable cross-platform comparison
    const normExisting = existingContent.replace(/\r\n/g, "\n");
    const normGenerated = generatedJsonString.replace(/\r\n/g, "\n");

    if (normExisting !== normGenerated) {
      console.error(
        "ERROR: songs.json is out of date or does not match generated catalog.\n" +
          "Run 'npm run catalog' locally, review the changes, and commit the updated songs.json."
      );
      process.exit(1);
    }

    console.log(
      `Catalog check passed: songs.json is up-to-date and valid (${songs.length} songs, ${totalCharts} charts, catalogSha256: ${catalogSha256}).`
    );
  } else {
    fs.writeFileSync(TARGET_SONGS_JSON_PATH, generatedJsonString, "utf8");
    console.log(
      `Successfully generated songs.json (${songs.length} songs, ${totalCharts} charts, catalogSha256: ${catalogSha256}).`
    );
  }
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
