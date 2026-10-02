# VMC Song Pack Repository

This repository is the version-controlled source of truth for VMC song metadata and chart assets, designed according to the **VMC Song Pack GitHub Repository Design v1**.

It uses GitHub Pages for lightweight metadata (`songs.json`), chart files (`*.vmcchart`), and jacket images. Audio should stay on an external CDN/object store; background media may currently be hosted on GitHub via a direct HTTPS URL.

---

## 📁 Repository Structure

```text
.
├─ repo.config.json            # Repository identity, publication URL, and limits
├─ songs.json                  # Generated catalog consumed by clients (committed)
├─ songs.sig                   # Ed25519 signature generated in CI when configured
├─ package.json                # Scripts and dependencies
├─ package-lock.json           # Locked dependencies
├─ scripts/
│  ├─ generate-catalog.mjs     # Generates songs.json and performs strict checks
│  ├─ sign-catalog.mjs         # Signs songs.json with Ed25519 key (if secret exists)
│  └─ build-pages.mjs          # Builds dist/ containing only catalog-referenced assets
├─ schemas/
│  ├─ song-source.schema.json  # JSON schema for human-maintained song.json
│  └─ songs.schema.json        # JSON schema for generated songs.json
├─ backgrounds/                 # Optional GitHub-hosted background media; keep outside songs/
│  └─ <songId>.<ext>
├─ songs/
│  └─ <songId>/                # Exactly positive decimal songId (e.g. 10001)
│     ├─ song.json             # Song metadata and charts configuration
│     ├─ jacket.webp           # Exactly one jacket file (.webp/.png/.jpg/.jpeg)
│     └─ charts/
│        ├─ 4.vmcchart         # Chart file for difficulty 4
│        └─ 5.vmcchart         # Chart file for difficulty 5
└─ .github/workflows/
   ├─ catalog-check.yml        # CI check for PRs and pushes to main
   ├─ pages.yml                # GitHub Pages deployment and catalog signing
   └─ update-catalog.yml       # Manual workflow dispatch to regenerate catalog
```

---

## 🚀 Quick Start & Scripts

### 1. Install Dependencies

```bash
npm install
```

### 2. Generate Catalog

When you add or update songs/charts under `songs/`:

```bash
npm run catalog
```

This derives all paths, file sizes, and SHA-256 hashes, updating root `songs.json`.

### 3. Check Catalog (CI Mode)

Verify that `songs.json` is fresh and all integrity rules pass:

```bash
npm run catalog:check
```

### 4. Build GitHub Pages Distribution

Assemble the `dist/` directory containing only the catalog and its referenced assets:

```bash
npm run pages:build
```

### 5. Ed25519 Catalog Signing (Optional)

Generate keypair locally:

```bash
node scripts/sign-catalog.mjs --generate-keypair
```

To sign automatically in GitHub Actions, add the private key PEM as a secret named `VMC_CATALOG_PRIVATE_KEY_PEM`. To verify:

```bash
node scripts/sign-catalog.mjs --verify <path-to-public-key.pem>
```

---

## Import directly from VRChat_Mai_Convertor

Converter v0.3.0 can create a complete `songs/<songId>/` package and regenerate this repository's catalog in one command:

```powershell
node bin/vmc-convert.js pack "E:\Songs\maidata.txt" `
  --song-id 10001 `
  --jacket "E:\Songs\bg.png" `
  --audio-url "https://r2.example/audio/10001.ogg" `
  --background-url "https://raw.githubusercontent.com/TerasGroup/VRChat_MaiSongs/main/backgrounds/10001.mp4" `
  --maisongs-root "E:\VRChat_MaiSongs" `
  --catalog
```

The converter derives title, artist, BPM, chart levels and designers from maidata, writes numeric chart filenames, and uses deterministic chart IDs such as `100015` for song `10001` MASTER slot `5`.

### GitHub-hosted backgrounds

For the current setup, background images/videos may be committed under the repository-level `backgrounds/` directory and referenced using a direct HTTPS URL such as `raw.githubusercontent.com`. Do not use a normal `github.com/.../blob/...` page URL because that returns HTML rather than the media bytes.

Keep background media outside `songs/`: the catalog validator intentionally rejects audio/video files inside song directories.

---

## 📋 Contribution Rules

1. **No Audio/Video Under `songs/`**: Never commit `.mp3`, `.wav`, `.mp4` or other audio/video files under `songs/`. Audio stays external; GitHub-hosted backgrounds belong under repository-level `backgrounds/`. All media URLs must use `https://`.
2. **Deterministic Folder Naming**: Song folder names must strictly match the decimal `songId` with no prefixes or suffixes.
3. **One Jacket File**: Exactly one jacket file named `jacket.webp`, `jacket.png`, `jacket.jpg`, or `jacket.jpeg` per song directory.
4. **Strict Chart Naming**: Chart files must be named `1.vmcchart` through `7.vmcchart`, and every chart file must have a matching entry in `song.json.charts`.
5. **Always Regenerate Before Committing**: Run `npm run catalog` and commit the updated `songs.json` in your PR.
