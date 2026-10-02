# VMC Song Pack Repository

This repository is the version-controlled source of truth for VMC song metadata and chart assets, designed according to the **VMC Song Pack GitHub Repository Design v1**.

It intentionally uses GitHub Pages for lightweight metadata (`songs.json`), chart files (`*.vmcchart`), and jacket images, while hosting heavy audio/video media on external CDNs/object storage.

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

## 📋 Contribution Rules

1. **Remote Audio/Video Only**: Never commit `.mp3`, `.wav`, `.mp4` or other large media files under `songs/`. Remote URLs must use `https://`.
2. **Deterministic Folder Naming**: Song folder names must strictly match the decimal `songId` with no prefixes or suffixes.
3. **One Jacket File**: Exactly one jacket file named `jacket.webp`, `jacket.png`, `jacket.jpg`, or `jacket.jpeg` per song directory.
4. **Strict Chart Naming**: Chart files must be named `1.vmcchart` through `7.vmcchart`, and every chart file must have a matching entry in `song.json.charts`.
5. **Always Regenerate Before Committing**: Run `npm run catalog` and commit the updated `songs.json` in your PR.
