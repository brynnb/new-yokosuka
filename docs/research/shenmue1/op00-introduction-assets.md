# OP00 introduction assets

The `S1-000` introduction uses generated metadata and exact browser-ready
assets. The game does not unpack `MAPINFO.BIN` or `OP99.AFS` when a player
starts a new game.

## Files

- `play/data/events/op00-introduction-scene.json` is the small authored scene
  manifest. It selects the environment, maps native actor tags, defines the
  private-instance contract, and names the canonical package.
- `play/assets/introduction/op00/manifest.json` indexes the 25 independent
  A0114 AUTH activities by native embedded-resource slot, with exact hashes,
  actor tags, motion names, audio strings, and effective native map state.
- `play/assets/introduction/op00/asset-inventory.generated.json` records every
  model found in `OP99.AFS`, its source entry, hash, canonical resolution, and
  exact archive child identity.
- `play/assets/introduction/op00/SEQDATA0.AUTH` through `SEQDATA24.AUTH` are
  exact standalone browser assets. The compiled owner program is the sole
  sequencing authority; the package does not duplicate its call order.
- `play/assets/introduction/op00/M_0101A.BIN` is native motion bank 25.
- `play/assets/introduction/op00/faces/` contains the five exact FACE MT5/FTBL
  pairs required by the opening plus one generated native TALK-pose asset.
  These are animated face resources, not copies of the canonical bodies.
- `play/assets/introduction/op00/hands/` contains the exact detailed T-left and
  T-right hand models selected for the five principal actors plus their paired
  `HM.BIN` deformation records. Each emitted file is pinned to its global
  `SCENE/01/MODEL/HAND` source by size and SHA-256.

## Post-murder opening continuation

The A0114 package includes the whole gate and murder stages, including the
silent storm ending in slot 24. It ends when murder-stage function `0x1785c`
returns to owner `0x20350`, not when dialogue resource paths change. The owner
continues into separately packaged mail and dream stages:

- `0x204b8` calls `0x1bfa4`: embedded AUTH slots **26, 27, 25**, in that order.
  Slot 25 at MAPINFO `0x48f78` contains Ine-san's motion and original
  `/AUTH01/01103/` strings, including `POST_OPEN`, `latter_ryo`, `POST_CLOSE`,
  and voice `A01103B001`.
- `0x204c4` calls `0x1dda8`: slots **28, 30–46, 29**. Slot 28 is the first
  sleeping-Ryo track; slots 30–46 contain the Lan Di/Iwao dream montage; slot 29
  is the final Ryo track. Slots 28/29 have `/AUTH01/0119/` strings and voices
  `A0119A001`/`A0119A002`. Ryo's native tag here is `AKI_`, not `AKIR`.

This ordering was checked through `ordered_control_flow_calls` from the shared
preview compiler, not inferred by sorting resource indices. The retained
`tools/evidence/op00-opening-owner-ir.json` is generated source IR, not proof of
browser rendering. Reproduce it with:

```sh
python3 tools/cutscenes/extract_native_aseq_callback_ir.py \
  --disc 1 --area OP00 --map-entry 0x20324 --callback 0x20350 \
  --include-call-closure --output tools/evidence/op00-opening-owner-ir.json
```

The MAPINFO source hash is
`8c2e8957ba3c96eb0a1315249db1abe1cb5931ea1bd63ee9601f30d1c8f257e4`.
These resources are packaged separately as `op00-mail` and `op00-dream`, wired
after `S1-000` in new-character entry. Regenerate from the same extracted Disc 1:

```sh
node tools/cutscenes/build_op00_continuation_assets.mjs
node tools/cutscenes/build_op00_continuation_audio.mjs
python3 tools/cutscenes/build_native_activity_preview_programs.py
python3 -m tools.scripting.build_native_event_program_pack
```

The audio tool accepts `VGMSTREAM_CLI`, `DTPK_DUMP`, and `DTPK_PYTHON` overrides;
both tools accept `SHENMUE_DISC1_EXTRACTED_ROOT`. Register new/changed emitted
files through `tools/runtime-assets.mjs update` before browser verification.
The package compiler pins embedded byte ranges to the parent MAPINFO hash;
the shared control-flow compiler remains the sequencing authority.

### Restored storm ending and completeness

Slot 24 is the 500-native-frame (16.667-second) exterior storm shot at MAPINFO
`0x481f4`, length 3460, SHA-256
`9230dfa8a9cbdafc5de16becab4b56a4d8f07930082e28cd983be003633ac0a0`.
It has no ASTR dialogue paths. Those paths describe audio dependencies, not
scene boundaries; filtering by `/AUTH01/0114/` previously omitted this shot.
The original owner starts it at `0x1a95c`, with effect callback `0xe2f0` launched
at `0x1a944`. OP99 entry 14 binds lightning objects to `KAMS203G` (entry 15).
Each browser object has a separate instance of that one exact model.

The retained `op00-storm-native-callback-ir.json` and shared
`extractNativeAseqCallbackStageEffects` compiler recover constant object
visibility/scale, ambient/directional-light helpers, and thunder calls. Child
sound helper `0xf9e0` delays dispatch by five or six native ticks. Sound records
use `native-script:OP00:<command-word>` as provenance identities; these are not
invented ASTR filenames. The existing audio owner handles playback and seeking.
Browser lighting uses native flash ratios against a night preset. Dynamic
native fog/weather/post-process routines and THN5's additional transform copy
are not fully reproduced; this is a good-enough storm presentation, not exact
Dreamcast pixel parity.

Regenerate the full-stage owner and storm assets with:

```sh
python3 -m tools.cutscenes.build_native_cutscene_program --id S1-OP00-A0114 --disc 1 --area OP00 --entry 0x20350 --stage-function 0x1512a --stage-function 0x1785c --output play/assets/introduction/op00/cutscene-program.generated.json
python3 tools/cutscenes/extract_native_aseq_callback_ir.py --disc 1 --area OP00 --map-entry 0x20324 --callback 0xe2f0 --include-coroutine-closure --output tools/evidence/op00-storm-native-callback-ir.json
node tools/cutscenes/build_op00_introduction_assets.mjs
node tools/cutscenes/build_op00_audio_pack.mjs
```

The callback extractor accepts `--input` for a filtered map from the full
native-event IR, retaining its input hash and the original MAPINFO hash.
Regenerate preview programs and the native-event pack afterward, as above.
Original-stage evidence for OP02, gate/murder, mail and dream is checked by both
the preview compiler and selectable-scene smoke audit. All positive AUTH starts
in each selected original stage must be retained, including silent camera and
effect tracks. A passing corpus smoke audit still proves packaged execution,
not original-shot completeness for scenes without original-stage evidence.

Mail uses motion bank 23 (`M_01103`), `A01103.AFS`, `A1_TKINE.SND`, and BGM049.
Its CHRT bindings select Ine-san (`INE_M`), the postman (`UBA_L`), bike, mailbox,
letter and gates. Slot 26's reference actor AKIR stays hidden, following the
owner's presentation flag rather than its mere presence in AUTH.
The dream selects sleepwear Ryo (`AKI_ -> YKD_M`) with motion bank 24 (`M_0119`),
and Lan Di/Iwao with bank 25. Voices are `A0119.AFS`; music is BGM120 followed
by TSM006. The later Shenhua nightmare remains separate. Final loading/gameplay
uses MMO server time, never an authored 8:55 override.

Sleepwear Ryo's `AKI_ -> YKD_M` binding also selects the matching YKD face,
not the murder scene's `AKIR -> YKC_M` face. The continuation generator resolves
face resources by the selected body model; copying only the murder's actor-tag
entries had omitted Ryo entirely. `OP99.AFS` entry 25 contains `YKD_F` and
`YKD_FTBL`; the packaged self-contained `MODEL/FACE/YKD_F.MT5` supplies textures,
and the table is extracted from OP99. YKD has its own control records, so its
80 upper-face and 80 mouth poses are evaluated with the original SH-4 TALK
function, not copied from YKC.

Callbacks `0x10ce4` and `0x1120c`, launched by the original owner before slots
28 and 29, feed the existing shared expression/eyelid player. Sleeping closes
the eyes at frame 0 and selects nine timed expressions. Waking starts closed,
opens at frame 21 over six native ticks, and selects nineteen expressions
within the 330-frame activity. Five later callback cues belong to post-AUTH
idle; the manifest retains them as excluded source evidence rather than
extending the cutscene or firing them early.

Regenerate this evidence and pose artifact with the existing tools:

```sh
python3 tools/cutscenes/extract_native_aseq_callback_ir.py --disc 1 --area OP00 --map-entry 0x20324 --callback 0x10ce4 --include-function 0x1120c --include-function 0x1fe28 --include-call-closure --output tools/evidence/op00-dream-native-callback-ir.json
# Use a disposable, paused Flycast debugger session with pinned TALK_N00 loaded.
python3 -m tools.animation.extract_native_face_poses --port 3266 --binding AKI_=YKD:extracted_files/data/SCENE/01/MODEL/FACE/YKD_FTBL.BIN --output play/assets/introduction/op00-dream/ykd-talk-poses.generated.json
node tools/cutscenes/build_op00_continuation_assets.mjs
```

The September 28 pose extraction used a copied internal slot 7 (state SHA-256
`4018b8b48e2b99bd2e20d3a3660b41682c3ff0e51f8b29bd498a892263fa83a6`)
through `run_dialogue_emulator_validation.sh`, with threaded rendering enabled
so injected GDB function calls run independently of the presentation thread.
No user save states or VMUs are modified by that isolated profile.

Face verification (2026-09-28): the 16 focused continuation/TALK/presentation
tests pass. Full dream playback also passes on the RX 9070 XT with both local
and hosted assets. Reviewed sleeping and waking frames show changing facial
expressions, closed sleeping eyes, and the authored eye-opening transition.
The three YKD face/table/pose objects were published through the authenticated
R2 bridge; public downloads match their manifest sizes and SHA-256 hashes and
retain immutable caching. No frontend deployment was performed.

Continuation hands (2026-09-30): the earlier compiler selected only sleeping/
waking FACE callbacks and discarded their HAND output. It also omitted the
mail callback `0x10488` and dream-owner HAND setup. This was a metadata
extraction omission, not a need for a second renderer or generic replacement
hands. The compiler now retains the shared extractor's detailed poses, body
poses and wrist-component writes, in original same-frame source order.

Ine-san uses `INE_TL/TR` and `INE_HM`: slot 25 installs both detailed poses at
frame 0, changes the left grip over 35 native ticks at frame 566, writes its
wrist rotation `[0, 0, 5097]` at that same frame, and starts the right pose over
500 native ticks at frame 625. The long transition is not shortened to fit the
shot. Iwao uses `IWA_TL/TR` and `IWA_HM`. Dream owner `0x1dda8` installs his
19-vector pose at calls `0x1e2d2/0x1e2f2` before slot 30; the shared owner
projection defers these resident-actor commands until his first owned montage
activity, slot 37, then the existing presenter retains the state across cuts.
There are no additional source-timed Iwao finger-pose changes in this owner.
His hands still follow the animated wrists rather than a static world pose.

Sleepwear Ryo's `AKI_ -> YKD_M` uses its own YKD hands, not jacket-Ryo's YKB.
OP99 entry 25 contains YKD body, both detailed hands, and HM together. Global
YKD MT5 hands supply textures; both root keys, all 306 positions/normals, and
parsed polygons match the archive-local hands. HM matches byte-for-byte.
Callbacks `0x10ce4/0x1120c` install the sleeping/waking poses at frame 0.
Lan Di's KOK static HAND setup is retained too; the separate right-hand HNDM
motion requested by callback `0x11dac` remains an explicit projection limit.

Retained source evidence includes both continuation owners and their complete
direct-call/child-coroutine closures:

```sh
python3 tools/cutscenes/extract_native_aseq_callback_ir.py --disc 1 --area OP00 --map-entry 0x20324 --callback 0x10488 --include-function 0x1bfa4 --include-function 0x1dda8 --include-call-closure --include-coroutine-closure --output tools/evidence/op00-continuation-native-callback-ir.json
node tools/cutscenes/build_op00_continuation_assets.mjs
```

Verification: 22 focused parser, compiler, continuation, hand-rig and hand-
presentation tests pass. Both scenes complete GPU-backed browser playback on
the RX 9070 XT with every projected hand command accepted in source order and
no browser/resource errors. Reviewed frames show Ine-san's detailed letter
grip and Iwao's detailed dream hands. These checks used local assets.

Hosted asset correction (2026-09-30): the two continuation manifests and
`YKD_TL.MT5`, `YKD_TR.MT5`, and `YKD_HM.BIN` had been registered locally but
left unpublished, causing the mail-to-dream transition to fail with HTTP 404.
The dependency audit found exactly these five missing objects among 60
mail/dream references. All five were published with the existing checksum
manifest, and downloads through the normal development R2 proxy matched their
recorded byte lengths and SHA-256 hashes. Existing client URLs work unchanged;
no frontend deployment was needed.
The hosted GPU new-character test subsequently passed through mail, loaded the
Lan Di dream, skipped it with X, and restored controllable Ryo by his bed.
It uses the real loader/renderer with mocked account/network transport and
Space seeking, rather than full real-time playback. Eleven focused
continuation/HAND tests also pass.

Presentation limits are explicit: native dream flashes and per-shot lighting
are not reproduced. Montage slots 30–46 use shared isolated black staging;
sleeping slot 28 and waking slot 29 retain the bedroom. This browser composition
does not attempt to emulate the original fog/flash controllers. Blanket
deformation remains separately tracked.
Slots 44/46 retain sound command `a9042000` (track 32, `RYODORO2`), but dream
owner call `0x1dde2` installs `A1_UNASA.SND`, containing only tracks 0–5.
No subsequent bank-4 replacement appears in the captured owner/call closure.
This one absent clothing cue is recorded as unavailable with evidence and plays
silently; original driver behavior for that out-of-range command is unverified.
The extractor rejects this allowance if the track actually exists. Other
uncatalogued or malformed audio still fails, rather than silently substituting
sounds from the murder's unloaded `A1_PROLG.SND` bank.

Verification (2026-09-28): both continuation previews completed full, real-time
GPU-rendered playback. Reviewed stills show Ine-san holding the letter, sleeping
Ryo, Lan Di's attack/close-up, and Ryo sitting up. The new-character browser test
also passed on the normal development server using hosted assets: X skips the
vision and murder, the mail and dream run through the existing Space transport,
and the selected avatar becomes controllable afterward. Account HTTP and
multiplayer transport were mocked; this was not a real account creation.
All 54 newly published continuation objects were fetched through the development
asset proxy and matched their recorded byte lengths and SHA-256 hashes. Focused
checks passed (38 tests), deterministic regeneration matched, and the production
build passed. This does not establish native dream lighting/flash parity or
resolve the separate blanket limitation.

## Current packaged presentation

The six required non-player character models are not copied. Their OP99 bytes
match the existing canonical character files exactly, and the inventory points
to those files. The seven extracted OP00 environment models, six independent
scene-object models, and one attached mirror model had no canonical byte match
and are emitted once under `play/assets/introduction/op00/models`. The existing
production `S1_OP00_textures.bin` is referenced by identity and hash rather
than copied into this worktree. Extraction inventory and browser render
composition are deliberately separate: retaining a unique native resource for
provenance does not require rendering it in every scene.

Continuation package asset maps include model and optional texture references
from both `packageActors` and `sceneObjects`, not just newly emitted `outputs`.
This keeps reused resources such as mail's `MNLF -> B023H01G` gate available to
the package loader without copying the model. The smoke audit validates audio
through the same `NativeAseqAudioCatalog` as playback: evidence-backed unavailable
sound cues stay silent, while missing ordinary assets and malformed records fail.
Cleanup verification (2026-09-29): all 60 selectable scenes pass the headless
smoke audit, and 34 focused tests pass. Mail and Lan Di dream both complete full
GPU-rendered browser playback with local assets and no browser/resource errors;
the dream check also verifies sleep/wake FACE updates and isolated black staging.

The generated `facialAssets` map binds `AKIR -> YKC`, `INE_ -> INE`,
`FUKU -> FUK`, `IWAO -> IWA`, and `SORY -> KOK`. Each record pins the source
path, size, SHA-256, body `-67` attachment route, FACE root key `3`, and eye
keys `77`/`78`. The runtime preloads these pairs during activity preparation,
then swaps them into the active actor only for the lifetime of each AUTH activity.
This supplies the native face and eye geometry that the static body head was
missing. `native-talk-poses.generated.json` retains the exact upper-neutral,
blink, and six mouth-pose vectors produced by the original executable's TALK
evaluator for those five FTBL tables. Runtime speech uses each A0114 SRF
record's authored cues; it does not infer motion from WAV duration.
The eye nodes retain their authored normals and ordinary character lighting.
Their separately identified surface coverage fully replaces an intersecting
low-detail body eye, while the primary face shell still uses the stricter
three-corner ownership rule that preserves the neck seam.

The generated `handAssets` map binds `AKIR -> YKB`, `INE_ -> INE`,
`FUKU -> FUK`, `IWAO -> IWA`, and `SORY -> KOK`. Displayed Flycast save-state
slot 5 (internal index 4, SHA-256
`5b57c010537c11ed893610ac6b848b90468a3d6348bc9fdf19f2127f8f3a98bb`)
captures the A0114 close-up with native `YKB_TL.MT5`/`YKB_TR.MT5` hand
allocations for Ryo and `INE_TL.MT5`/`INE_TR.MT5` allocations for Ine-san.
This distinguishes the opening selection from OP99's incidental `YKD` package,
which belongs to OP00's wider resource inventory. Runtime presentation derives
the proximal seam from each detailed hand's wrist-local extent, retains the 12
body triangles forming the wrist ring, and replaces every distal low-detail
triangle under body nodes `-66`/`-65`. It attaches each 306-vertex detailed
hand to the corresponding live body-hand matrix and restores the exact body
index buffers when the AUTH track ends. In that state, Ine-san's two
detailed-hand pose records are
zero. Ryo's are not: both contain the exact 19-vector table at MAPINFO pointer
`0x217f4`, installed into the native 71-vector record by operation `0x005e`.
The generated activity manifest retains all 11 referenced pose tables and expands
all 122 opening calls at their exact AUTH frames, including track 8's native
frame-range/parity branch. The browser applies the executable's 19-to-71 slot
mapping and two-native-tick interpolation, builds the `HM.BIN` joint palette,
and skins the 306 position/normal pairs with its authored weights. An offline
comparison against save-state slot 5 reproduces both native destination vertex
buffers with a maximum channel error below `0.00000036`; no procedural grip or
finger pose is synthesized.

Detailed-hand operation `0x005e` is separate from the body's `MHND` controller.
The generated activity manifest also retains all 15 effective OP00 operation-`0x0081`
requests, including the frame-zero row-`0` request that bends Ryo's low-detail
fingers before a detailed hand is requested. Its two exact ten-word routes are
advanced with the native signed constant-delta arithmetic at two ticks per
AUTH frame. A detailed side takes over only at its first exact `0x005e` cue;
preloading a hand asset does not itself change surface ownership.

The introduction manifest fixes the environment to `winter` and `snow`,
independently of the live multiplayer calendar. Its `op00-introduction` scene
composition renders the seven native OP00 environment roots and the authored
scene objects with the dedicated `S1_OP00_textures.bin` pack. It does not load
BETD or JHD0 geometry. `/play` adds the grey winter sky and camera-relative
snow precipitation for the duration of the cutscene. See
[`scene-compositions.md`](../../implementation/scene-compositions.md) for the shared contract.

This snowfall applies to the murder, not the later mail stage. The mail
cutscene's catalog sets `precipitation: clear` through shared cinematic
environment ownership. Ground snow surfaces remain selected by the world's
fixed snow variant; only falling particles are suppressed. Periodic world
updates respect that precipitation setting until covered cutscene cleanup.

### Native activity ownership

The 24 `TRCK` resources are stored by native embedded-resource slot, not scene
chronology. Each remains independently addressable as `SEQDATA{slot}.AUTH`.
`cutscene-program.generated.json` retains the exact operation-`0x0050` calls
and their control flow, so only the compiled room-script owner determines
which activity runs next. The package deliberately contains no second order.

The scene-object mappings come from the original paired `CHARA.CHRT` records:

| AUTH tag | CHRT image | Model | Scene role |
| --- | --- | --- | --- |
| `RMJN` | `RMJN` | `BMWS703G` | Black car |
| `KNBS` | `KANBANS` | `YUKS502G` | Broken sign, lower piece |
| `KNBU` | `KANBANU` | `YUKS503G` | Broken sign, upper piece |
| `MNLF` | `MONLEFT` | `B023H01G` | Left entrance gate |
| `ODR1` | `DOOR_L` | `DDRR1002` | Left residence door |
| `ODR2` | `DOOR_R` | `DDRR1001` | Right residence door |

The generated object contract separates room-script persistence from temporary
AUTH ownership:

| Lifecycle | Objects | Behavior |
| --- | --- | --- |
| `room-script-persistent` | `RMJN`, `MNLF`, `ODR1`, `ODR2` | CHRT supplies the room pose; exact script `0x001f`/`0x00a8` calls supply the effective state before each track; AUTH may temporarily animate and then restores it |
| `auth-scoped` | `KNBS`, `KNBU` | Hidden until a valid AMOV transform in an owning track and hidden again afterward |

CHRT's top-level `(100, 0, 0)` values are inactive parking positions. For a
persistent object, the builder reads the `Position` and `Angle` nested after
the record's associated `Object` property. `RMJN` has no nested position, so
its first exact AUTH pose is recorded as the explicit fallback. The builder
checks that every other CHRT pose agrees with that object's first AUTH pose.

Before track 2—the shot where Ryo looks toward and walks to the dojo—the room
script presents both residence doors. `ODR1` uses calls `0x15ec6`/`0x15eea`;
`ODR2` uses `0x15f52`/`0x15f76`. They are therefore already visible at their
closed CHRT poses during track 2. Track 3 temporarily owns their AMOV channels
to animate them, then restores those persistent poses. The reassertions before
track 4 are also retained. This is emitted as ordinary per-track object state;
the runtime has no OP00 door special case.

The selected A0114 tracks contain no skeletal motion command for these six
tags; their authored animation is entirely in the whole-object AMOV transform
channels.

### Environment map layers

The cutscene does not render every environment model continuously. Native
operation `0x0098` writes visibility state into numbered MAP-layer records.
The generated activity manifest records every explicit write and carries the resulting
five script-controlled numeric states into tracks that inherit them.

Those numeric slots must not be assigned from IPAC child order. OP00 loads
seven environment MAPM resources through several OP99 packages, and the native
loader assigns each resource to the first free global MAP record as it is
registered. Entry 27 contains `JIMENHAL`, `NAIB`, `NIWAKAL`, and `OMADO` after
its `COLLI` child, but that order proves only the package structure. It does not
prove that those models are slots 0–3. Doing so causes track 0's zero writes to
remove the Hazuki house, gate frame, and grounds from the browser scene.

Until the complete native registration order is recovered, numbered states and
semantic model names remain separate in generated metadata. All seven native
OP00 environment assets remain inspectable, but the fixed winter composition
does not simultaneously render the overlapping warm-season `NIWAKAL` yard
layer. No ordinary Hazuki Grounds map is used as a replacement. The browser has
one explicit per-shot rendering override: it hides
`OMADO` for the duration of the cutscene because that small window/wall root
obstructs the authored pullback, then restores it when cutscene ownership ends.
This is a visual cutaway rule rather than a claimed native slot identity.

### Dragon Mirror attachment

The six-object AUTH list above is not the complete OP00 object inventory.
`RYUK` does not appear as an A0114 AUTH actor, so it has no AMOV channel. The
room CHRT data instead resolves it as:

```text
RYUK -> RYUKYO -> DRGS502G
```

The generated inventory then recovers three exact native FIXO operation
`0x00e6` calls from the pinned `MAPINFO.BIN`. Track and frame ownership are
derived from the containing generated SH-4 setup function, not declared in the
OP00 asset list:

| AUTH track | Parent | MOMT control | Translation | Fixed-turn rotation |
| ---: | --- | ---: | --- | --- |
| 15 | `KURA` | 18 | `(0.145, 0.071, -0.051)` | `(0xd82d, 0x149f, 0x1777)` |
| 17 | `SORY` (Lan Di) | 12 | `(0.164, 0.073, 0.021)` | `(0x2000, 0x071c, 0x182d)` |
| 20 | `SORY` (Lan Di) | 12 | `(0.06, 0, 0.08)` | `(0x2888, 0, 0xc444)` |

These tracks use the mirror-handoff motions (`KAGAMI_WATASU`). The track-20
binding is installed by the frame-zero call inside native function `0xb3f8` as
Lan Di leaves the dojo; it is not part of track 14. At runtime the mirror
follows the requested live controller matrix and is hidden on all other tracks.
Its exact model is emitted once as `DRGS502G.CHRM`; no byte-identical canonical
browser asset existed.

The September 28 Dragon Mirror alignment fix changes the shared HAND renderer,
not these FIXO offsets. In track 17 at frame 260, the detailed hand and mirror
previously had matching wrist positions but different rotation matrices: HAND
copied the low-detail `-66` node after MHND animation, whereas FIXO correctly
used MOMT type `12`. Native HAND consumer `0x0c0de682` also uses type `12`
(left) or `18` (right). Both now share that unmodified wrist basis; explicit
HAND component corrections apply only to the detailed hand. Authored borrowed
wrist vertices still follow the body through `NativeAttachmentSeam`.

The mirror-shot callbacks contain the existing finger pose and FIXO calls,
not an omitted `0x00eb` wrist correction. Reproduce the retained callback
evidence and independently verify the original render-consumer bytes with:

```sh
python3 tools/cutscenes/extract_native_aseq_callback_ir.py --disc 1 --area OP00 --map-entry 0x20324 --callback 0xc700 --include-function 0xb3f8 --include-call-closure --output tools/evidence/op00-opening-native-callback-ir.json
python3 -m tools.scripting.operations.extract_hndl_hndr_component_operation_evidence --contract-only --out tools/evidence/hand-attachment-render-contract.json
```

Verification: 18 focused hand/attachment checks pass, including all five OP00
character families, seam preservation, and component corrections without
changing prop matrices. Full uninterrupted GPU playback of the introduction
and Phoenix Mirror passes with local assets. Reviewed track-17/20 images show
the corrected Dragon Mirror grip; the second scene retains Ryo's mirror grip.
The rendered test compares the live detailed-hand and prop wrist matrices.
Earlier accelerated inspection runs hit audio-request cancellation assertions;
the final runs use normal playback without suppressing those checks.

The current opening package therefore exhaustively accounts for all 13 actor
tags in the selected A0114 AUTH tracks and the separately proven `RYUK`
attachment route. It intentionally does not treat every actor or object
declared anywhere in OP00's CHRT/script data as part of this cutscene: OP00
also contains resources for other events and inserts. A non-AUTH object is
included only when the opening's script reachability proves its use.

## Audio

`npm run build:op00-audio` resolves the opening's 48 AUTH voice commands from
the pinned `A0114.AFS`, its 266 sound cues from the pinned `A1_PROLG.SND`, and
the original `OPEN1`/`OPEN2` score streams from `BGM01.AFS`. Runtime-ready
files and their generated provenance catalog live under
`public/audio/world/op00`, while the two score tracks use the shared
`public/music` catalog. Three authored voice names are absent from the native
AFS and IDX and are recorded as native silence rather than substituted.
The aligned `A0114.SRF` records also provide exact speaker IDs, English source
text, normalized display text, and lip-sync cues. OP00 presents non-empty text
through the regular gameplay dialogue overlay for the lifetime of its voice
clip; empty native subtitle records remain empty.

The original owner starts named music with operation `0x015c`, which reaches
the native named audio-start helper `0x0c0b41f0`. The retained MAPINFO program
contains `OPEN1` at static pointer `0x22402`, called at `0x15516` in function
`0x1512a` before AUTH slot 0 (`0x15b80`). `OPEN2` is at `0x225dc`, called at
`0x17cea` in function `0x1785c` before slot 4 (`0x1816a`). The preview compiler
projects these source calls alongside the selected AUTH calls and retains the
referenced static strings. It does not assign guessed `activitySlot` starts in
the music catalog. Both scores outlive the shot that triggered them.

For catalog-only corrections, `node tools/cutscenes/build_op00_audio_pack.mjs --catalog-only`
verifies existing asset hashes and regenerates metadata without
re-encoding the audio. Full extraction remains available through the same tool.

## Regeneration

Run:

```sh
node tools/cutscenes/build_op00_introduction_assets.mjs
```

The builder uses `SHENMUE_DISC1_EXTRACTED_ROOT` when configured, otherwise the
repository's ignored `extracted_files` directory. It pins the three OP00 source
hashes and every required FACE pair,
refuses to overwrite nonmatching outputs, resolves reuse only by SHA-256,
validates all 148 motion references,
and writes deterministic manifests. Re-running it without source or code
changes produces byte-identical metadata.

`nativeSceneObjects` in the authored manifest are independent props rather than
extra character copies. Their generated lifecycle decides whether room-script
state or AUTH alone presents them. `nativeAttachedObjects` are script-
controlled FIXO props and remain a separate category. The generated inventory
records both categories' exact CHRT visual bindings; the shared scene-object
runtime composes persistent state with temporary AMOV ownership, while track-
scoped attachment adapters own FIXO props.
