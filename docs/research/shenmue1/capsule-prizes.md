# Capsule prize selection and inspection

## Source and scope

The two machines outside You Arcade use D000's original selection routine,
file offsets `0x56ed4..0x57a78` in `MAPINFO.BIN` (868,708 bytes, SHA-256
`7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e`).
Machine selectors, pool lengths, rare counts, models, collection IDs, price,
and engine RNG/getter calls are recorded by
`tools/worlds/audit_d000_gacha_interaction.js` in
`tools/evidence/d000-gacha-interaction.json`.

This is evidence for these two D000 machines, not a claim that every machine
in Shenmue I or II shares the same policy. The separate server generates its
catalog and SQL seeds from this evidence and the reviewed collection-name table.

## Recovered draw rules

| Outcome | Approximate chance | Pool |
| --- | ---: | --- |
| Shared button badges | 1/9 | Category 14: 4 entries |
| Shared toys | 2/9 | Category 0: 12 entries |
| Machine-specific rare selection | 5% | Tail of the machine pool |
| Machine-specific normal selection | 61 2/3% | Remaining machine entries |

Sega World (GCH0, category 4) has 16 normal and 3 rare entries. Virtua Fighter
Kids (GCH3, category 2) has 20 normal and 2 rare entries. These and the shared
pools contain 57 distinct collectible items. Normal/shared draws are uniform
within their selected pool; duplicates are possible.

Rare selection is deliberately unusual. For trial `i`, the original queries
ownership at `normalCount - 1 + i`, but awards index `poolLength - 1 - i`.
If the queried entry is absent, a random value below the float32 two-thirds
constant accepts that award. Otherwise it tries the next entry. If no trial
succeeds, it draws uniformly from the rare tail. These asymmetric indices are
present in the original instructions; do not replace them with a conventional
"prefer missing rares" rule. Later special branches have zero probability in
this binary, and the console category is not selected by this path.

The server preserves the float32 comparisons (including subtraction before
the 5% comparison), but uses secure 24-bit random fractions rather than the
Dreamcast's shared RNG seed. It reads ownership and draws under the same
character-row lock as the debit and award. Repeating a purchase request ID
returns the saved receipt without drawing again.

## Verification

`tools/worlds/verify_capsule_selection.mjs` is a bounded SH-4 instruction
executor for this exact source range. It fails on unrecognized instructions
or a changed source hash. Only the external RNG, machine selector, collection
getter and already recovered ID lookup are supplied by the harness. It emits
800 deterministic native traces across both categories and varied ownership.
The separate server's `TestOriginalCapsuleInstructionTraces` replays the exact random
draws and checks the resulting prize and consumption against its Go policy.

```sh
node tools/worlds/verify_capsule_selection.mjs /var/tmp/capsule-native-traces.json
# In the separate server repository:
CAPSULE_NATIVE_TRACES=/var/tmp/capsule-native-traces.json go test ./internal/capsule
```

Additional focused tests cover threshold boundaries, invalid RNG results,
transaction rollback, concurrent receipt replay, committed ownership reads,
and persistent per-character collection state.

## Held-toy reveal

After the original `M_GACH` purchase clip, `CapsuleToyInspection` loads the
server-awarded `G_ITEM_*.MT5` and presents it with Ryo's original right hand and
forearm, held at a retrieval pose from that motion. It owns a temporary camera,
not a replacement player avatar. A separate control panel above dialogue names
the toy, explains rotation, and puts the close key in a square on the right.
A/D rotate it; either mouse button can drag to rotate around both camera axes.
Only the toy rotates, about its center; the hand and camera remain stationary.
Movement remains locked until X or the close button is used, including when
dialogue captions are disabled. Closing, changing worlds, load failure,
and cancellation dispose the presentation and restore the saved view.

The camera framing and size-aware palm placement are browser adaptations;
the full native YKUR/KEIH presentation and finger/camera timeline have not been
reconstructed. Ryo's original E1066 voice lines are used: A022 ("This is cool!")
for a newly collected item, A019 ("This again?") for another copy. Choosing
between those two by ownership is also an explicit adaptation, not a recovered
original reaction decision tree. Subtitles/volume use the shared dialogue system.

## Collection previews

The Collection modal resolves saved capsule IDs through the same original
collection-name/model catalog used to generate the server's prize catalog.
Visible cards get rendered thumbnails, created serially on one shared renderer
and cached only while the modal is open. Clicking a card opens a separate 3D
scene with size-aware framing. `CapsuleToyModel` supplies model loading and
camera-relative rotation to both this preview and the held-toy reveal;
`CapsuleInspectionControls` supplies the same A/D, left/right drag, and configured
close key. Closing the preview returns to Collection without unlocking movement
or changing the gameplay camera. Closing Collection releases preview resources.
Missing models and loading timeouts show an error with a retry action.

## Capsule shell during purchase

`CapsulePurchaseProps` uses the original clear `CAPS5FTG` lid and green/blue/red/
yellow capsule bases. The existing `S3_D000_CAPS5*.MT5` catalog assets are
byte-identical to the Disc 1 `OMG/CAPS5*.CHRM` files; their source hashes and
attachment calls are in the gacha evidence file above. Cosmetic color is an
independent uniform draw and has no effect on the server's prize selection.
The original shared atlas is missing from the broad D000 viewer pack, so it is
extracted directly from `D000/OMG.PKF` (4 KiB) with:

```sh
python3 -m tools.worlds.build_gacha_assets --scene-root /path/to/SCENE/01
node tools/runtime-assets.mjs update play/assets/dobuita/GACHA_textures.bin
```

Publish this registered runtime asset with the client release. Provenance is in
`tools/evidence/capsule-shell-textures.json`. MT5 material/vertex alpha is
honored independently of texture alpha; the clear lid's 127/255 opacity comes
from its original `0x0e` material record, not a hand-authored transparency override.

The original parent motion gates start dispensing at frame 215 and attach both
halves to AKIR control 18 (right hand) at 310. At 360 the base moves to control
12 (left hand), leaving the lid in the right hand. Native translation/rotation
literals position the grips; the base adjusts its grip during 430–450. The lid
detaches at 410 and the base at 503. Attachments use the avatar's actually
rendered, retargeted hand matrices and the same source-coordinate conversion
as the vending can, rather than assuming all avatars share Ryo's proportions.

The tray's source-relative position, eight-centimeter fall, and acceleration
are recovered from `0x555ac`. The browser follows these using motion frames,
so low frame rates do not change the stages. Resting spin and the entire native
discard/bin-collision coroutine are not ported: after the original detachment
frames, each shell half makes a brief browser-authored gravity drop and is
hidden. Capsule roots are disabled on interruption and disposed on world clear.

Generate the two voice files from a local disc/dialogue inventory:

```sh
python3 -m tools.audio.build_capsule_reveal_voices --vgmstream-cli /path/to/vgmstream-cli --jobs 4
node tools/runtime-assets.mjs update public/audio/capsule/E1066A019.m4a public/audio/capsule/E1066A022.m4a
```

Provenance is in `tools/evidence/capsule-reveal-voices.json`. Extracted audio
is ignored, registered in the runtime-asset catalog, and must be published
through the normal asset workflow before a production client release. Local
testing can use the existing `VITE_OFFLINE_ASSETS=true` configuration.
