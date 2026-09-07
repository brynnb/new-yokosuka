# OP00 introduction assets

The `S1-000` introduction uses generated metadata and exact browser-ready
assets. The game does not unpack `MAPINFO.BIN` or `OP99.AFS` when a player
starts a new game.

## Files

- `play/data/events/op00-introduction-scene.json` is the small authored scene
  manifest. It selects the environment, maps native actor tags, defines the
  private-instance contract, and names the canonical package.
- `play/assets/introduction/op00/manifest.json` indexes the 24 independent
  A0114 AUTH activities by native embedded-resource slot, with exact hashes,
  actor tags, motion names, audio strings, and effective native map state.
- `play/assets/introduction/op00/asset-inventory.generated.json` records every
  model found in `OP99.AFS`, its source entry, hash, canonical resolution, and
  exact archive child identity.
- `play/assets/introduction/op00/SEQDATA0.AUTH` through `SEQDATA23.AUTH` are
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

The six required non-player character models are not copied. Their OP99 bytes
match the existing canonical character files exactly, and the inventory points
to those files. The seven extracted OP00 environment models, six independent
scene-object models, and one attached mirror model had no canonical byte match
and are emitted once under `play/assets/introduction/op00/models`. The existing
production `S1_OP00_textures.bin` is referenced by identity and hash rather
than copied into this worktree. Extraction inventory and browser render
composition are deliberately separate: retaining a unique native resource for
provenance does not require rendering it in every scene.

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
