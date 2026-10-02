# VMC Song Pack Repository v2

This repository is the version-controlled source of truth for VRChat maimai song metadata, VMC charts, and test media.

The v2 runtime model is designed around a VRChat/Udon constraint: **runtime code never constructs a `VRCUrl` from a downloaded string**. Instead, Unity pre-registers a fixed URL registry before the World is uploaded. The online catalog only tells Udon which numeric slot and variant to select.

## Runtime model

```text
songId 10023
     │
     └── runtimeSlot 7
              │
              ├── audio variant
              ├── background type + variant
              ├── jacket variant
              └── chart difficulty
                       │
                       ▼
              pre-registered VRCUrl[]
```

The default capacity is **512 runtime slots**. The capacity and supported file variants are defined in `repo.config.json`.

For example slot 7 is published by GitHub Pages under stable paths such as:

```text
https://terasgroup.github.io/VRChat_MaiSongs/runtime/0007/audio.ogg
https://terasgroup.github.io/VRChat_MaiSongs/runtime/0007/background.mp4
https://terasgroup.github.io/VRChat_MaiSongs/runtime/0007/jacket.png
https://terasgroup.github.io/VRChat_MaiSongs/runtime/0007/charts/5.vmcchart
```

These strings are generated/serialized in the **Unity Editor**, not created by Udon at runtime.

## Repository structure

```text
.
├─ repo.config.json
├─ songs.json                       # generated runtime catalog v2
├─ runtime-url-registry.json        # generated Unity Editor URL registry definition
├─ songs.sig
├─ media/
│  ├─ audio/
│  │  └─ <songId>.<ext>
│  └─ backgrounds/
│     └─ <songId>.<ext>
├─ songs/
│  └─ <songId>/
│     ├─ song.json                  # source metadata, includes runtimeSlot
│     ├─ jacket.<ext>
│     └─ charts/
│        ├─ 1.vmcchart
│        └─ ...
├─ scripts/
│  ├─ generate-catalog.mjs
│  ├─ build-pages.mjs
│  └─ sign-catalog.mjs
└─ schemas/
   ├─ song-source.schema.json
   └─ songs.schema.json
```

The source repository keeps assets grouped by `songId`. During Pages build, `build-pages.mjs` creates fixed runtime aliases under `dist/runtime/<slot>/...`. Existing source files therefore do not need to be physically moved when a slot is assigned.

## Import from VRChat_Mai_Convertor

Converter v0.5.0 is the recommended entry point:

```powershell
node bin/vmc-convert.js import "E:\Songs\THE IDOLM@STER" `
  --maisongs-root "E:\VRCHAT\maimai\VRChat_MaiSongs" `
  --catalog
```

The importer automatically:

- finds `maidata.txt`, jacket, audio and background media;
- allocates the next `songId` when omitted;
- allocates the first free `runtimeSlot` in `0..511`;
- preserves the existing runtime slot when the same song is re-imported with `--force`;
- copies audio to `media/audio/<songId>.<ext>`;
- copies background to `media/backgrounds/<songId>.<ext>`;
- writes `runtimeSlot` and repository-relative media paths into `song.json`;
- generates all `*.vmcchart` files;
- runs `npm run catalog` when `--catalog` is provided.

To choose a slot manually:

```powershell
node bin/vmc-convert.js import "E:\Songs\THE IDOLM@STER" `
  --maisongs-root "E:\VRCHAT\maimai\VRChat_MaiSongs" `
  --song-id 10023 `
  --runtime-slot 7 `
  --catalog
```

A slot may be used by only one song.

## Generated catalog v2

Runtime-facing `songs.json` deliberately does **not** require Udon to consume resource URL strings.

A song entry contains data such as:

```json
{
  "songId": 10001,
  "runtimeSlot": 0,
  "title": "Hello, SEKAI",
  "media": {
    "audio": {
      "variant": 0,
      "extension": ".mp3"
    },
    "background": {
      "type": "image",
      "variant": 2,
      "extension": ".jpg"
    }
  },
  "jacket": {
    "variant": 2,
    "extension": ".jpg"
  },
  "charts": [
    {
      "chartId": 100015,
      "difficulty": 5,
      "level": "13",
      "designer": "MiraT",
      "version": 1
    }
  ]
}
```

Unity/Udon uses the numeric indexes to select an already serialized `VRCUrl`.

## URL array indexes

The registry manifest defines the array layout. Current formulas are:

```text
audioIndex
  = runtimeSlot * audioVariantCount + audioVariant

backgroundVideoIndex
  = runtimeSlot * videoVariantCount + backgroundVariant

backgroundImageIndex
  = runtimeSlot * imageVariantCount + backgroundVariant

jacketIndex
  = runtimeSlot * jacketVariantCount + jacketVariant

chartIndex
  = runtimeSlot * 7 + (difficulty - 1)
```

See `docs/UNITY_VRCURL_REGISTRY.md` for the Unity integration contract.

## Commands

Install dependencies once:

```bash
npm ci
```

Regenerate `songs.json` and `runtime-url-registry.json`:

```bash
npm run catalog
```

Verify both generated files are current:

```bash
npm run catalog:check
```

Build the GitHub Pages output:

```bash
npm run pages:build
```

The Pages build publishes:

```text
dist/
├─ songs.json
├─ runtime-url-registry.json
├─ songs.sig
├─ runtime/
│  ├─ 0000/
│  ├─ 0001/
│  └─ ...
└─ songs/...                      # legacy jacket/chart aliases during migration
```

## Contribution rules

1. Every `songs/<songId>/song.json` must have a unique `runtimeSlot`.
2. `runtimeSlot` must be within the configured capacity, currently `0..511`.
3. Audio/video files must stay outside `songs/`; the importer uses `media/audio/` and `media/backgrounds/`.
4. `song.json.media.*.path` must be a repository-relative source path.
5. Exactly one `jacket.webp/png/jpg/jpeg` is allowed per song.
6. Chart filenames are strictly `1.vmcchart` through `7.vmcchart`.
7. Asset extensions must be listed in `repo.config.json.runtime`; otherwise that URL variant was not pre-registered for the World.
8. Run `npm run catalog` before committing song changes.

## Catalog signing

To generate an Ed25519 keypair:

```bash
node scripts/sign-catalog.mjs --generate-keypair
```

For GitHub Actions signing, store the private PEM in `VMC_CATALOG_PRIVATE_KEY_PEM`.
