# Native cutscenes

Cutscene previews are not ready for public use. The `/play` welcome menu and
game sidebar intentionally omit their launch controls; the runtime remains
available for development. Run the cutscene Playwright suites against the Vite
development server: their helper opens the internal selector through its source
module, not a public menu button.

The current selector uses generated preview programs over original AUTH data.
These share the native program runtime but are not complete original room-owner
scripts. A working preview does not establish branching, realtime interstitial,
attachment, or persistent-state fidelity for the full original scene.

This document describes how Shenmue cutscenes should be recovered, packaged,
and played in the browser. A cutscene is treated as compiled native scene data,
not as a list of hand-placed recreations.

The implementation goal is:

```text
Original scene files
  -> deterministic extraction and validation
  -> generated cutscene metadata plus unique browser assets
  -> one reusable CutsceneSession runtime
```

OP00's `S1-000` introduction is the first complete vertical slice. Its
scene-specific inventory is documented in
[`op00-introduction-assets.md`](../research/shenmue1/op00-introduction-assets.md).
Shared environment assembly is documented in
[`scene-compositions.md`](scene-compositions.md).
Character attachment seams, protruding-triangle diagnosis, surface ownership,
and the unresolved neck-gap investigation are documented in
[character rendering and surface diagnostics](shenmue1-character-rendering.md).
Native OSAG hair and garment motion is documented in
[`native-secondary-motion.md`](native-secondary-motion.md).

OP02 entry `00` is the opening vision of Shenhua on the Guilin cliff with the
hawk. It is packaged as `op02-opening`, a separate self-contained cutscene
world. `tools/cutscenes/build_op02_opening_assets.mjs` pins the exact `MAPINFO.BIN`,
`SHD2.PKS`/`SHD2.PKF`, and `SHDR.PKS`/`SHDR.PKF` inputs and emits the four map
roots, Shenhua, the hawk, seven AUTH tracks, MGR face poses, the `M_0605` body
bank, the native `M_TORI` object-motion bank, and both SCROLL resources. Native
playback order is `0, 1, 2, 3, 6, 4, 5`; its two operation-`0x0098` writes are
preserved as numbered MAP01/MAP02 visibility state.

The vision's original owner starts `BGM019.SND` with sound command
`A82B0000` at `MAPINFO.BIN` offset `0x192`, before the first AUTH. The preview
compiler retains that command and the following verified no-output control
through the route's `startupSound` declaration. It follows the owner's
unconditional entry blocks, validates the exact arguments against
`ownerAudioCommands`, and rejects commands beyond a branch, call, wait, or
activity boundary. Merely registering a music filename does not start it.
Playback uses the existing native room-music transaction: one track across all
seven shots, released on completion, failure, or cancellation. This preserves
startup ordering, not the full original owner's fade/interstitial timing.
`tests/e2e/cutscene-music.spec.js` checks the real audio element's advancing
playback time across a shot change and its release on cancellation; the
interpreter integration tests also cover complete playback and startup failure.

`M_TORI.MOTN` must not be passed through the humanoid MOTN decoder. Its eight
`TMN_TAK_*` sequences use the engine's TMNM object-motion route (operation
`0x00ec`) and a node-oriented stream. The shared TMNM presentation selects the
authored hawk model variant and playback kind for each sequence; never
substitute a procedural wing-flap loop.

`SCROLL53.SCR1` and `SCROLL67.SCR0` use the shared native fullscreen-scroll
presentation, not scene-local sky geometry. The `SCR0` resource's `SCL0` and
`SCL1` records are vertical PVR tiles (`air67` at 512×256 and `air67b` at
512×64) which form one 512×320 image. The bare `SCR1` resource is the single
512×256 `air53` image. The `.SCR0`/`.SCR1` suffix is the native slot identity;
the program's slot transition and release operate on that identity. Exact
packed-corner colors remain in shared scene state until their renderer
interpretation is executable-proven. The signed SCRL words are
camera-registration angles: the native renderer combines them with the live
camera orientation and rebuilds the backdrop projection every frame. The
shared presenter therefore keeps the matte registered to camera yaw/pitch
within each AUTH shot while resetting its reference at authored shot
boundaries.

## Data ownership

### Package soundtrack lifetime

A package's default `startActivity: true` music cue begins with its first AUTH
and stays owned by the enclosing native program across subsequent activities.
An explicit `activitySlot` cue still belongs to that individual activity and
can replace the package soundtrack. Completion, failure, cancellation, and
world teardown release the music; replay starts a fresh stream.

CATA1 demonstrates why these lifetimes differ: the hash-verified JU00 script
starts `BGM051` with operation `0x006c`, arguments `[17576, 0, 0]`
(`A8440000`), at `0x21fd2` in first-activity callback `0x21e8c`. Its next two
callbacks contain no music-start command. Previously, shared activity cleanup
stopped the package cue and the next AUTH restarted it. The existing package
music runtime now preserves that cue through normal nested activity completion;
rollback and final program cleanup still reset it. This is a shared ownership
rule, not a kitten-specific override. The preview retains its existing looping
render, not the original callback's full sound-control/interstitial timing.
See `tools/evidence/cata1-native-lifecycle.json` for source hashes and offsets.

### Known scene-fidelity limits

- Fuku-san's letter (TGMA) uses the exact `FUB_F` face and face table with the
  `FUB_M` body. Native FUB TALK deformation remains unrecovered, so the declared
  neutral face fallback does not borrow incompatible FUK talk poses. Voice timing
  and the shared facial presentation still run.
- Kitten care (CATA1) has an ordered AUTH preview, but its package does not yet
  wire the recovered FIXO hand attachments into the shared attachment runtime.
  Native realtime interstitial logic and final persistent CATM/BOX1
  gameplay-state replay also remain incomplete. The shared attachment primitive
  exists; scene-specific extraction and registration are still required.
- Nozomi rescue presents the cinematic sequence, not the intervening interactive
  fights. A playable preview does not establish complete native gameplay fidelity.
- BEBF's nightmare preview still omits its original owner's music dispatch.
  Its `BGM129` command mapping exists, but unlike OP02 its startup commands have
  not yet been carried into the preview. A mapping alone is not playback proof.

For current capability priorities, run
`python3 -m tools.cutscenes.audit_player_cutscene_capabilities` and inspect
`tools/evidence/player-cutscene-capability-priorities.json`. The report records
input hashes; regenerate after selector, package, owner-program or corpus changes.
See [scene inventory](../research/shenmue1/player-facing-cutscene-scene-inventory.md) for
the distinction between selector entries and independently owned scenes.

No single file describes a complete cutscene. The browser package must join
several native resources without discarding their identities.

| Native resource | Required information |
| --- | --- |
| Room script and `MAPINFO.BIN` | Event selection, resource loading, and AUTH invocation order |
| `CHARA.CHRT` | Logical actor tags, `Image` references, exact `DefImage` model bindings, and associated-object presentation poses |
| AFS/PAKS/PAKF/IPAC archives | Models, texture families, and resource membership |
| AUTH `ASEQ` | Frame timing and commands for movement, motion, camera, voice, and sound |
| AUTH `AMOV` | Actor and scene-object position, rotation, and face curves |
| AUTH `ACAM` | Camera position, target, roll, and perspective curves |
| AUTH `ASTR` | Referenced voice, sound, and other resource names |
| MOTN/BIN motion banks | Exact animation sequences and controller matrices |
| `MODEL/FACE/*_F.MT5` and `*_FTBL.BIN` | Character face/eye geometry, control records, per-vertex control indices, and weights |
| `MODEL/FACE/TALK_*.BIN` | Seventy-five native control curves: three channels for each of 25 FTBL controls |
| `MODEL/HAND/*_TL.MT5`, `*_TR.MT5`, and `*_HM.BIN` | Detailed left/right hand geometry plus the paired 71-node, 306-vertex deformation layout |
| Voice/SND/BGM archives | Dialogue, sound effects, and music streams |
| Native object operations | Persistent presentation state, FIXO attachment parent/control, local translation, and fixed-turn rotation |
| Native operation `0x0098` | Per-track numbered MAP-layer visibility state |

The room script determines which resources belong to an event. Matching an
interesting filename or searching for a coincidental `TRCK` marker is not a
sufficient selection rule.

## Actor and object resolution

Every four-character AUTH actor tag must have exactly one runtime category:

- player actor;
- humanoid activity actor;
- independent scene object, such as a car, sign, or door;
- attached/carried object;
- visual-effect actor; or
- explicitly unsupported native actor.

Scheduled residents remain lazily loaded according to server presence during
ordinary exploration. Before a cutscene acquires them, AUTH preparation asks
the scheduled-actor runtime to load the required existing resident bodies. This
also covers offline previews and actors currently outside the world. It reuses
the world's model queue/cache, preserves an already active authored variant,
and leaves newly prepared bodies hidden until ownership begins. It must not
create duplicate activity-only NPCs or select an arbitrary loaded variant.
Resident preparation is repeated on replay even when AUTH/face assets are cached,
because those bodies belong to the current world visit. Cancellation leaves a
successful cached body unowned; world disposal aborts and discards late models.

Ordinary character and object model selection comes from `CHARA.CHRT`.
`DefImage` records map an image name to a model, while a `Character` record's
`Image` property maps its four-character actor tag to that image:

```text
Character actor tag -> Image property -> DefImage -> exact model
```

This distinction matters. AUTH contains `RMJN`, but the black-car model name is
`BMWS703G`; only the CHRT join proves that binding. Filenames, English labels,
and visual resemblance are supporting clues, not production mappings.

An actor absent from AUTH can still matter. CHRT may declare an object that is
controlled by script state, attached to a character controller, or used by a
different event in the same room archive. Therefore an AUTH actor inventory is
not a complete room-object inventory. Attached objects must be traced through
their script/attachment data instead of being promoted to independent AMOV
actors.

CHRT can contain two different positions in one `Character` record. A position
before its nested `Object` property is the inactive/parking actor position
(commonly `(100, 0, 0)`); the `Position` and `Angle` after `Object` are the
associated presentation's actual room pose. Preserve that structural boundary
and its offsets. Never select the first position in the record by name alone.

Independent objects have one of two generated lifecycles:

- `auth-scoped`: the object exists only while an AUTH activity owns it and is
  revealed after its first valid AMOV transform;
- `room-script-persistent`: the room script presents the object between AUTH
  activities, and AUTH temporarily owns its transform when the object appears
  in that track.

For the second lifecycle, recover the exact object-runtime and associated-
presentation operations (currently `0x001f` and `0x00a8`) and materialize the
effective Boolean state at every track boundary. Store the CHRT associated-
object pose as `initialPresentation`; only use the first AUTH pose as a
validated fallback when CHRT has no associated position.

The proven carried-object route is native operation `0x00e6`. Its five
arguments identify the attached object, parent actor, parent MOMT control ID,
local translation, and fixed-turn Euler rotation. Operation `0x001b` clears
the object's FIXO attachment. Preserve the exact call offsets and vector source
offsets in generated metadata; do not replace these with a guessed hand bone or
an artist-tuned offset.

## Extraction workflow

Keep the original disc extraction outside the runtime bundle. A builder reads
the exact source files and emits only validated browser inputs.

For OP00, the source directory is:

```text
extracted_files/data/SCENE/01/OP00/
```

The current deterministic builder is run with:

```sh
node tools/cutscenes/build_op00_introduction_assets.mjs
```

It uses `SHENMUE_DISC1_EXTRACTED_ROOT` when configured, otherwise the
repository's ignored `extracted_files` directory. The builder:

1. verifies the source file sizes and SHA-256 hashes;
2. selects the event's exact indexed AUTH resources;
3. recovers AUTH playback order from the room script independently of resource storage order;
4. parses ASEQ, AMOV, ACAM, and ASTR structurally;
5. resolves every motion command against its exact motion bank;
6. parses paired CHRT records and joins actor tags through `Image`/`DefImage`;
7. traces persistent and non-AUTH script objects through their exact native
   operations, including presentation-state and FIXO attach/detach calls;
8. inventories every archive model with its entry and child index;
9. reuses a canonical asset only when its bytes match exactly;
10. emits a model only when no canonical byte-identical asset exists;
11. recovers persistent scene-object writes and materializes their effective
    state before every track;
12. recovers per-track numbered MAP-layer writes and their effective inherited state;
13. resolves each supported actor's exact FACE model/table pair, retaining the
    body attachment key and FACE render keys; and
14. writes deterministic metadata containing source provenance and hashes.

Re-running a builder with unchanged sources must produce byte-identical output
and write no new files.

General cutscene tooling should accept a small selection descriptor rather
than duplicating OP00 constants. That descriptor should identify the native
area, event/track selection evidence, motion banks, audio sources, and the
post-cutscene destination.

## Generated package contract

A browser-ready cutscene package should contain or reference:

- a stable cutscene ID and label;
- native area and private-instance policy;
- indexed AUTH resources, explicit native playback order, and native frame rate;
- an environment-family composition and any event-only model overlays;
- fixed or inherited season/weather context and mutually exclusive environment
  variants;
- every actor's category and exact model binding;
- scene-object lifecycle, initial presentation, per-track effective state, and
  attachment bindings with CHRT/script evidence offsets;
- motion banks and sequence indices;
- resolved voice, sound, and music cues;
- exact character FACE model/table bindings and body attachment routes;
- source archive paths, offsets, byte lengths, and hashes;
- completion checkpoint and destination world; and
- an explicit list of unresolved native features.

Generated metadata is preferred over reparsing multi-megabyte game archives in
the browser. The metadata is reviewable, deterministic, and cheap to load,
while its source fields preserve the evidence needed to reproduce it.

## Browser architecture

Cutscene runtime code is divided by responsibility:

- `play/config/cutscenes.js` is the user-facing catalog. An entry selects a
  compiled program (currently a generated preview) and its package. It contains
  no loaders, authored playback order, or Babylon objects.
- `play/cutscenes/nativeCutscenePackages.js` is the immutable package registry
  data. It joins generated manifests, bundled asset URLs, actor definitions,
  presentation resources, environment metadata, and music cues.
- `NativeCutscenePackageRuntime` builds the shared actor, camera, audio, face,
  hand, object, attachment, and map-layer adapters from a package definition.
  The selected compiled program is the sequencing authority; every AUTH invocation
  acquires an activity sublease from the package's independently stored
  resources.
- `NativeCutsceneDirector` owns selection, gameplay-control acquisition,
  transport, completion, rollback, and world lifecycle. Native room-script
  activity operation `0x0050` is routed through the same package runtime rather
  than through a parallel AUTH implementation.
- `PlayNativeCutsceneDirector` is the composition root that joins the generic
  director to the production package registry.
- `play.js` supplies shared game dependencies once and invokes only director
  lifecycle methods. It must not import a cutscene's AUTH, motions, face tables,
  hand tables, object inventory, or audio manifest directly.

Package-specific metadata is expected; package-specific runtime branches are
not. Adding another activity from an existing package requires only a catalog
entry. Adding a new native source package requires generated package data and
assets, while the runtime changes only when that source reveals a genuinely
new native format or presentation command.

Source archives may store AUTH resources differently, but extraction
normalizes them into one activity-package contract. The browser does not model
an archive layout as a second playback strategy. Multi-activity scenes retain
between-activity state under the program lease, while each AUTH receives the
same presentation lifecycle.

## Runtime lifecycle

A `CutsceneSession` should own the complete presentation lifecycle:

1. load the isolated cutscene world;
2. prepare environment and object roots;
3. acquire player, NPC, object, camera, and audio ownership;
4. advance the native timeline at its authored frame rate;
5. release each track's temporary actors and objects;
6. stop or roll back cleanly on errors or world changes; and
7. enter the configured normal world after completion.

### Loading and failure ownership

World preparation and selected-program preparation are separate operations.
`NativeCutscenePackageRuntime.loadWorld()` acquires the environment resources;
`prepareCutscene()` prewarms the selected program's activity dependencies before
playback. Generated preview metadata supplies its exact clip set. Original
owner programs are resolved through their reachable functions, child calls,
and native resource bindings. Whole-archive prewarming is reserved for explicit
diagnostics: an unavailable clip from an unrelated scene must not block the
selected one. Multi-shot programs still prepare their complete selected set so
shot transitions do not initiate animation, FACE, or HAND loading.

The preview and director reserve cancellable startup ownership before awaiting
physics, world, avatar, or package preparation. Cancellation settles the menu
without a startup-error message and prevents a late result from acquiring
gameplay controls. Non-abortable work must settle before a replacement mutates
the same package; cancelling a promise is not equivalent to disposing resources
that another loader is still constructing.

Parallel presentation preparation waits for all siblings before reporting an
error. Reusable successfully prepared FACE/HAND entries remain owned by their
caches. An incomplete hand pair is different: neither side is published until
both validate, and a failure disposes every newly created side. Rejected cache
entries are evicted so a corrected asset or transient request can be retried.

### Bounded browser validation

Run the representative loading inventory against local Vite with restored
runtime assets and a WebGL-capable browser:

```sh
npx playwright test tests/e2e/cutscene-loading.spec.js --project=chromium --headed --workers=1
```

It exercises D0W0's independent scene variants, OP02's multi-shot program, and
CATA1's known-incomplete preview through the internal selector. Each test
requires an actual presentation lease and an advancing timeline, captures
rendered frames, then cancels back to the menu. Network failures without an HTTP
response are recorded alongside HTTP errors and runtime exceptions. Screenshots
and per-scene JSON records are local artifacts under `tests/reports/`.

These are launch/progress/cancellation checks, not full-scene completion or
visual-fidelity certification. Use `tests/e2e/cutscene-preview.spec.js` with
`NY_E2E_CUTSCENE_ID` for a complete playback check. Review captured frames before
claiming actors, attachments, or effects are visibly correct; parser and
simulated-presentation reports cannot establish that.

#### Observed browser inventory — 2026-09-07

Checked on the public client baseline `5c76c81d` with the loading-reliability
changes, local Vite, restored runtime assets, and headed Chromium using hardware
WebGL2. These are short samples, not complete playback runs or loading-speed
benchmarks. The initial strict suite reported one pass and two failures. The
actor-loading and soundtrack-lifetime follow-ups now pass all three launch
checks and both cross-activity music checks. Failures are not marked expected
or skipped; verified browser media-range cancellations remain in the reports.

| Selection | Observed result | Remaining issue |
| --- | --- | --- |
| `S1-D0W0-01` — Yamagishi's Advice | Follow-up passes: `YAMA:75e8096a55de` starts with zero loaded models; preparation loads its exact `YMG_L` body. Yamagishi is visible on the park bench, AUTH advances from frame 15 to 118, and cancellation returns to the selector without browser/asset errors. | Short sample only; later shots and full completion were not verified. No actor-specific model override or duplicate NPC was added. |
| `S1-OP02-00` — Opening Vision | All seven selected AUTHs prepared; rendered frames reviewed; music advances across the first AUTH boundary and stops on cancellation without browser/asset errors. | Later activities and full completion were not verified in the browser. |
| `S1-CATA1-01` — Megumi and the Kitten | Follow-up passes: three AUTHs prepared, rendered frames reviewed, `BGM051` advances from 0.71 to 105.06 seconds across the first AUTH boundary without restarting, and cancellation stops it at 108.54 seconds. | The original aborted requests are verified HTTP 206 Ogg range changes with healthy playback, not a missing asset. Full completion and the attachment/interstitial limitations above remain unverified/incomplete. |

The debug panel currently formats absent aggregate program-time fields as
`Track undefined` / `NaN`. The browser test observes accepted updates on the
actual AUTH runtime instead; it does not substitute a simulated presentation.
It imports the exact runtime module URLs observed on the page, preserving Vite
version queries so instrumentation cannot accidentally observe a duplicate class.

Yamagishi's failure was deferred residency, not ambiguous source mapping. His
definition is `authoritative: true`, `modelCode: YMG_L`, with no model overrides;
without a server snapshot his entry had `defaultModel: null` and `models.size: 0`.
The acquisition error now reports loaded/enabled counts so these cases are
distinguishable. `tests/e2e/cutscene-loading.spec.js` records preparation and
selection and asserts reuse of that exact resident.

CATA1's pre-fix browser run recorded music start → stop → start at the first
AUTH boundary (playback time reset to 0.16 seconds). The fixed run records one
start and one stop on cancellation. Its Ogg requests read the header, tail,
then buffered ranges; some return `net::ERR_ABORTED` despite status 206 and
healthy, unmuted playback (`readyState: 4`, no media error). Tests classify only
the observed playing track's range aborts after verifying clock progress and
owned cleanup, retaining the request details; HTTP errors and other unverified
failures still fail. Reports are under `tests/reports/kitten-music-verified/`.
The next content-facing work is the known CATA1 attachment/interstitial gap.

While a cutscene owns presentation, ordinary gameplay must not compete with
it. Disable controller simulation, gameplay camera updates, automatic room
events, camera-proximity NPC fading, multiplayer presence publication, and
durable location persistence. A cutscene-only room must never become a saved
login location.

Camera-proximity fading follows the director's active ownership as well as
the world's `cutsceneOnly` flag. CATA1 borrows normal Yamanose, so checking the
flag alone incorrectly made Megumi transparent in close-ups. The character
assembly supplies the existing scheduled-actor fade gate; that runtime restores
the original materials while disabled and resumes normal fading after release.
Authored texture transparency (for example hair cutouts) remains intact.

Normal `/play` worlds inherit `season`, `seasonIndex`, `weather`, and
`weatherIndex` from the server world-state snapshot. A cutscene may override
that context in its manifest when it depicts a fixed historical moment. Model
variants, lighting, precipitation, native map state, and browser cutaways are
separate constraints; the effective visibility is their intersection. A
season/weather update must never begin by enabling every root, because that
would undo native room-script or cutscene visibility.

The shared scene-composition catalog owns base models, resident models, and
time/season/weather groups for the small set of outdoor environment families.
Fixed cutscenes resolve an exact model set before loading. Live gameplay worlds
may keep all declared seasonal/weather roots resident so a server update can
switch them without reloading the area. Snow surface models are controlled by
`weather: snow`, not merely by `season: winter`; winter can be clear, rainy,
overcast, or snowy. A composition references existing canonical filenames and
does not create another copy of their binaries.

The shared MT5 loader applies `updateModelVisibility(sceneState)` when its
resident roots finish loading, before they are returned for world activation.
The same function still handles subsequent gameplay/viewer environment changes
and preserves individual-model inspection. Do not rely on a clock change to
initialize new geometry: CATA1's initial `currentSeason: 0` previously left both
`MAP08`/`MAP09` and `MAP10`/`MAP11` enabled because all variants loaded but the
environment value had not changed. This was a shared initial-load omission, not
an alternate cutscene season rule.

`tests/e2e/cutscene-environment.spec.js` checks CATA1's initial composition,
switches summer → winter → summer through the live environment runtime, and
follows authored playback into the second AUTH close-up. The 2026-09-07 headed
run verified one enabled model per variant pair, Megumi's original opaque
materials, and restoration of the gameplay fade gate after cancellation.
Reviewed screenshots and state records are in
`tests/reports/kitten-environment-verified/` (local, ignored artifacts).

Precipitation collision belongs to physical world geometry, not camera state.
After seasonal composition is resolved, `/play` snapshots the active map
surfaces as weather occluders. The weather runtime caches the highest surface
in one-metre world-space cells and retires snow or rain particles when they
reach that surface. Per-particle updates therefore perform cached cell lookups,
not mesh raycasts. A cutscene may subsequently hide a captured roof as a visual
cutaway without making that roof stop sheltering the interior. Do not infer an
entire shot's exposure by casting upward from the active camera.

All independent scene objects are loaded hidden to prevent a one-frame flash at
the model origin. Before an AUTH track starts, the runtime applies that track's
complete generated state for every `room-script-persistent` object: its CHRT
presentation pose and effective visibility. The AUTH activity then snapshots
that state, temporarily owns any participating object, and restores the
persistent pose and visibility at track end. An `auth-scoped` object remains
hidden until its first valid AMOV transform and is restored hidden at track
end. Applying persistent state before AUTH ownership is important: applying it
after the snapshot causes objects such as doors to disappear between shots.

This is a data contract, not a cutscene-specific runtime rule. New cutscene
builders supply lifecycle, presentation provenance, and exact per-track states;
the shared runtime does not know model names or special-case doors, cars,
signs, gates, or props. A complete state vector on every track also makes
direct seeking deterministic and prevents stale state from a prior track.

Layered environment geometry follows native operation `0x0098`, not camera
collision or guessed cutaway volumes. Preserve every script call offset and the
effective numbered state at each AUTH track. A track that performs no write
inherits the preceding state; generated metadata should materialize that
effective state so seeking directly to a track remains deterministic.

Do not equate MAP package child order with numbered layer order. The native
loader registers MAPM resources into the first available one of 32 records, so
a model-to-slot binding requires the room's complete resource registration
order. A package such as OP00 entry 27 proves which models are packaged
together, but not which global slots they eventually occupy. Applying its four
children directly as slots 0–3 hid the main `JIMENHAL` house and gate geometry
at the start of the opening.

For OP00, the generated timeline retains the exact operation-`0x0098` writes
and five script-controlled effective numeric states without attaching model
names to them. The browser composition keeps the seven OP00 environment roots
resident with their paired `OP99.AFS` texture packages; it does not substitute
BETD or JHD0 geometry. The browser scene also records one separate, visually
validated cutaway override: `OMADO` is hidden while the cutscene owns the
scene, then restored. Treat this as an explicit browser rendering
accommodation, not proof that `OMADO` owns a particular native numbered slot.

Attached objects require a separate adapter. Their world transform must be
derived from the authored character controller or attachment route each frame;
they must not be positioned with guessed hand offsets.

For a FIXO attachment, resolve the requested control ID against the active
parent model's complete MOMT controller family. Use that controller matrix even
when it has no directly rendered mesh, compose the authored local transform
before it, then apply the native-to-browser reflection. Hide the object until
both the parent actor and exact control matrix exist, and restore/hide it when
the owning track ends.

Do not hand-label a FIXO call with an AUTH track. Feed every selected track's
native setup-function offset and the attachment operation's call offset through
the shared `NativeAseqScriptOwnership` extractor. It recognizes generated SH-4
function prologues, stops at the next function boundary (including unrelated
room functions), selects the one track function containing the call, and
recovers the governing AUTH frame from that function's control flow. Generation
must fail when a call has zero or multiple owners. Emit the derived track,
frame, function start, and function end beside the call offset as provenance.
This prevents source-address order or TRCK storage order from being mistaken
for playback ownership. The shared attachment runtime consumes that derived
frame as well as the track: a prop remains hidden before its install frame and
uses the latest binding at or before the current frame. This also supports an
authored rebind later in the same track without a shot-specific visibility rule.

### Character faces

Shenmue I bodies contain a signed render-key `-67` (`-0x43`) subtree for the
native FACE presentation. The corresponding `MODEL/FACE/<code>_F.MT5` is not a
second complete character: its render-key-`3` primary node is the deformable
face and its `77`/`78` children are the eyes. While a facial presenter owns an
actor, it parents this separate face resource to the actor render root and
routes face key `3` from the live body attachment matrix. It must not hide the
whole body `-67` subtree: that subtree also owns the neck seam. Instead, body
and FACE triangle topology is matched by native atlas UVs and attachment-local
geometry. Only body triangles actually replaced by the FACE model are
suppressed; non-overlapping neck/back-of-head triangles remain, and cleanup
restores the exact original index buffers.

The primary FACE strip can contain negative vertex indices even though its
standalone HRCM root has no parent. These are not malformed local indices:
the standalone primary node replaces the body's low-detail `-67` node, so each
value addresses `bodyFaceParentVertexCount + signedIndex` in that node's
authored source parent. Convert the borrowed position and normal through the
inverse transform of the body `-67` node, exactly as the MT5 loader does when
both nodes live in one file. Resolving against the `-67` node's own vertex tail
instead stretches legitimate scalp triangles into spikes. The MT5 loader must
preserve unresolved signed offsets as vertex provenance; substituting FACE
vertex zero causes the same class of corruption. Bind the offsets only after
the exact body and FACE resources meet, before computing surface ownership.
Those borrowed seam vertices follow the shared head matrix and never
participate in FTBL deformation. Re-evaluate their triangle winding against
the corrected normals after binding because placeholder geometry cannot
determine culling.
An authored signed seam can legitimately let the detailed resource replace a
complete low-detail face attachment, as with Fuku-san; this is different from
blindly hiding an attachment subtree and still preserves any geometry outside
the proven detailed coverage.

Resolve that body subtree from the MT5 nodes' authored `parentAddr` links, not
from Babylon descendants. CPU and GPU character rigs intentionally flatten
node meshes beneath one mirrored content root after baking their transforms;
the visual scene graph therefore no longer expresses source ownership. Some
bodies, including Ryo's YKC model, store additional coincident face shells
beneath `-67`. Walking only the flattened parent mesh leaves those shells
rendering through the detailed FACE resource and can make the static face seem
to appear on the back of the head. Surface matching still decides which
triangles are replaced, so authored child hair and neck geometry survive.

Do not merge replaceable attachment subtrees into an undifferentiated character mesh.
The shared MT5 batcher accepts `preserveRenderKeySubtrees`; scheduled actors
preserve face `-67` and hand `-66`/`-65` subtrees, while the rest of each body
remains batched normally. This is a general character-rendering contract rather
than an OP00 actor exception.

`*_FTBL.BIN` is also not texture or UV metadata. It begins with 25 control
records, followed by parallel flat control-index and float-weight tables and a
per-primary-vertex contribution-count table. The primary vertex count comes
from the paired FACE MT5 because each binary section has independent padding.
The runtime validates all section bounds and control indices before creating a
FACE binding. Body and detailed FACE meshes do not always divide or texture
the same surface identically, so attachment integration compares their actual
triangle surfaces in native space. It removes body face/eye coverage within
three millimetres while retaining the geometrically separate neck. Proximity
alone is insufficient for coplanar overlays: replacement also requires the
same native surface kind from the trailing four texture-ID bytes. This keeps
Ryo's `KAM` rear hair cards distinct from the `KAJ` head shell while allowing
palette-prefixed variants of Iwao's `KAJ` face to match. Matching UV topology
or hiding the entire body attachment are both incorrect. OP00 has exact face
bindings for Ryo, Ine-san, Fuku-san, Iwao, and Lan Di; the two generic men
currently retain their body faces because no exact opening-specific FACE
binding has been proven for them.

Detailed FACE geometry is rendered as a clockwise, one-sided character
surface after X mirroring. A low-detail body triangle can straddle the
face/neck transition, so centroid overlap is not sufficient ownership. The
detailed FACE must cover all three body-triangle corners before that triangle
is removed; otherwise the complete transition triangle stays body-owned.
FACE resources do not use one uniform strip-sign
convention: Ryo's YKC resource is opposite to the other four OP00 resources.
The loader therefore orients each FACE triangle to its authored vertex normals
before culling rather than hard-coding either strip convention. Making the
result two-sided exposes the reverse of eye and facial atlas sheets through the
back of the head.

Debug material replacement must preserve both `backFaceCulling` and
`sideOrientation`. Mirrored character faces are clockwise; retaining only the
one-sided flag reverses their debug view, hides the exterior shell, and exposes
authored internal scalp triangles that are not visible in normal rendering.

The eye children retain their authored curved normals; neither flipping those
normals nor making the eye atlas unlit matches the original renderer. They are
separate detailed inserts with no attachment seam. The ordinary face/neck rule
keeps a coarse body triangle unless all three corners are covered, but applying
that rule to an eye can leave part of the low-detail eye directly beneath the
detailed one. For meshes under the binding's exact eye keys `77`/`78`, transfer
any matching body triangle whose surface actually intersects the detailed eye
coverage. Continue using the strict all-corners rule for the primary face shell
so neck transition triangles remain body-owned. Do not solve overlapping eyes
by changing emissive values, normals, depth bias, or actor-specific offsets.

Eyeball aim is a third FACE channel; it is not part of TALK and must not be
inferred from the active camera. Room-script operation `0x0099` mode `2`
copies an authored world-space target into the actor's FACE record, while mode
`0` returns both eyes to neutral over 16 native ticks. Targets commonly come
from an exact operation-`0x0019` query of another actor's MOMT controller type,
but the script can also supply a literal scene point. Preserve that distinction
in generated cues: resolve an actor component after the target actor's AUTH
motion for the same frame, snapshot the resulting world point, and continue
re-evaluating it against the viewer's moving head frame.

The first six signed dwords at FTBL offsets `0x0c..0x23` are the native
fixed-turn eye constraints copied to FACE `+0xb0..+0xc4`: one shared vertical
range and a separate horizontal range for each eye. Key `77` uses the first
horizontal pair and key `78` the second. These values differ by character and
must be parsed from the actor's table. `FUN_0c0bc824` converts the retained
world target into per-eye angles and divides the remaining error by the
request's remaining duration; `FUN_0c0bcaec` applies and clamps that step. The
browser routes an independent rotated world matrix to each eye node, leaving
the deformable key-`3` face matrix unchanged. OP00 generation retains each
proven `0x0099` call, governing AUTH frame, target provenance, transition
duration, and literal offsets or component-query call. This same command
schema is reusable by later cutscene builders without emulator capture or
shot-specific look directions.

Blink timing is evidence-backed: the original SH-4 face update schedules the
next blink at 60, 70, 80, or 90 native 30 Hz frames and transitions between
complete upper-face poses over two and four frames. Those pose numbers are not
FTBL control indices. `TALK_*.BIN` stores 75 native curves (three channels for
each of the 25 FTBL controls) across integer pose times `0..79` on two lanes.
`tools/animation/extract_native_face_poses.py` calls the original SH-4 function at
`0x0c090188` in a disposable Flycast session, supplies each pinned FTBL control
table, and records all 80 exact samples from both lanes. The generator validates
Ryo against an independent live trace before accepting the asset.

Room-script operation `0x0113` is the authored expression controller. Its
second argument selects a TALK clip base in multiples of six; its third selects
the current pose within that clip; and its fourth is the transition duration in
native 30 Hz ticks. The upper lane evaluates `clipBase + 0/1` for the open/blink
states, while the speech/expression lane evaluates `clipBase + selector`.
Opening-scene generation recovers these exact calls and their governing AUTH
frames from OP00 `MAPINFO.BIN`, including the two ranged bit-test loops. The
face presenter carries that state across adjacent AUTH activities and applies
SRF speech shapes within the currently selected clip. Resetting every track to
clip zero reproduces mouth opening but loses the authored brows, squints, and
eyelid expressions.

Voice timing does not come from duration-driven procedural animation. Each
native voice is paired with its record in the scene SRF archive. SRF cues store
a shape and 60 Hz duration; the recovered state machine maps all six shapes to
TALK poses, carries odd source ticks into a 30 Hz face clock, and prefetches the
next pose during the final four face frames. The renderer blends complete
generated control vectors and applies both TALK lanes through exact FTBL
per-vertex weights. A0114's AUTH lip index remains `0xffffffff`; its SRF record
is the authoritative association.

FACE pose output remains in native source coordinates. The GPU character-rig
loader has already baked its meshes into that space, and the shared mirrored
content root performs the one required X reflection. Do not negate the
deformed primary shell's X coordinate during a vertex update: child eye nodes
are independently skinned and are not rewritten, so an extra reflection moves
only the animated face to the back of the head.

The extraction inventory retains explicit `{shape, durationTicks}` records.
Generated browser dialogue modules losslessly pack each record as one unsigned
shape byte followed by one little-endian 16-bit duration under the versioned
`srf1:` marker. `NativeLipSync` expands that representation at playback; this
keeps Vite from building an enormous object AST without changing native data.

Each cutscene package must bind every voiced actor for which the exact FACE
resources exist; facial presentation is not a player-only facility. The DRAUTH
package is generated with `npm run build:drauth-faces`: it reuses Ryo's existing
YKC assets and bundles Smith's GIB and Tony's GIJ FACE/FTBL pairs without
duplicating shared assets. All three actors then use their own SRF cues and
actor-specific native TALK poses through the same presentation runtime.

Do not replace this with sine-driven jaws, duration loops, guessed eyelid
groups, or hand-selected eyebrow controls. The exact TALK lanes plus `0x0113`
timeline are the source of facial expression; the complete upper-face blink
pose prevents the former rapid-eyebrow artifact.

Some ordinary NPC body resources instead contain signed `-68` (`-0x44`)
lower-face patch nodes.
For example, Fuku-san has one attached patch plus two alternate copies stored
under a detached `-67` root. Rendering those copies at the character origin is
the old “extra jaw by the feet” bug. They remain suppressed and serve only as
authored closed/open vertex sources for the one attached destination patch.
The same SRF state machine drives that two-target controller; globally
unhiding `-68` is not a valid mouth-animation implementation.

The mouth targets use node-local coordinates, while prepared GPU meshes use
bind-world coordinates. Apply the authored open-minus-closed displacement in
the destination's bind space; retain its prepared closed geometry, including
welded seams and parent-owned vertices. Writing raw target positions into the
GPU buffer displaces the lower face even after speech ends. Making the mouth
buffer updatable must also preserve the rig's animated culling bounds.

### Character hands

Shenmue I character bodies contain low-detail left and right hand nodes at
signed render keys `-66` (`-0x42`) and `-65` (`-0x41`). Close presentation can
instantiate separate `MODEL/HAND/<code>_TL.MT5` and `_TR.MT5` resources. These
are not alternate complete bodies: each model has one 306-vertex hand rooted
in wrist-local coordinates. Resolve the body hand node itself and copy its live
world matrix to the detailed model every presentation frame. Do not attach by
the detailed model's positive root key: that key varies by character family
and is not the wrist attachment identity.

Do not disable the complete body hand subtree. Its signed `-66`/`-65` root
contains the low-detail hand and the proximal wrist ring that meets the sleeve.
Derive the detailed resource's proximal boundary from its own wrist-local
geometry: its longest attachment-space axis is the limb axis, and the endpoint
nearest the attachment origin is the seam. Keep body triangles that cross onto
the sleeve side of that plane and transfer every fully distal triangle,
including all low-detail finger descendants, to the detailed hand. Cleanup
must restore the exact original body index buffers. Detailed hand materials
follow the same mirrored-character contract as detailed faces: authored
triangles are oriented to their normals, then rendered clockwise and
one-sided. Hand overlays are not pickable, collidable, or camera blockers.
The ownership boundary must always use the detailed resource's immutable
authored source positions. Recomputing it from a pose-deformed hand makes the
cut depend on the preceding AUTH track and can consume the wrist seam when the
same hand is activated again in a later shot.

Selection must come from the event runtime or another exact binding, not from
finding a similarly named hand inside a room package. OP00 contains resources
for events beyond A0114. For the introduction, native save-state slot 5 proves
that Ryo uses global `YKB_TL/YKB_TR`; choosing the OP99 `YKD` pair merely because
it is present would bind a different resource family.

The low-detail body hands are not static placeholders while detailed hands are
absent. Room-script operation `0x0081` drives the native `MHND` controller: its
two subcontrollers write ten signed fixed-turn rotation words to the exact
right (`-65`, `25/26`, `28/29`, `31/32`) and left (`-66`, `40/41`, `43/44`,
`46/47`) body-hand routes. Extract its actor, channel, target-row index, and
native-tick duration beside each AUTH activity. Apply its constant signed-
truncating delta twice per 30 Hz AUTH frame after body MOTN matrices are
evaluated. In OP00, the frame-zero row-`0` request supplies Ryo's relaxed curl
before he reaches Ine-san; treating an all-zero hierarchy as the default rest
pose leaves every finger incorrectly extended.

Each actor's `HM.BIN` begins with six section offsets. The opening inventory
validates a 72-pair traversal table, 71 80-byte transform records, and influence
data for the detailed model's 306 vertices. Retain this exact rig with the two
models whether the active native record is zero or contains one of the authored
19-vector operation-`0x005e` tables. The first 71 pairs are the depth-first
`bone id, child count` traversal and the 80-byte records hold base transform
values plus bind-world matrices. Per-vertex influence counts select the paired
bone-index and float-weight streams; the bone indices address traversal/palette
order, while pose vectors address bone IDs.

Recover `0x005e` cues from each event's room script alongside its AUTH track.
The operation clears a 71-vector target, installs its 19 vectors in native slot
order, and advances toward it two native ticks per 30 Hz presentation frame.
Build the current palette by applying local translation followed by quantized
Z/Y/X rotations through the depth-first hierarchy, then perform the native
bind-to-current weighted deformation for positions and normal endpoints. Keep
pose state across adjacent AUTH activities, but reset it when a program starts.
Do not replace the body-hand surface with a detailed hand merely because the
resource has been prepared. Detailed ownership begins only when the first exact
`0x005e` cue requests that side; until then, `0x0081` continues to animate the
body hand. Preserve both controllers across adjacent AUTH activities and reset
them together when the program starts.
Do not synthesize finger curls from audio, generic sine curves, guessed joint
indices, wrist offsets, or actor-specific cuff cuts.

## Coordinate and facing rules

Native world positions currently enter the Babylon world as:

```text
browser position = (-native X, native Y, native Z)
```

Camera positions and targets use the same X reflection. Native source-order
actor rotations use reflected Y/Z angles. This coordinate conversion is
separate from model-facing correction.

Ryo's gameplay hierarchy already turns his raw `-Z`-facing MT5 model by 180
degrees. AUTH yaw applied to the gameplay parent therefore needs the matching
player-only 180-degree correction. Scene objects do not receive that player
correction. Tests should compare authored movement direction with rendered
forward direction so an exact 180-degree regression is caught.

## Audio

Resolve audio during the build:

- voice commands through ASTR and the event voice archive;
- sound commands through the event SND bank, including layered assets;
- music commands through the original BGM streams and exact start track; and
- absent native resources as documented silence rather than substitutions.

Each voice's aligned SRF record supplies its authored speaker ID, subtitle text,
and mouth cues. Preserve both the source text and a display form that expands
the native line-break and ellipsis controls. The runtime voice presenter uses
the same dialogue overlay and caption preference as ordinary NPC dialogue;
audio start, replacement, completion, and activity cleanup own the caption
lifecycle. Empty SRF text remains an uncaptioned vocal/nonverbal cue rather
than receiving invented dialogue.

The runtime audio adapter owns playback for the duration of the AUTH activity
and releases voice captions and temporary score tracks during cleanup.

## Validation

Every cutscene package should fail closed unless:

- every selected AUTH resource parses exactly;
- every AUTH tag has one declared runtime category;
- every AMOV index agrees with its ASEQ actor tag;
- every motion resolves to a valid sequence and controller family;
- every CHRT tag/image/model join is unique;
- every persistent object has exactly one initial presentation and one
  effective Boolean state at every track boundary;
- every mutually exclusive environment group resolves to one selection for
  the cutscene's fixed or inherited season/weather context;
- every required model and texture family is available;
- every model produces the expected root count in the production loader;
- every signed FACE attachment vertex resolves against its exact body parent
  and remains outside the FTBL deformation table;
- every voice and sound command resolves or is explicitly unavailable;
- unsupported object motion or attachment commands are reported; and
- every native attachment call has exactly one structurally derived track and
  governing frame;
- all emitted files match their generated hashes.

Use four test layers:

1. binary parser tests;
2. generated inventory and coverage tests;
3. Babylon NullEngine model/transform tests; and
4. scene checkpoint tests at important frames, such as a vehicle, prop, door,
   actor, and camera composition.

Visual checkpoints supplement the native evidence; they never replace it.

## Adding another cutscene

1. Identify the native area and exact room-script event.
2. Prove the indexed AUTH selection, native playback order, and motion/audio dependencies.
3. Inventory every AUTH tag and every relevant CHRT actor/object declaration.
4. Classify independent objects as `auth-scoped` or
   `room-script-persistent`, and classify attached, effect, and humanoid actors
   separately.
5. Decode nested CHRT Object poses and recover persistent object-state writes
   between activity calls.
6. Resolve canonical assets by hash before extracting unique binaries.
7. Generate the cutscene manifest and provenance inventory.
8. Register it in the shared cutscene catalog and instance policy.
9. Run parser, coverage, model-load, coordinate, lifecycle, and checkpoint
   tests.
10. Add it to the Cutscene Selection UI only after the package fails closed and
   can cleanly return to a normal world.

The long-term implementation should replace scene-specific `play.js` branches
with a generated cutscene catalog and one generic session/runtime factory.

## Corpus rollout and package readiness

Run `npm run build:native-cutscene-package-readiness` after changing a reviewed
native program, an AUTH inventory, an audio-bank proof, or a registered
activity package. The generated
`tools/evidence/native-cutscene-package-readiness.json` joins exact
operation-`0x013e` slot and pointer identities to their archive member and
parsed payload, then records separate owner, payload, motion, audio, and
package gates. Its current `production` / `registered-and-runtime-tested`
labels mean a binding is packaged without a listed blocker, not that a browser
run was observed. Treat them as packaging diagnostics, check recorded input
hashes for freshness, and use browser results separately. Parsed but incomplete
tracks retain their concrete dependency blockers.

`tools/lib/NativeAseqActivityPack.mjs` is the shared deterministic compiler for
archive-backed AUTH activity families. A package may reference a canonical
motion bank outside its source archive only by exact path, byte length, and
SHA-256. The compiler parses and verifies that asset but does not copy it into
the package directory. This is the expected approach for shared banks such as
`M_ZAKO.MOTN`.

The readiness report is deliberately narrower than the full 136-MAPINFO / 491
logical-AUTH corpus: an archive located near a room is not a cutscene owner.
Additional rows appear only when the complete player-facing program closure
has been reviewed and its exact resource install is retained by the generated
program pack.

YQ14 is the first rollout after DRAUTH to exercise all of these package gates.
The YQ14 MAPINFO resource cluster binds `E1002` to `A01114`,
`N1014_4.SND`, and its room/event scripts. The exact bank covers every authored
`a90f` command, while `A01114.AFS` supplies the two voice streams and aligned
SRF caption/lip records. The room CHRT maps AUTH tag `BIN_` through image
`BEER` to model `BERHI204`; the corresponding `BINS501G.CHRM` archive member is
therefore package-owned. `NativeCutsceneSceneObjectLoader` instantiates such
assets through the normal standalone MT5 texture resolver and disposes them
with package world ownership. This is the reusable rule for later cutscene
props that do not already belong to a world placement catalog.

## Compiled owner programs, not browser playlists

The browser playlist stack was removed when OP00 moved to the canonical
compiled-program and activity-package path. This file records the deletion
boundary; it does not define a compatibility mode.

The machine-readable audit is generated by
`tools/cutscenes/audit_native_playlist_removal.mjs` into
`tools/evidence/native-playlist-removal.json`. Its focused test verifies all of
the following:

- OP00's compiled MAPINFO owner is exact and has no unresolved operations;
- its 24 selected AUTH resources retain their source offsets, lengths, and
  hashes;
- each resource is an independently stored, hash-matched activity with a
  `map-embedded-slot` binding;
- the owner completion boundary remains immediately before unrelated slot 24;
  and
- production config, cutscene, event, and generated-event sources contain no
  playlist runtime, playlist schema, playlist package kind, handwritten OP00
  timeline, or combined OP00 authpack reference.

## Canonical ownership

Every selectable native cutscene enters through a compiled program. Current
selectors use generated preview programs rather than the complete original
room owners. The program holds the scene lease and sequences activities. An
AUTH call acquires an activity sublease by its native binding; the package
retains actors and prepared resources across activity boundaries where native
ownership requires it.

This preserves repeated calls without duplicating resource bytes. For example,
BEBF's owner order remains:

```text
60, 61, 62, 60, 63, 62
```

OP00's generated preview retains the 24 selected AUTH calls recovered from
MAPINFO. Preserving that sequence is not proof that every original owner
operation executes during the preview.

## Removed surface

The clean break deleted:

- `NativeAseqPlaylistRuntime` and its playlist-only tests;
- the `new-yokosuka-aseq-playlist-v1` generated schema;
- OP00's combined `OP00_A0114.authpack` and handwritten timeline output;
- playlist-versus-activity branching in package selection and playback;
- playlist-specific track callbacks and music cue fields; and
- stale documentation that treated an archive storage layout as a runtime
  strategy.

Extraction and evidence tools remain source-controlled. If later research
changes an interpretation, regenerate the compiled program and activity pack;
do not restore a parallel playlist path.
