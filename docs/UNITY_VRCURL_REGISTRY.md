# Unity / Udon VRCUrl Registry Contract

MaiSongs catalog v2 assumes URL construction happens only in the Unity Editor.

## Required serialized fields

The World-side registry should serialize:

```csharp
VRCUrl catalogUrl;

VRCUrl[] audioUrls;
VRCUrl[] backgroundVideoUrls;
VRCUrl[] backgroundImageUrls;
VRCUrl[] jacketUrls;
VRCUrl[] chartUrls;
```

Do not store a downloaded URL string and attempt to create a new `VRCUrl` from it at runtime.

## Editor input

Use the generated repository file:

```text
runtime-url-registry.json
```

It contains:

- public base URL;
- slot count;
- slot padding width;
- every pre-registered extension variant;
- fixed URL templates;
- runtime index formulas.

The default v2 registry contains 512 slots.

## Editor generation

For each slot from `0` to `slotCount - 1`, format it with the configured padding width:

```text
0   -> 0000
7   -> 0007
511 -> 0511
```

Then, in the Editor only, generate each supported URL and serialize it as a `VRCUrl`.

Example:

```text
slot 7 + audio variant ".ogg"
=> https://terasgroup.github.io/VRChat_MaiSongs/runtime/0007/audio.ogg
```

The reference scripts under `unity-reference/` implement this process using a local copy of `runtime-url-registry.json`.

## Runtime selection

After downloading `songs.json`, a song provides `runtimeSlot` plus numeric asset variants.

Audio:

```text
index = runtimeSlot * audioVariantCount + media.audio.variant
url   = audioUrls[index]
```

Background video:

```text
index = runtimeSlot * backgroundVideoVariantCount + media.background.variant
url   = backgroundVideoUrls[index]
```

Background image:

```text
index = runtimeSlot * backgroundImageVariantCount + media.background.variant
url   = backgroundImageUrls[index]
```

Jacket:

```text
index = runtimeSlot * jacketVariantCount + jacket.variant
url   = jacketUrls[index]
```

Chart:

```text
index = runtimeSlot * 7 + (difficulty - 1)
url   = chartUrls[index]
```

No URL string concatenation is required in Udon.

## Adding songs after World publication

A newly imported song only needs a free `runtimeSlot` that was already within the World registry capacity.

For example, if the published World contains slots `0..511`, a new catalog entry can later use slot `204` and publish files under:

```text
runtime/0204/audio.mp3
runtime/0204/background.mp4
runtime/0204/jacket.jpg
runtime/0204/charts/5.vmcchart
```

The World does not need to be re-uploaded because all matching URL variants for slot 204 were already serialized before publication.

A World rebuild is required only when changing the registry contract itself, such as:

- increasing `slotCount` beyond the pre-registered capacity;
- adding a new file extension variant;
- changing the public base URL;
- changing URL path templates.
