# Native cutscenes

The general cutscene preview selector is not ready for public use. The `/play`
welcome menu and game sidebar intentionally omit its launch controls. The
runtime also serves the new-character opening described below. Run the cutscene Playwright suites against the Vite
development server: their helper opens the internal selector through its source
module, not a public menu button.

The current selector uses generated preview programs over original AUTH data.
These share the native program runtime but are not complete original room-owner
scripts. A working preview does not establish branching, realtime interstitial,
attachment, or persistent-state fidelity for the full original scene.

## New-character opening

Creating a character currently starts these packaged scenes in order:

1. `S1-OP02-00`: Shenhua and the hawk.
2. `S1-000`: Iwao's murder.
3. `S1-OP00-MAIL`: the postman and Ine-san collecting the letter.
4. `S1-OP00-DREAM`: Ryo tossing in bed, the Lan Di/Iwao montage, and awakening.

The continuation uses the original OP00 embedded AUTH selections, not BEBF's
later Shenhua nightmare. Both packages use the shared activity compiler and
runner, with their original motion banks, actors, props, voices and music.
See source provenance, regeneration commands and remaining presentation limits in
[OP00 introduction assets](../research/shenmue1/op00-introduction-assets.md#post-murder-opening-continuation).

`NewCharacterOpening.js` sequences the shared runner; it does not implement
another renderer or emulate the original game's full story-flag progression.
The existing transport applies: Space advances five seconds; X ends the current
scene and proceeds to the next. Runtime failures stop startup with an error.

A character without `lastLoginAt` needs the opening. Multiplayer connects only
after the opening and final world load, so the server's existing first-login
timestamp is not written during a cinematic. Reloading an interrupted opening
retries it. Returning characters with a timestamp keep their saved entry flow.
Gameplay movement, its camera, and automatic story triggers remain held across
scene-loading gaps. After awakening, the normal world initializer restores the
selected avatar at the original JOMO entry 1 beside Ryo's bed, facing the bedroom
door, before revealing the room or releasing control. Both completion and X-skip
use this arrival; returning characters still resume their saved location. The
source is OP00's final map request at `0x2054e` and JOMO's entry record at
`0xcab14` (see `tools/evidence/map-entry-points.json`). Player/camera reset uses
the normal world initializer. Facing is intentionally aimed at the center of
the `dor7` opening (its authored hinge plus half the closed door's 0.9-unit
width), rather than the native entry's straight-ahead wardrobe-facing heading.
Server time is unchanged. Cinematic Ryo and
cutscene positions are never published as presence.

`tests/e2e/new-character-opening.spec.js` uses real creation UI and GPU-rendered
playback with mock account/transport boundaries and the unrelated external TV
stream excluded. It advances the vision and mail via Space to native completion,
skips the murder with X and covers both X-skip and completion of the Lan Di dream,
holds the murder package's preparation for over five seconds to verify the loading
overlay, and checks the bedside position, facing, restored avatar and movement
toward the door. It is an accelerated transition test,
not a substitute for real-time cinematic visual review.

World readiness does not reveal a preparing cutscene: it explicitly defers the
shared loading-screen reveal until the director has established its first
camera/pose. The loading overlay then fades out over 500 ms as playback advances.
Natural completion and X-skip hold the last displayed frame and fade to black
over one second **before presentation cleanup**, then the next package starts
loading. The last completed AUTH shot retains its surfaces and pose until
replacement or program teardown; otherwise a detailed face can disappear before
the program requests its fade. `NativeCutsceneDirector.end` is the user-facing
covered stop; immediate `stop` is reserved for cancellation during preparation,
world teardown and disposal. Final world
initialization also covers avatar restoration and uses the same 500 ms reveal.
See [shared transition phases](world-loading-and-transitions.md#loading-responsiveness).
Only these four intro scenes provide a `loadingPresentation` in the cutscene
catalog. The shared loading screen retains its title and civil date/time through
nested world preparation and server-clock refreshes, without changing the actual
world clock or environment. The cards are:

| Scene | Caption | Date/time |
| --- | --- | --- |
| Shenhua and the hawk | Guilin | November 28, 1986, 5:30 pm (estimate) |
| Iwao's murder | Yokosuka | November 29, 1986, 4:00 pm |
| Ine-san's mail | 4 Days Later... | December 3, 1986, 8:30 am |
| Lan Di dream and awakening | Hazuki Residence | December 3, 1986, 8:50 am |

The hawk vision's calendar date is not established by the available lore sources.
[Shenhua's prologue description](https://shenmue.fandom.com/wiki/Shenhua_Ling)
identifies the prophecy, not when the shot occurs. Sunset on the day before the
murder is an intentional presentation estimate, not recovered native metadata
or a claim that the vision is a canonical flashback. The murder's November 29,
4:00 pm setting and the four-day jump are also described in the
[scene walkthrough](https://www.neoseeker.com/shenmue/faqs/1593059-l.html).
ISO timestamps use UTC fields for the existing game civil-time formatter;
these captions do not perform timezone conversion. Other cutscenes and final
gameplay initialization use the shared server world clock, without an 8:55 override.

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
and the shared animated neck-seam correction are documented in
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
An explicit `activitySlot` identifies when a score starts, not when it ends;
it can replace the current soundtrack and remains owned across later uncued
activities. OP00's 82/249-second OPEN1/OPEN2 streams were previously truncated
to 28/27 seconds by conflating those lifetimes. Completion, failure, cancellation, and
world teardown release the music; replay starts a fresh stream.

OP00 no longer guesses its music triggers from activity slots. Its native
`0x015c` calls resolve the static names `OPEN1` and `OPEN2`. The preview compiler
retains those commands and their strings in owner control-flow order before
the next selected AUTH (slots 0 and 4 respectively). Registering a score in the
audio catalog alone is not an executable start cue.

CATA1 also demonstrates why music outlives individual AUTHs: the hash-verified JU00 script
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
  `FUB_M` body. Its 80 upper-face and 80 mouth poses now come from the original
  SH-4 TALK builder with the FUB table, not foreign FUK deltas or a neutral
  fallback. The retained extractor independently validates Ryo's pose output
  before evaluating FUB. GPU playback, replay/cancel, and changing rendered
  face vertices passed on September 28. Additional diagnostic front views at
  frames 300 and 620 show different mouth/eye expressions with intact face and
  neck geometry. These are test-only cameras, not altered authored shots or
  proof of exact phoneme synchronization with the Dreamcast version.
- Kitten care (CATA1) now registers the recovered FIXO hand attachments in the
  shared attachment runtime. Full browser playback and targeted hand-prop
  screenshots verify the cinematic path. Native realtime interstitial logic and final persistent
  CATM/BOX1 gameplay-state replay remain outside this cinematic preview.
- Nozomi rescue presents the cinematic sequence, not the intervening interactive
  fights. Its sequence is `[0|3, 1, 2]`: one chosen lead-in, the confrontation
  once, then the aftermath. The second slot-1 call in native interstitial
  `0x74960` is conditional and loops back into the fight; it is not a mandatory
  repeat. The former `[0|3, 1, 1, 2]` preview mistakenly flattened that branch.
  The exact aftermath callback attaches the existing AIRO toy airplane to KKEN
  control 12 before playback and detaches on completion. A playable preview
  does not establish complete native gameplay fidelity.
- BEBF's nightmare preview now dispatches `BGM129` through the compiled program.
  The source trigger is callback
  `0x4bb38` at frame zero (`0x006c` call `0x4bbb0`), selected for slots 61/63
  by helper `0x4b4f8`. It is not an unconditional startup command like OP02's.
  The retained callback extractor and package builder preserve this activity
  binding and both exact sound commands. September 22 full-browser evidence
  (`tests/reports/cutscene-bebf-music-sept22-retry1/`) proves music advances from
  the second into the third shot and releases after all three shots complete.

For player-facing verification, use the
[browser validation workflow](#bounded-browser-validation). The
older `audit_player_cutscene_capabilities` report ranks full native owner-script
reconstruction from its supplied selector/readiness inputs (the saved report
still describes 46 selectors). It is a research lens, not a completion gate or
work queue for the current 58 good-enough previews. Its input hashes must be
refreshed before reusing those historical counts.
See [scene inventory](../research/shenmue1/player-facing-cutscene-scene-inventory.md) for
the distinction between selector entries and independently owned scenes.

### September 28 presentation verification

The three-priority pass covers FUB talking deformation, attached-prop gaze,
and fixed source wrist-controller corrections through shared presentation
systems. Extraction tools and original-byte provenance remain in the repo.

- 44 focused tests passed for the affected compiler, resources, lifecycle,
  face deformation, gaze, hand attachment, and dynamic-correction omission.
- Full GPU playback, immediate replay, and cancellation passed for TGMA,
  DJHN-03 (Wang's letter target), D0W0-01 (Yamagishi), and DRAUTH-02.
- Targeted rendered wrist checks passed for D0W0-01, TGMA, HOUO, JHW0-06,
  DRAUTH-02, and TOKI. Reviewed diagnostic close-ups show the corrected hand
  geometry and cuff connections. These checks do not claim exact contact in
  every frame or complete playback coverage for all six scenes.
- Browser preflight confirmed hardware rendering on AMD Radeon RX 9070 XT;
  these were not software-rendered or headless state-only checks.

Repeat the targeted tests with `tests/e2e/cutscene-faces.spec.js`,
`cutscene-gaze.spec.js`, and `cutscene-wrists.spec.js` using the browser
validation workflow below. Tests label diagnostic camera images separately
from authored-shot images and wait for actual rendered frames before capture.
Remaining approximations are the shared LKPT angular limits/smoothing and
CATA1/SAKR dynamic wrist feedback described below. They do not require a new
per-cutscene renderer or a complete native script interpreter.

### Exact attachment identity

Attachment, visibility, and articulated-prop cues now compile to `activityId`,
not a mutable native activity slot. The existing OP00, TOKI, TGMA, and DJHN
builders were regenerated with that contract; there is no slot-only browser
fallback. A generator may resolve a native slot only when exactly one resource
uses it. CATA1's three resources all use slot zero, so its callback/resource
association is explicit.

CATA1 extracts callbacks `0x24050` and `0x25958` from hash-verified JU00 MAPINFO.
NBO1/2/3 attach at frame 1, change hands at 140, and detach at 270 in SEQDATA1;
ABRG attaches at 1 and detaches at 120 in SEQDATA2. The shared extractor follows
unique predecessor blocks when native code reuses parts of a vector; it rejects
unresolved values instead of borrowing nearby writes from another branch.
These props borrow the existing CHRT-tagged scene roots. AUTH-driven props keep
their world hierarchy and return to authored poses on detach, while props with
no AUTH track hide on detach. Package teardown releases borrowed presentation
before disposing scene roots.

Package actors also suppress a resident world placement with the same native
`runtimeObject.objectTag` during their program lease, then restore its prior
visibility. This removes duplicate cinematic/world actors without deleting the
world model or hiding unrelated actors by filename/species.

The actor program also borrows the gameplay avatar's render visibility when
its cast uses separate bodies and contains no player tag. OP00's dream uses
`AKI_` sleepwear Ryo rather than gameplay `AKIR`; the ordinary avatar stays
hidden for that program while the cinematic body follows the shared shot
mask. Gameplay's first-person visibility updater yields to this ownership,
and covered program cleanup restores the exact prior visibility.

Regenerate the retained callback evidence with:

```sh
python3 -m tools.cutscenes.extract_native_aseq_callback_ir --disc 1 --area JU00 --map-entry 0x4d284 --callback 0x24050 --output tools/evidence/cata1-seqdata1-native-callback-ir.json
python3 -m tools.cutscenes.extract_native_aseq_callback_ir --disc 1 --area JU00 --map-entry 0x4d284 --callback 0x25958 --output tools/evidence/cata1-seqdata2-native-callback-ir.json
node tools/cutscenes/build_cata1_activity_pack.mjs
```

DJHN also needs the shared room letter, not just the soda can. D000 `OMG.PKS`
contains `MALS509G.CHRM` (1452 bytes, SHA-256
`0d5182cde209ca1c188e4a7af48f65e79d0d5713469bd2c951a0af69a624dd39`).
The retained callback extraction supplies MALS's controller-18 attachments and
hinge-152/153 folding in SEQDATA3 (frames 580, 700, 1160) and SEQDATA5
(239, 678). A same-frame detach/rebind compiles to its final source attachment.
The shared extractor accepts an explicit object-tag selection for callbacks
that also own unrelated actors and room cleanup; default extraction remains
strict. DJHN selects MALS and YKHI in callback `0x891b8`. Its original base-vector
query `0x89ae8` supplies MALS to the look-point control at `0x89b06`, on frames
675–980, with release at 981. The shared target resolver now accepts declared
object bases as well as actor components; it refreshes the attachment after
the current frame's body motion, rather than aiming at the previous frame's transform.
The original LKPT consumer is controller type 4. The browser follows that
neck branch (including descendant render and attachment matrices), without
accumulating corrections into MOTN. **Approximation:** native selector-specific
angular limits remain unrecovered; all actors use a conservative ±45-degree
limit and six-frame error smoothing. Detailed FACE eyes use the same target
where available; Wang has no separate FACE asset. GPU-rendered DJHN playback,
target release, immediate replay, and cancellation passed on September 28;
frame 975 visibly shows Wang turned toward the letter. This is good-enough
target tracking, not an exact reconstruction of the native angular controller.

```sh
python3 -m tools.cutscenes.extract_native_aseq_callback_ir --disc 1 --area D000 --map-entry 0x8e3fc --callback 0x891b8 --output tools/evidence/djhn-seqdata3-native-callback-ir.json
python3 -m tools.cutscenes.extract_native_aseq_callback_ir --disc 1 --area D000 --map-entry 0x8e3fc --callback 0x8a44c --output tools/evidence/djhn-letter-native-callback-ir.json
node tools/cutscenes/build_djhn_activity_pack.mjs
```

BUSS demonstrates the same distinction for vehicle parts: AUTH animates the bus
and passengers, but the room callback opens and closes its folding doors.
Boarding callback `0x6c30c` initializes nodes 153/154 from static MAPINFO vectors;
arrival callback `0x6c60c` initializes nodes 157/158/155/156. They launch helper
`0x6cb8c` at frames 100 and 132 respectively. Its inclusive 0–30 counter applies
the original integer hinge increments. The retained extractor compiles those
poses and bounded loops to the existing articulated-object cues, scoped to each
exact AUTH variant. It does not emulate the unrelated traffic/room controller.
The attachment runtime borrows the existing bus root, and restores its moving
parts on completion or cancellation without taking ownership of AUTH movement.

```sh
python3 -m tools.cutscenes.extract_native_aseq_callback_ir --disc 1 --area D000 --map-entry 0x8e3fc --callback 0x6c30c --output tools/evidence/buss-boarding-native-callback-ir.json
python3 -m tools.cutscenes.extract_native_aseq_callback_ir --disc 1 --area D000 --map-entry 0x8e3fc --callback 0x6c60c --output tools/evidence/buss-arrival-native-callback-ir.json
python3 -m tools.cutscenes.extract_native_aseq_callback_ir --disc 1 --area D000 --map-entry 0x8e3fc --callback 0x6cb8c --output tools/evidence/buss-door-native-callback-ir.json
node tools/cutscenes/build_buss_activity_pack.mjs
```

The same callback extractor handles FIXO initialization before the first ASEQ
start and resets on its completed exit path. Both require a unique control-flow
path; an unresolved conditional/timed call is not assigned frame zero. EVSN's
aftermath uses this for the child's toy airplane:

```sh
python3 -m tools.cutscenes.extract_native_aseq_callback_ir --disc 1 --area JD00 --map-entry 0x76b90 --callback 0x729e0 --output tools/evidence/evsn-aftermath-native-callback-ir.json
node tools/cutscenes/build_evsn_activity_pack.mjs
python3 -m tools.cutscenes.build_native_activity_preview_programs
npm run build:native-event-program-pack
```

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

Playwright uses hardware GPU rendering by default. The shared launch settings
in `scripts/testing/playwright-renderer.mjs` select full Chromium and, on Linux,
Vulkan/ANGLE. This follows [Chromium's headless GPU guidance](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/using-gpu-hardware-in-headless-chrome.md).
The `renderer-preflight` project requires WebGL2, checks a rendered pixel, and
rejects SwiftShader/llvmpipe before scene tests start. Full cutscene inventories
also record and validate the actual Babylon renderer. Do not skip dependencies
or launch ad-hoc diagnostics with bare `chromium.launch()`; pass
`playwrightRendererOptions()` to reuse the same settings.

The Docker wrapper passes `/dev/dri/renderD*` nodes and their groups, builds a
version-matched Mesa/Vulkan image if needed, and limits the container to four
CPU cores by default, 8 GiB RAM, and no swap. It uses private 512 MiB shared
memory rather than host IPC. Host browser runs have the same RAM/swap ceilings
through a transient systemd user service. Node tests are capped at 2 GiB, with
a 1 GiB heap. The launchers share a per-user lock across worktrees and reject
overlapping runs. See [test resource safety](../../tests/README.md#resource-safety);
use the npm launchers, not bare Node/Playwright commands.
`PLAYWRIGHT_DRI_DEVICE` can select one explicit render
node. This accelerates drawing, not game JavaScript or asset decoding; keep
rendered runs serial. For an intentionally software-only CI environment,
`PLAYWRIGHT_SOFTWARE_RENDERING=true` is an explicit opt-out, never an automatic
retry after a failed GPU check. Such runs can consume substantial CPU.

Full-playback verification uses the current generated preview program and its
activity manifests for both the expected shot order and scene-dependent timeout.
Repeated activities count toward the timeout. Menu return alone is not a pass:
the test requires the matching program's explicit `completed` settlement and
every expected activity's final authored frame. Sample/cancel tests instead
require a `cancelled` settlement. Saved inventories distinguish full browser
playback from rendered visual review; screenshots are not automatically marked
reviewed.

Run the full list with stop-on-first-failure, then fix and rerun the failing
scene before resuming the rest:

```sh
npm run test:e2e:cutscenes
NY_E2E_CUTSCENE_ID=S1-HOUO-01 npm run test:e2e:cutscene
NY_E2E_CUTSCENE_START_ID=S1-TOKI-01 npm run test:e2e:cutscenes
```

Use the actual failed/next scene IDs from the run. Supply a distinct Playwright
`--output` directory when preserving results across retries; Playwright cleans
its output directory at the start of a run. These tests use one browser worker
so a failure can be fixed before proceeding to the next scene.

For concurrent development, use a separate server without hot reload:

```sh
VITE_OFFLINE_ASSETS=true node scripts/testing/start-cutscene-test-server.mjs
# In another terminal:
E2E_APP_URL=http://127.0.0.1:5176 PLAYWRIGHT_SKIP_WEB_SERVER=true npm run test:e2e:cutscenes
```

Stop that server with Ctrl-C and restart it after fixes; it caches transformed
modules without watching source files. This avoids reload-invalidated runs but
is not an immutable checkout snapshot. It leaves the ordinary port-5175 server
untouched. The offline-assets flag uses the documented local runtime assets;
it does not publish new assets remotely.

Run the representative loading inventory against local Vite with restored
runtime assets and a WebGL-capable browser:

```sh
npm run test:e2e -- tests/e2e/cutscene-loading.spec.js --project=chromium --headed --workers=1
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

Full runs now save start/early/late AUTH segment images and source-derived prop
checkpoints, and require registered props from the current compiled manifests.
Prop-checkpoint images temporarily hide only the HTML captions so hands can be
inspected; the inventory marks these with `hiddenCaptions: true`. Other images
retain the player UI. An AUTH segment may contain multiple camera cuts: these
samples are targeted evidence, not an exhaustive visual review of every cut.
Set `NY_E2E_CUTSCENE_REPLAY=1` on the single
scene command to replay through the same live selector after completion, then
cancel and assert that program, activity, attachment, and music ownership are
released. This deliberately does not reload the browser between plays.
Set `NY_E2E_CUTSCENE_VIDEO=1` on that single-scene command when motion review is
needed (for example OP02's captured skirt). The resulting WebM is retained in
the chosen report directory; recording a video does not automatically mark it
visually reviewed.

#### Verification scope

Keep these three kinds of evidence distinct:

| Evidence | What it establishes | What still needs checking |
| --- | --- | --- |
| Asset/parser and headless runtime audit | Required data loads and the simulated presentation reaches its terminal state. | Actual browser rendering, media playback, and visible scene composition. |
| Full browser playback | The expected activities reach their final frames, explicit completion occurs, and no captured runtime/resource error remains. Compiled music cues are checked for playback and release. | A scene can still omit an unregistered prop or render an incorrect face while completing successfully. |
| Reviewed screenshots or video | The named actors, props, shots, or motion are visible in those samples. | Unsampled cuts and frame-perfect agreement with the original game. |

September 22 checks supersede the earlier launch-only results for OP02 and
CATA1: both complete their full selected sequence and pass immediate replay
and cancellation. OP02 additionally has temporal review of the later skirt
shots and hawk poses. CATA1 has rendered hand-prop checks; its original realtime
interstitials and persistent gameplay outcomes remain outside the preview.
Yamagishi's initial variants completed but exposed overlapping low-detail
face geometry. The shared face replacement fix was then verified in a full
D0W0-03 run and a Ryo/Nozomi scene, including replay and cancellation.

The September 27 serial GPU sweep refreshed successful full-playback evidence
for all 58 selections: 46 completed before a HIHY attachment-seam failure;
after fixing its shared parent-vertex binding, the remaining 12 completed.
The retained hand audit matches delivered commands for all 58 across those
two runs. HIHY and HOUO also passed focused immediate replay/cancellation
checks. This is stop/fix/resume coverage, not one uninterrupted all-scenes
regression on a single source snapshot. Rendered samples were reviewed for
each selection, including hands where visible; off-camera hands are not a
visual pass. The review also caught undersized KKYB mirrors despite successful
playback, demonstrating why browser completion alone is insufficient.
After restoring their source-authored entry scale, KKYB passed focused GPU
playback/replay/cancellation and reviewed motion samples show both mirrors.
Do not present either that coverage or the headless 58/58 result as exhaustive
visual or original-game fidelity. Local inventories and
review notes must identify which run and sampled frames support a claim;
the existence of a screenshot alone does not mark it reviewed. Tests and
reporting conventions are reproducible from the commands above, while raw
reports and transient progress logs remain local artifacts.

Media diagnostics retain failed requests. Chromium can cancel an Ogg header
range before reading the seek table at the end of a file. For a still-playing
ambient stream, the test classifies that abort as expected only after a
different byte-range request completes successfully and the same media source
advances without a media error after the abort. An aborted or unsuccessful
replacement, stalled playback, and unverified requests remain failures.

As a deliberate good-enough presentation choice, the Shenhua nightmare (BEBF)
hides both blanket variants (`FUT1` and `FUT2`) for sleeping, dreaming, and waking.
The generator resolves their model names from the existing JOMO placements and
uses the shared root-visibility lease, not a blanket-specific runtime. Ending or
cancelling restores the borrowed props; ordinary room rendering is unchanged.
The opening Lan Di nightmare (OP00) does not load these separate blanket props
and already shows Ryo without a blanket cover. Beds and pillows are retained.
Native blanket deformation and BEBF's sleeping-Ryo resource binding remain
unrecovered, tracked in [issue #3](https://github.com/brynnb/new-yokosuka/issues/3).
Omitting the covers is not an implementation of their original animation.

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

The converted attachment matrix belongs under `model.renderRoot`, not the
outer actor root. Source controller matrices are model-local; characters also
have model orientation, scale, and grounding between those roots. Skipping
that transform placed CATA1's fish over four world units from the rendered
hand. The shared adapter now uses the rendered-model hierarchy for standalone
props and borrowed scene props alike. The focused browser attachment test
compares their world position with the source controller composed through the
actual character content root; separate full-playback evidence is still needed.

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

The detailed shell can reference a parent vertex that the coarse attachment
does not use. HIHY's archive-local Iwao body, for example, has source vertex
38 on torso node `60880`, but not on FACE node `63056`. Resolve that exact
source index on the parent surface instead of requiring a duplicate on the
coarse FACE. GPU material batching preserves per-vertex source indices and
node addresses for this purpose. Where the coarse attachment does contain a
welded seam copy, retain its existing binding; otherwise use the actual parent
vertex and its live skin weights. This shared FACE/HAND rule does not use
nearest-point guesses or actor-specific offsets.

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
in wrist-local coordinates. The original HAND consumer `0x0c0de682` resolves
MOMT controller type `12` for the left hand and `18` for the right, then applies
the detailed-hand component correction. Use those live controller matrices,
not the low-detail body hand nodes: MHND can rotate those nodes independently,
turning a detailed grip away from its carried prop. The body nodes are still
the surface-replacement and seam-binding targets. An unanimated model uses its
authored bind pose; a missing controller in an animated model is an error.
Do not attach by the detailed model's positive root key: that key varies by
character family and is not the wrist attachment identity.

Detailed hand root strips contain signed parent-vertex references just like
detailed faces. Resolve them against the source parent of the body's signed
`-66`/`-65` attachment, not the low-detail hand's own vertex array. The shared
`NativeAttachmentSeam` implementation binds those exact source indices and
updates only their seam positions from the body's current skin weights each
frame. Exclude these borrowed vertices from finger deformation; their temporary
loader index zero is not an actual hand-pose vertex.

Once bound, the detailed shell replaces all low-detail hand triangles,
including the old wrist connector and finger descendants. Keep the body nodes
and vertex buffers for animation and seam evaluation; remove their draw indices
only. The previous geometric cut-plane heuristic left coarse palm triangles
protruding through detailed grips and is removed. Cleanup restores the exact
original body index buffers and releases the seam bindings. Detailed hand materials
follow the same mirrored-character contract as detailed faces: authored
triangles are oriented to their normals, then rendered clockwise and
one-sided. Hand overlays are not pickable, collidable, or camera blockers.
Rebind the authored references when a later AUTH activity reacquires the same
hand; the preceding finger pose must not change which body surface it owns.

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

Actors that only request body-hand poses use an explicit `mode: "body-only"`
definition in the same hand presentation system. They load no detailed hand
assets and never replace body triangles. CATA1's Megumi (`SIA_L`) uses this
route; the source requests MHND changes, not a detailed hand model. A detailed
pose request against a body-only definition remains an error.

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

The native `0x005e` installer clamps a zero transition duration to one tick;
it still installs all nineteen vectors. Never translate it into a mesh-enable
command or discard its table. Unconditional entry-block poses belong at frame
zero (including multiple straight-line entry blocks); other calls require
their actual frame gate. Owner setup must precede
callback overrides. The shared callback extractor and synchronous initializer
extractor preserve this distinction. HOUO retains the four owner poses from
`0x26b4c`/`0x26c88`, then Ryo's immediate right-hand grip at callback `0x24184`.
Both tables are read from the hash-pinned original JHD0 MAPINFO, not recreated
as hand-authored finger angles.

Run `node tools/cutscenes/audit_cutscene_hands.mjs` for the retained all-selector
inventory in `tools/evidence/cutscene-hand-audit.json`. The September 27 check
covers all 58 selections: thirty-five contain explicit detailed-hand pose commands,
with no missing asset/table binding among those emitted commands. This is not
hand-animation completeness: 54 native calls in the available source closures
remain unattributed to selected activities (some can belong to other events or
unused branches). JHW0's eight training variants now retain their distinct
callbacks' 44 hand commands, plus four shared owner-initialization poses for
each variant. The builder derives slot-to-callback ownership from dispatcher
`0x43ba0`; slots 13–16 are not in callback-address order. Shared setup `0x4505c`
calls `0x4520c` for both actors before their callbacks. Both original pose tables
(`0x5c7c8`, `0x5cd20`) are extracted from the hash-pinned JHD0 MAPINFO. The
existing shared hand renderer consumes them; there is no training-specific
finger-animation runtime. Trace ownership before importing remaining calls;
do not apply every call from an area's script to every scene in that area.

The same inventory tool can compare an existing serial browser sweep with the
current compiled preview order, without replaying it:

```sh
node tools/cutscenes/audit_cutscene_hands.mjs --browser-reports tests/reports/your-cutscene-sweep --output tests/reports/your-cutscene-sweep/hand-audit.json
```

Use a full-playback sweep directory without additional replay commands. The
comparison checks delivered command count, order, actor, side, pose-table
identity and acceptance. It follows compiled activity order, not manifest
storage order. Missing terminal reports remain pending; incomplete playback,
missing observations, dropped/reordered commands or rejected commands fail.
This does not prove source completeness, exact cue timing, individual pose
words or visual correctness. The focused hand suite and reviewed frames supply
those additional checks where recorded.

Both DNOZ Nozomi sequences retain their nested actor-initialization helpers,
not just the direct `0x005e` call in the confession callback. Helpers `0x1068`
and `0x19c0` initialize both actors' body hands (row 8), then install detailed
poses through `0x12e4`. The confession's second activity returns Ryo to body
hands at frame zero, restores detailed hands at frame 1900, and changes
Nozomi's right hand at frame 2780. The tears' second activity initializes both
actors again and hands control back to their body hands at frame 143.
Nozomi shares the retained NZM hand assets across both packages; Ryo uses YKB.
The shared extractor expands synchronous nested helpers and preserves command
order. An entry guard is accepted only before ASEQ starts, with an empty
early-return alternative and a synchronous path to the callback's ASEQ start.
This handles both the delayed-stop latch and EVSN's scene flag without
inventing room-state values. It does not choose between playing branches or
turn yielding helpers into frame-zero setup. The source MAPINFO hash
and helper closure are retained with the extraction tool.
The retained DNOZ browser tests verify both complete activity sequences,
cross-activity pose continuity, exact command order, body/detailed handoffs,
and replay/cancellation on a hardware GPU. Screenshots include Nozomi's curled
fingers and Ryo's hand in the tears scene; close-up face shots alone are not
treated as visual evidence for off-camera hands.

EVSN's two rescue routes share the hand callbacks selected by their original
resource owners: slots 0/3 call `0x721f8`, slot 1 calls `0x72300`, and slot 2
calls `0x729e0`. Each route retains 44 detailed and 24 body-hand commands in
source order. Common setup `0x72ef4` calls actor initializer `0x9218` and
detailed helper `0x73a48`; timed changes include Enoki's right-hand pose at
frame 1193 and Ryo's two-hand pose at 1580 in the confrontation. The aftermath
also switches control between body and detailed hands at authored frames.
Enoki/Nagashima use their original YAA/YAB resources (byte-identical 306-vertex
hands); Nozomi and Ryo reuse NZM and YKB. Kyosuke has body-only MHND commands,
not an invented detailed-hand model. Lead-ins omit only frame-zero setup for
room actors absent from that AUTH; all later callbacks initialize those actors
again. Any timed cue for a missing actor is an extraction error.

Regenerate the retained EVSN hand callback/helper closure with:

```sh
python3 -m tools.cutscenes.extract_native_aseq_callback_ir --disc 1 --area JD00 --map-entry 0x76b90 --callback 0x72300 --include-function 0x721f8 --include-function 0x729e0 --include-function 0x761ca --include-function 0x7691c --include-function 0x76424 --include-function 0x76644 --include-call-closure --output tools/evidence/evsn-hand-native-callback-ir.json
node tools/cutscenes/build_evsn_activity_pack.mjs
```

Both EVSN routes pass full hardware-GPU playback, ordered command/pose checks,
and immediate replay/cancellation. Reviewed confrontation and aftermath shots
show the restored finger poses and the child's airplane. Reproduce the focused
browser check with `npx playwright test tests/e2e/cutscene-hands.spec.js
--project=chromium --grep 'S1-EVSN' --max-failures=1`, using the renderer and
test-server setup described in the verification section. This does not validate
the deliberately omitted interactive fight.

DRAUTH's two sailor-confrontation activities retain 22 detailed and 19 body-hand
commands in total, selected from callbacks `0x836d8` and `0x83d28` by owner
`0x858c4`. Shared setup supplies Ryo, Tony, Smith and Harry's detailed poses;
Sera and Jones have only the authored MHND body poses. Ryo changes both hands
at frames 145 and 340 in the first activity. Tony's pointing pose begins at
200 and returns at 300 in the second. Later source-proven handoffs return the
actors to body hands. Original GIJ/GIB/GIE assets supply the three sailors'
detailed hands, with their exact rig layouts; Ryo reuses YKB.
Both previews pass full GPU playback, sampled pose/order checks and immediate
replay/cancellation. Reviewed shots show Ryo's hand changes, Tony's pointing
close-up, and the subsequent body-hand presentation. This uses the existing
shared renderer, not a sailor-specific animation path.

```sh
python3 -m tools.cutscenes.extract_native_aseq_callback_ir --disc 1 --area D000 --map-entry 0x8e3fc --callback 0x836d8 --include-function 0x83d28 --include-function 0x858c4 --include-call-closure --output tools/evidence/drauth-hand-native-callback-ir.json
node tools/cutscenes/build_drauth_activity_pack.mjs
```

D0W0's twelve Yamagishi variants use dispatcher `0x5870c`, not callback-address
order. The shared extractor expands their straight-line hand helpers at the
caller's exact activity frame, binds the actor argument, and preserves mixed
body/detailed hand command order. `0x59f8c` supplies both detailed hand poses;
callback overrides retain the cup grip and individual Ryo gestures. Yamagishi
uses the original `YMG_TL`, `YMG_TR`, and `YMG_HM` resources (306 vertices and
71 transform nodes), while Ryo shares the existing YKB assets.
Owner `0x59de8` also calls common actor setup `0x9fb0` for both actors before
playback. Its `0x0081` row-8 starting poses are retained even for hands which
never become detailed. Setup extraction accepts reconverging visibility
branches only when every path produces the identical ordered hand effects;
conditional hand changes and unresolved/cyclic control flow still fail.

For good-enough presentation, a helper that requests `0x00df` mode `0`, selector
`0` for the relevant sides and then explicitly requests a `0x0081` body-hand
pose relinquishes detailed mesh ownership. This is a narrow presentation rule
for that paired sequence, not an assertion that every mode-zero controller
request disables a mesh or complete native hand-controller emulation. Ordinary
body-hand updates do not hide detailed hands. Original body triangles are
restored, and later detailed poses can reacquire the same surface. D0W0 also
borrows its existing AUTH cup for the source FIXO attachment: Yamagishi's
controller 18 from frame 0 to the detach at frame 1606. It does not spawn a
second cup. Compact callback evidence and the builder remain reproducible.
The shared `0x00eb` translation now applies Yamagishi's left-hand correction
`[-8920, 4004, -5643]` at frame 0 and its zero reset at 920. The original
`0x0c0de682` consumer loads attachment control 12/18, then applies the primary
controller's rotation words via `0x0c091868`. Those are low-word fixed-turn
X/Y/Z rotations, separate from the nineteen finger vectors—not inferred grip
offsets or a reason to rotate the underlying cup controller. The same shared
rule handles fixed cues in TGMA, HOUO, TOKI, DRAUTH, and JHW0. Signed parent
seam vertices still follow the arm after the detailed hand is rotated.
The source ranges and pointer dependencies are reproducibly verified by:

```sh
python3 -m tools.scripting.operations.extract_hndl_hndr_component_operation_evidence --contract-only --out tools/evidence/hand-attachment-render-contract.json
```

The contract-only report does not reuse the old whole-disc IR inventory count,
which no longer matches the current expanded IR. That historical corpus report
is left intact rather than weakening its assertion.
The unmatched-call count is global triage, not per-scene completeness: a shared
helper emitted for one scene can still be missing from another scene's setup.
MSKA, both KAKG dialogues, and TGMA now explicitly preserve their original
owner initialization through `0x26aa4` or `0x26be0` and shared helper `0x26c88`.
KAKG's Fuku-san conversation also retains its four immediate pose changes at
frame 1321; those changes are not applied to the separate Ine-san conversation.
TGMA keeps its existing FUB-specific hand resources and later letter poses.

CATA1's three kitten-care activities retain 18 Ryo detailed-hand poses and
10 body-hand cues, including each callback's common actor initialization.
The hash-pinned JU00 callbacks `0x21e8c`, `0x24050`, and `0x25958` provide the
timing and original pose vectors. Shared setup `0x26c10` calls `0x215a4` for
both actors before playback. Ryo reuses YKB detailed resources; Megumi's body
hands retain the native row-8 setup and subsequent row-1/row-8 left-hand
changes. During SEQDATA1, all three fish remain attached to Ryo (`AKIR`):
FIXO changes controller 18 to 12 at frame 140, then detaches at frame 270.
This is not a transfer to Megumi. CATA1's dynamic `0x00eb` corrections at
`0x23f2a`/`0x23fdc` depend on per-frame arithmetic and native `0x00ea` controller
reads; SAKR also has ten conditional arithmetic writes. These are explicitly
retained as `nativeHandComponentLimitations`, not guessed static vectors.
When a side has an unresolved dynamic write, the compiler omits the whole
component-correction lane so a partial fixed pose cannot become stuck. Their
existing authored finger/body motion remains unchanged. Exact contact for
those two dynamic cases is still a fidelity limit, outside the fixed-cue fix.

SAKR's Sakura training memory uses a signed 16-bit local frame counter, not
the 32-bit load used by the other recovered callbacks. The shared binary gate
reader accepts both generated load forms while preserving the exact comparison
and branch boundaries. Callback `0x70c` retains 16 detailed poses and two timed
body poses; owner `0x1a4` supplies four initial body poses through its actor
helper `0x384`. Resource preparation yields before those helper calls, so the
builder binds their actual arguments directly rather than treating the entire
resource owner as a non-yielding initializer. Young Ryo first requests his
detailed right hand at frame 870, not at callback entry. Iwao uses IWA hand
resources (306 vertices), young Ryo uses JKB (301); both rig layouts have 71
transform nodes. The global textured model vertices/normals match their
archive-local CHRM equivalents, and the HM rig files are byte-identical.
Standalone `0x00df` controller requests are not treated as mesh visibility
commands; only the documented paired body-hand handoff policy applies.

The shared browser harness records hand commands and hand-pose state beside
rendered shot samples. HOUO also has a focused full-playback browser check in
`tests/e2e/cutscene-hands.spec.js`: it checks both actors' actual pose words and
enabled detailed meshes. Reviewed early/late images show Ryo's mirror grip and
Fuku-san's curled hands. This is not a visual pass for the other 57 selections,
nor evidence that every scene should have continuously moving fingers.
The same test file checks all eight JHW0 variants through uninterrupted playback:
each verifies a native pose change, and the recorded commands account for all
76 hand cues in actor/side/table order. The September 26 GPU run completed all
eight without browser or resource errors. Reviewed samples include visible
open hands and fists; wide shots do not establish individual finger contact.
The Hazuki dialogue cases in that file also check MSKA, both KAKG scenes, and
TGMA through full playback. All four passed the September 26 GPU run, including
KAKG-02 immediate replay/cancellation. Exact pose words and delivered cue order
are checked separately from the captured compositions; an occluded hand in a
shot is not treated as visual proof of its finger surfaces.
All twelve D0W0 variants completed the September 27 GPU run with no browser or
resource errors; sequence 7 also passed immediate replay/cancellation. After
recovering the common starting body poses, focused full-playback reruns of
sequences 1, 7, and 10 passed, checking actual body-pose words and detailed-hand
state as well as delivered cue order. Rendered samples show the opening cup,
Ryo's differing finger poses, and Yamagishi's detailed hand in the final variant;
wide and occluded shots do not establish exact finger-to-prop contact.
CATA1 also passed full GPU playback and immediate replay/cancellation on
September 27. Its focused check verifies all 28 delivered hand cues and four
rendered samples across the three activities. Reviewed images show Ryo's
changing fingers and food grip, and Megumi's body hands. The later activities
exposed Megumi's leg/skirt clipping. The September 28 shared cloth-topology
correction aligns closed-ring columns before building row constraints: her
hem's independent greatest-X seed had shifted its links by one column,
twisting and stretching the skirt. Reviewed GPU samples at activity 1 frame
165 and activity 2 frame 180 now show the continuous skirt without the former
leg protrusion. This does not establish pixel-perfect cloth behavior for
every animation frame. See [native cloth](native-cloth-runtime.md) for the
source-data basis and corpus scope. The corrected scene passed full GPU
playback and immediate replay/cancellation without browser/resource errors;
the retained report is `tests/reports/cutscene-megumi-ring-alignment-sept28/`.
SAKR passed full GPU playback, all 22 hand commands, and immediate replay/
cancellation on September 27. Seven rendered samples show Iwao's changing
poses and young Ryo's detailed grip in the close-ups. Those close-ups exposed
a protruding low-detail wrist connector. The shared authored-parent seam fix
removed the duplicate connector and bound the detailed shell to the animated
body wrist instead. A subsequent full GPU run and reviewed close-ups at frames
895, 955 and 1310 show the connected wrist without the former protrusion.
Phoenix Mirror and JHW0 sequence 1 also passed full GPU reruns after this
shared change; reviewed samples retain the mirror grip and Fuku-san's moving
hands. Focused tests check animated seam positions for both baked and welded
GPU bodies, alongside the existing FACE/neck regressions and exact cleanup.
Set `E2E_HAND_SURFACE_DIAGNOSTICS=true` for the SAKR hand test to capture the
temporary body-surface isolation; the test restores visibility immediately.

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
the same dialogue overlay and caption preference as ordinary NPC dialogue.
Caption ownership uses the individual playback cue, not just the authored
command: completion of an older playback cannot clear a newer one. Empty SRF
text remains an uncaptioned vocal/nonverbal cue rather
than receiving invented dialogue.

`NativeAseqAudioPresentation` is acquired once by `beginProgram` and released
by `endProgram`. Nested AUTH cleanup only releases shot presentation; it does
not stop voice/SFX or hide their captions. Clips finish on the media element's
`ended` event, an explicit stop command, or final program cleanup/cancellation.
A standalone AUTH acquires the same session contract for its single activity.

Detailed faces read the live speaker cue's `positionSeconds`, rather than
restarting lip sync at the next AUTH's frame zero. This preserves ongoing
speech across cuts and catches up actors returning from offscreen. The shared
dialogue volume channel and existing media backend remain authoritative.

Forward skip brackets the existing bounded AUTH-clock updates with a session
seek. It pauses ongoing clips, accumulates offsets for new cues without playing
them, then seeks surviving media and discards expired clips. Music advances by
the frames actually consumed, not the requested skip when a shot ends early.
Metadata loading during seek has a ten-second timeout and reports failure;
session and play-revision guards reject stale completion after cancel/replay.
This does not turn the existing shot-bounded skip into a cross-program seek.

`tests/e2e/cutscene-music.spec.js` records actual voice-element `playing`,
`pause`, `ended`, and `error` events. OP02's ten voices must all end naturally,
including B005/B007/B010 crossing shot boundaries. The same suite checks
OP00's opening score in its initial gate shot, score seeking, and music
continuity/cancellation for OP02 and CATA1. These are playback-lifecycle checks,
not a listening comparison against the original mix.

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
the package directory. A separate external-asset declaration can retain a copy
when the source is only available in an extracted room directory. A parseable
sequence at the requested ordinal is insufficient: its authored sample window
must also resolve against that clip.

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

YQ14's former `M_ZAKO` binding was incorrect: its first four clips are generic
14-frame poses, despite AUTH requests reaching frames 638/642/1007. The room
resource at MAPINFO `0x57e0e` names `M_01114.BIN`; the retained builder now copies
that exact file (SHA-256
`6f7980d63ad21d4a4a51019a1ef22bbe843c03150028beff73b5b3d00302f1f8`) into the package.
MOTN header attributes must not be used as a request-bank identity: global
`MOTION.BIN`, for example, does not share its AUTH request bank in those bits.

One source inconsistency remains explicitly approximated: `YQ14/SEQDATA1.AUTH`
requests Ryo's `AKI_AITU_MASAKA_0448` frames 612..691, while the supplied clip
has exactly 80 frames. The shared resolver rebases only an entirely out-of-range
window whose inclusive length equals the complete clip length. It retains the
original operands and cue lifetime, records `sampleFrameOffset: 611` and
`frameBasis: rebased-whole-clip-window`, and samples body/sound motion locally.
Other out-of-range starts remain unresolved; the unrelated 14-frame bank now
fails compilation. This is a good-enough export-window interpretation, not
emulator-verified native semantics. The full packaged corpus scan found this
one exact rebase case; the headless fidelity report lists it as an approximation.

## Compiled owner programs, not browser playlists

The browser playlist stack was removed when OP00 moved to the canonical
compiled-program and activity-package path. This file records the deletion
boundary; it does not define a compatibility mode.

The machine-readable audit is generated by
`tools/cutscenes/audit_native_playlist_removal.mjs` into
`tools/evidence/native-playlist-removal.json`. Its focused test verifies all of
the following:

- OP00's compiled MAPINFO owner is exact and has no unresolved operations;
- its 25 selected AUTH resources retain their source offsets, lengths, and
  hashes;
- each resource is an independently stored, hash-matched activity with a
  `map-embedded-slot` binding;
- the owner completion boundary follows the return of the original murder
  stage, including its silent slot-24 storm camera/effect track;
  and
- production config, cutscene, event, and generated-event sources contain no
  playlist runtime, playlist schema, playlist package kind, handwritten OP00
  timeline, or combined OP00 authpack reference.

Selection is by complete native stage functions, not contiguous ASTR audio
path families. `--stage-function` selects original direct-call stages; their
control-flow graphs supply every positive operation-`0x0050` start. Invocation
specialization removes unreachable branches and their outgoing CFG edges.
The preview compiler compares those selections against retained original IR,
and the smoke audit independently checks that evidence for all four opening
segments. Removing a silent shot from both the package and compiled timeline
must fail original-stage coverage. See the OP00 research guide for provenance,
regeneration commands, and the limits of the restored storm effects.

## Dream-stage ownership

Program ownership retains character models and their authored poses across
shots, but only characters declared in the current AUTH actor table are drawn.
The shared Babylon actor presenter masks undeclared scheduled and package
characters as well as the gameplay avatar. That render-only mask remains in
place during preparation of the next shot and is restored at program release.
Persistent scenery remains governed by native scene-object visibility instead
of the character mask. In particular, OP00's storm track must not inherit Lan
Di or his men's visible bodies from the preceding dojo shots; its only character
reference is the explicitly hidden `AKIR`.

Dreams use the same package runtime as other scenes. Activity metadata can
declare `browserIsolatedStage` and a `browserBackgroundColor`: the shared map
presenter snapshots and hides resident world roots, but leaves package-owned
actors and scenery visible. Completion/cancellation restores the exact prior
visibility. The enclosing program retains its outgoing stage between AUTH
activities to avoid briefly exposing the gameplay room during a cut.
Isolation also borrows the world environment: the shared environment owner
hides the sky and clears precipitation/fog, suspending periodic visual updates
without stopping the server clock. Waking or cancellation releases that lease,
restores prior sky visibility, and applies current server time/weather. This
matters for dreams hosted in outdoor packages such as OP00; hiding map roots
alone leaves the independently rendered sky and snowfall visible.

The BEBF generator retains JOMO helper `0x4c50c`'s operation-`0x0098` writes
`[0,0], [2,0], [4,0], [6,0], [8,0]` before the dream and helper `0x4c584`'s
matching value-1 writes before waking. Those five roots alone are insufficient
in the browser: additional resident room models and placed props remain. The
dream therefore uses isolated staging as a documented browser approximation,
not invented native layer commands. Ryo's bedroom shots restore the room.

OP00's opening Lan Di nightmare uses that same isolated black staging for
montage slots 30–46. Sleeping slot 28 and waking slot 29 retain the OMO bedroom,
and waking releases the black background. The continuation builder previously
enabled exterior/dojo roots on every non-bedroom shot, leaking the murder set
into the dream. This is a browser composition fix, not a reconstruction of
OP00's native fog, flashes, or per-shot lighting controllers.

For KKYA–KKYF, original parent helper `0x5067c` releases `MPK00` using
operation `0x013c` at `0x5070e` before a vision; `0x50748` reloads it afterward.
The browser retains those assets and borrows their visibility instead of
unloading/reloading the house. Vision-owned scenery remains visible. The black
background is the browser projection of the owners' `0x006f` mode-2 value
`0xff000000`, not a reconstruction of all native fades, fog, or SCRL behavior.

KKYB's native playback callback `0x47108` sets both `RYMR` and `HOMR` scales
to `[100, 100, 100]` through operation `0x0027` at `0x47122` and `0x4713a`.
The source vector is at `0x95ec0`. Omitting these writes left both mirrors as
tiny points even though their AUTH movement and the hawk ran successfully.
The builder reads the unconditional entry path and hash-pinned vector into
the existing scene-object `initialPresentation` data. Shared AUTH object
ownership now applies that setup after taking a restoration snapshot; AUTH
movement then controls position/rotation without erasing scale. Completion,
cancellation and replay restore the prior instance state. Other appearances
of the same model are not enlarged. This recovers the visible mirror setup,
not the original callback's complete fades, fog and glow coroutines.

Retain and regenerate its source evidence with:

```sh
python3 -m tools.cutscenes.extract_native_aseq_callback_ir --disc 1 --area JOMO --map-entry 0x88b70 --callback 0x47108 --include-function 0x462cc --include-function 0x49354 --include-function 0x45d10 --include-call-closure --output tools/evidence/jomo-mirrors-native-setup-ir.json
```

Regenerate with `tools/cutscenes/build_bebf_activity_pack.mjs` and
`tools/cutscenes/build_jomo_vision_activity_packs.mjs`. Retained owner/release
IR and pinned MAPINFO hashes preserve the provenance. `tests/BebfActivityPack.test.js`
covers source joins, stage isolation, restoration, and repeated ownership;
rendered completion and shot review remain separate requirements.

## Canonical ownership

Every selectable native cutscene enters through a compiled program. Current
selectors use generated preview programs rather than the complete original
room owners. The program holds the scene lease and sequences activities. An
AUTH call acquires an activity sublease by its native binding; the package
retains actors and prepared resources across activity boundaries where native
ownership requires it.

This preserves repeated preview calls without duplicating resource bytes.
BEBF's current preview order is:

```text
60, 61, 62
```

Source inspection on September 22 found these are two separate branches in
owner `0x4bf5c`: `60,61,62` and `60,63,62`, selected by its input state. The
preview now selects the first branch (input state zero), not a concatenation
of both alternatives. Slot 63 remains packaged as the second native branch's
alternative nightmare shot. The shared compiler and runner still support
explicitly requested repeated calls; they must not be inferred merely because
a resource appears in both a normal path and an interactive retry loop. EVSN's
preview omits that retry and uses `0|3,1,2`. Use the
[browser validation workflow](#bounded-browser-validation) to check playback.

OP00's preview route now references its retained compiled owner with
`ownerSequence`, rather than repeating an activity list. The preview compiler
projects selected call sites through CFG successors in the owner's stages;
branches reaching different next calls or repeated sites require an explicit
choice and fail this projection. It does not execute unrelated room operations.
The source's `selectedSlots` is a membership inventory, not chronology. The
recovered order is:

```text
0,1,2,3,4,18,19,5,6,7,8,9,10,11,12,13,22,23,14,15,16,17,20,21
```

The September 22 visual sweep found that the former numerical `0..23` preview
appended earlier fight material after the ending. Both the source MAPINFO hash
and the retained owner's call sites were checked before correcting generation.
Generated evidence retains those sites and resource hashes. Preserving this
order is not proof that every original owner operation executes in the preview.

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
