# GitHub-hosted backgrounds

This directory is reserved for background media that is intentionally hosted in this GitHub repository.

Recommended naming:

```text
backgrounds/
├── 10001.mp4
├── 10002.webp
└── ...
```

Reference these assets from `songs/<songId>/song.json` using a direct HTTPS URL, for example:

```text
https://raw.githubusercontent.com/TerasGroup/VRChat_MaiSongs/main/backgrounds/10001.mp4
```

Do not use a `github.com/.../blob/...` page URL. Do not place audio/video media inside `songs/`; the catalog validator rejects it there.

Large audio files should remain on external object storage/CDN. Background media can be moved to object storage later without changing the VMC chart format; only the catalog URL needs to change.
