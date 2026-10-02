import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT_DIR = process.cwd();
const SONGS_DIR = path.join(ROOT_DIR, "songs");
const REPO_CONFIG_PATH = path.join(ROOT_DIR, "repo.config.json");
const SONGS_SCHEMA_PATH = path.join(ROOT_DIR, "schemas", "songs.schema.json");
const SONG_SOURCE_SCHEMA_PATH = path.join(ROOT_DIR, "schemas", "song-source.schema.json");
const TARGET_SONGS_JSON_PATH = path.join(ROOT_DIR, "songs.json");
const TARGET_RUNTIME_REGISTRY_PATH = path.join(ROOT_DIR, "runtime-url-registry.json");

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

    return {
      validateSongSource: ajv.compile(songSourceSchema),
      validateCatalog: ajv.compile(songsSchema),
    };
  } catch (err) {
    console.warn("WARNING: Schema validation disabled:", err.message);
    return null;
  }
}

function computeSha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function normalizeExt(value) {
  const ext = String(value || "").toLowerCase();
  return ext.startsWith(".") ? ext : `.${ext}`;
}

function safeRepoPath(relPath, label) {
  if (!relPath || path.isAbsolute(relPath) || relPath.includes("\\")) {
    throw new Error(`${label} must be a forward-slash repository-relative path, got "${relPath}".`);
  }
  const full = path.resolve(ROOT_DIR, relPath);
  const rootPrefix = ROOT_DIR.endsWith(path.sep) ? ROOT_DIR : ROOT_DIR + path.sep;
  if (full !== ROOT_DIR && !full.startsWith(rootPrefix)) {
    throw new Error(`${label} escapes the repository root: "${relPath}".`);
  }
  return full;
}

function requireFile(relPath, label) {
  const full = safeRepoPath(relPath, label);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    throw new Error(`${label} does not exist: "${relPath}".`);
  }
  return full;
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
          `Forbidden audio/video file found under songs/: "${path.relative(ROOT_DIR, fullPath).replace(/\\/g, "/")}". ` +
          "Runtime media belongs outside songs/ and is mapped into fixed runtime slots during Pages build."
        );
      }
    }
  }
}

function variantFor(ext, extensions, label) {
  const normalized = normalizeExt(ext);
  const index = extensions.indexOf(normalized);
  if (index < 0) {
    throw new Error(
      `${label} extension "${normalized}" is not pre-registered. Allowed variants: ${extensions.join(", ")}`
    );
  }
  return { variant: index, extension: normalized };
}

function findJacket(songDir, allowedExtensions) {
  const matches = fs.readdirSync(songDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => {
      const ext = path.extname(entry.name).toLowerCase();
      return path.basename(entry.name, ext).toLowerCase() === "jacket" && allowedExtensions.includes(ext);
    });

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one jacket file in "${path.relative(ROOT_DIR, songDir).replace(/\\/g, "/")}", found ${matches.length}.`
    );
  }
  return matches[0].name;
}

function buildRuntimeRegistry(repoConfig) {
  const runtime = repoConfig.runtime;
  const base = repoConfig.publicBaseUrl.replace(/\/+$/, "");
  return {
    schema: "vmc-runtime-url-registry/v1",
    version: 1,
    baseUrl: base,
    catalogUrl: `${base}/songs.json`,
    slotCount: runtime.slotCount,
    slotPadWidth: runtime.slotPadWidth,
    arrays: {
      audio: {
        variantCount: runtime.audioExtensions.length,
        extensions: runtime.audioExtensions,
        urlTemplate: `${base}/runtime/{slot}/audio{ext}`,
        runtimeIndex: "runtimeSlot * variantCount + variant",
      },
      backgroundVideo: {
        variantCount: runtime.backgroundVideoExtensions.length,
        extensions: runtime.backgroundVideoExtensions,
        urlTemplate: `${base}/runtime/{slot}/background{ext}`,
        runtimeIndex: "runtimeSlot * variantCount + variant",
      },
      backgroundImage: {
        variantCount: runtime.backgroundImageExtensions.length,
        extensions: runtime.backgroundImageExtensions,
        urlTemplate: `${base}/runtime/{slot}/background{ext}`,
        runtimeIndex: "runtimeSlot * variantCount + variant",
      },
      jacket: {
        variantCount: runtime.jacketExtensions.length,
        extensions: runtime.jacketExtensions,
        urlTemplate: `${base}/runtime/{slot}/jacket{ext}`,
        runtimeIndex: "runtimeSlot * variantCount + variant",
      },
      chart: {
        difficultyCount: runtime.chartDifficulties.length,
        difficulties: runtime.chartDifficulties,
        urlTemplate: `${base}/runtime/{slot}/charts/{difficulty}.vmcchart`,
        runtimeIndex: "runtimeSlot * difficultyCount + (difficulty - 1)",
      },
    },
  };
}

function serialize(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function assertFresh(targetPath, expectedText, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} is missing. Run npm run catalog.`);
  }
  const actual = fs.readFileSync(targetPath, "utf8");
  if (actual !== expectedText) {
    throw new Error(`${label} is stale. Run npm run catalog and commit the result.`);
  }
}

async function main() {
  if (!fs.existsSync(REPO_CONFIG_PATH)) {
    throw new Error("Missing repo.config.json in repository root.");
  }

  const repoConfig = JSON.parse(fs.readFileSync(REPO_CONFIG_PATH, "utf8"));
  const runtime = repoConfig.runtime;
  if (!runtime || !Number.isInteger(runtime.slotCount) || runtime.slotCount < 1) {
    throw new Error("repo.config.json runtime.slotCount must be a positive integer.");
  }

  const limits = repoConfig.limits || {};
  const maxChartBytes = limits.maxChartBytes ?? 5 * 1024 * 1024;
  const maxJacketBytes = limits.maxJacketBytes ?? 2 * 1024 * 1024;
  const allowedJacketExtensions = (limits.allowedJacketExtensions || [".webp", ".png", ".jpg", ".jpeg"]).map(normalizeExt);
  const forbiddenMediaExtensions = (limits.forbiddenMediaExtensions || []).map(normalizeExt);

  const audioExtensions = runtime.audioExtensions.map(normalizeExt);
  const backgroundVideoExtensions = runtime.backgroundVideoExtensions.map(normalizeExt);
  const backgroundImageExtensions = runtime.backgroundImageExtensions.map(normalizeExt);
  const jacketExtensions = runtime.jacketExtensions.map(normalizeExt);
  const chartDifficulties = runtime.chartDifficulties;

  const validators = await initValidator();

  scanForbiddenMediaFiles(SONGS_DIR, forbiddenMediaExtensions);
  if (!fs.existsSync(SONGS_DIR)) fs.mkdirSync(SONGS_DIR, { recursive: true });

  const seenSongIds = new Set();
  const seenChartIds = new Map();
  const seenRuntimeSlots = new Map();
  const songs = [];
  let chartCount = 0;

  const songDirs = fs.readdirSync(SONGS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => Number(a.name) - Number(b.name));

  for (const dirEntry of songDirs) {
    const dirName = dirEntry.name;
    if (!/^[1-9]\d*$/.test(dirName)) {
      throw new Error(`Invalid song directory name "${dirName}".`);
    }

    const songDir = path.join(SONGS_DIR, dirName);
    const songJsonPath = path.join(songDir, "song.json");
    if (!fs.existsSync(songJsonPath)) throw new Error(`Missing song.json in songs/${dirName}.`);

    const songData = JSON.parse(fs.readFileSync(songJsonPath, "utf8"));
    if (validators?.validateSongSource && !validators.validateSongSource(songData)) {
      throw new Error(
        `Schema validation failed for songs/${dirName}/song.json:\n` +
        validators.validateSongSource.errors.map((e) => `  ${e.instancePath} ${e.message}`).join("\n")
      );
    }

    if (String(songData.songId) !== dirName) {
      throw new Error(`Directory songs/${dirName} does not match songId ${songData.songId}.`);
    }
    if (seenSongIds.has(songData.songId)) throw new Error(`Duplicate songId ${songData.songId}.`);
    seenSongIds.add(songData.songId);

    if (!Number.isInteger(songData.runtimeSlot) || songData.runtimeSlot < 0 || songData.runtimeSlot >= runtime.slotCount) {
      throw new Error(
        `Song ${songData.songId} runtimeSlot ${songData.runtimeSlot} is outside 0..${runtime.slotCount - 1}.`
      );
    }
    if (seenRuntimeSlots.has(songData.runtimeSlot)) {
      throw new Error(
        `runtimeSlot ${songData.runtimeSlot} is used by both song ${seenRuntimeSlots.get(songData.runtimeSlot)} and song ${songData.songId}.`
      );
    }
    seenRuntimeSlots.set(songData.runtimeSlot, songData.songId);

    const audioPath = songData.media?.audio?.path;
    const audioFull = requireFile(audioPath, `Song ${songData.songId} audio path`);
    const audioExt = path.extname(audioFull).toLowerCase();
    const audioVariant = variantFor(audioExt, audioExtensions, `Song ${songData.songId} audio`);

    let backgroundCatalog;
    if (songData.media?.background) {
      const bgPath = songData.media.background.path;
      const bgFull = requireFile(bgPath, `Song ${songData.songId} background path`);
      const bgExt = path.extname(bgFull).toLowerCase();
      const bgExtensions = songData.media.background.type === "video"
        ? backgroundVideoExtensions
        : backgroundImageExtensions;
      backgroundCatalog = {
        type: songData.media.background.type,
        ...variantFor(bgExt, bgExtensions, `Song ${songData.songId} background`),
      };
    }

    const jacketFileName = findJacket(songDir, allowedJacketExtensions);
    const jacketFull = path.join(songDir, jacketFileName);
    const jacketBytes = fs.statSync(jacketFull).size;
    if (jacketBytes <= 0 || jacketBytes > maxJacketBytes) {
      throw new Error(
        `Song ${songData.songId} jacket size ${jacketBytes} is outside 1..${maxJacketBytes} bytes.`
      );
    }
    const jacketExt = path.extname(jacketFileName).toLowerCase();
    const jacketVariant = variantFor(jacketExt, jacketExtensions, `Song ${songData.songId} jacket`);

    const chartsDir = path.join(songDir, "charts");
    if (!fs.existsSync(chartsDir)) throw new Error(`Missing charts/ in song ${songData.songId}.`);

    const chartFiles = fs.readdirSync(chartsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^[1-7]\.vmcchart$/.test(entry.name));
    const chartFileDifficulties = new Set(chartFiles.map((entry) => Number(path.basename(entry.name, ".vmcchart"))));

    const charts = [];
    for (const [difficultyKey, chartMeta] of Object.entries(songData.charts || {})) {
      const difficulty = Number(difficultyKey);
      if (!chartDifficulties.includes(difficulty)) {
        throw new Error(`Song ${songData.songId} chart difficulty ${difficulty} is not pre-registered.`);
      }
      const chartPath = path.join(chartsDir, `${difficulty}.vmcchart`);
      if (!fs.existsSync(chartPath)) {
        throw new Error(`Song ${songData.songId} metadata references missing chart ${difficulty}.vmcchart.`);
      }
      const bytes = fs.statSync(chartPath).size;
      if (bytes <= 0 || bytes > maxChartBytes) {
        throw new Error(
          `Song ${songData.songId} chart ${difficulty} size ${bytes} is outside 1..${maxChartBytes} bytes.`
        );
      }
      if (seenChartIds.has(chartMeta.chartId)) {
        const other = seenChartIds.get(chartMeta.chartId);
        throw new Error(
          `Duplicate chartId ${chartMeta.chartId}: song ${other.songId}/difficulty ${other.difficulty} and song ${songData.songId}/difficulty ${difficulty}.`
        );
      }
      seenChartIds.set(chartMeta.chartId, { songId: songData.songId, difficulty });
      chartFileDifficulties.delete(difficulty);
      charts.push({
        chartId: chartMeta.chartId,
        difficulty,
        level: chartMeta.level,
        designer: chartMeta.designer,
        version: chartMeta.version,
      });
      chartCount++;
    }

    if (chartFileDifficulties.size) {
      throw new Error(
        `Song ${songData.songId} has chart files without metadata: ${[...chartFileDifficulties].sort().join(", ")}.`
      );
    }
    charts.sort((a, b) => a.difficulty - b.difficulty);

    const media = { audio: audioVariant };
    if (backgroundCatalog) media.background = backgroundCatalog;

    songs.push({
      songId: songData.songId,
      runtimeSlot: songData.runtimeSlot,
      version: songData.version,
      enabled: songData.enabled,
      title: songData.title,
      artist: songData.artist,
      bpm: songData.bpm,
      genre: songData.genre,
      tags: songData.tags,
      media,
      jacket: jacketVariant,
      charts,
    });
  }

  songs.sort((a, b) => a.songId - b.songId);

  const baseUrl = repoConfig.publicBaseUrl.replace(/\/+$/, "");
  const runtimeRegistry = buildRuntimeRegistry(repoConfig);
  const catalogBase = {
    schema: "vmc-song-catalog/v2",
    schemaVersion: 2,
    catalogVersion: repoConfig.catalogVersion,
    publicBaseUrl: baseUrl,
    pack: repoConfig.pack,
    runtime: {
      slotCount: runtime.slotCount,
      slotPadWidth: runtime.slotPadWidth,
      registryUrl: `${baseUrl}/runtime-url-registry.json`,
      audioExtensions,
      backgroundVideoExtensions,
      backgroundImageExtensions,
      jacketExtensions,
      chartDifficulties,
    },
    songCount: songs.length,
    chartCount,
    songs,
  };
  const catalog = {
    ...catalogBase,
    catalogSha256: computeSha256(Buffer.from(JSON.stringify(catalogBase), "utf8")),
  };

  if (validators?.validateCatalog && !validators.validateCatalog(catalog)) {
    throw new Error(
      "Generated catalog schema validation failed:\n" +
      validators.validateCatalog.errors.map((e) => `  ${e.instancePath} ${e.message}`).join("\n")
    );
  }

  const catalogText = serialize(catalog);
  const registryText = serialize(runtimeRegistry);

  if (isCheckMode) {
    assertFresh(TARGET_SONGS_JSON_PATH, catalogText, "songs.json");
    assertFresh(TARGET_RUNTIME_REGISTRY_PATH, registryText, "runtime-url-registry.json");
    console.log(
      `Catalog check passed: ${songs.length} songs, ${chartCount} charts, ${seenRuntimeSlots.size}/${runtime.slotCount} runtime slots used.`
    );
    return;
  }

  fs.writeFileSync(TARGET_SONGS_JSON_PATH, catalogText, "utf8");
  fs.writeFileSync(TARGET_RUNTIME_REGISTRY_PATH, registryText, "utf8");
  console.log(
    `Generated songs.json and runtime-url-registry.json: ${songs.length} songs, ${chartCount} charts, ${seenRuntimeSlots.size}/${runtime.slotCount} runtime slots used.`
  );
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
