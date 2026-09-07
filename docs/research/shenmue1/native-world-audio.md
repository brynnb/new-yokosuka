# Native World Audio Reverse Engineering

This document records recovered Dreamcast audio behavior and the evidence used
to justify each mapping. Current browser architecture, controls, and zone
assignments are documented separately in
[`../implementation/audio.md`](../../implementation/audio.md).

This work recovers world effects from native control flow and sound-bank data.
The browser currently implements Ryo's surface-aware walk/run contacts,
D000's registered logical-door opening sounds, and the shared map-transition
layers. A mapping is shipped only when the native selector, command, bank, and
sample path are all recoverable. Native vending assets are packaged for
analysis but deliberately not wired until their long-cinematic-to-standalone
motion mapping is equally exact.

Sequenced music and ambient-bank format research is documented separately in
[`dreamcast-music.md`](../dreamcast-music.md). Looping browser ambience is not part
of the positional world-effects or footstep pack described below.

## Evidence Rules

Native command bytes are not globally unique. A promoted mapping must establish
the command, its owning bank in the active map context, the gameplay trigger and
timing, and the complete DTPK track/playback/sample chain. Filename similarity,
nearby object tags, static co-occurrence, and audition are candidate-discovery
tools rather than ownership proof.

Important inputs are pinned by SHA-256, and unresolved or disproven candidates
remain represented in evidence instead of being silently discarded. Emulator
traces are used to close one specific static ambiguity, then reduced to compact
source-hashed evidence; they are not treated as an audition oracle.

## Recovered footstep path

`data/MOTION/MOTION.BIN` stores locomotion contact callbacks in each sequence's
action metadata. They use the same aligned `04 05` event family as direct DTPK
sound cues, but carry a contact-kind byte instead of an `AB` command:

```text
uint16 frame
uint8  operation        = 04
uint8  operation family = 05
uint8  contact kind     = 00..07
uint8  reserved         = 00
uint8  reserved         = 00
uint8  enabled          = 01
```

The active player sequences contain:

| Sequence | Source frame | Contact kind |
| --- | ---: | ---: |
| `A_WALK_L_02` | 0 | 0 |
| `A_WALK_L_02` | 18 | 1 |
| `AKI_AKI_RUN_MID_LP` | 8 | 4 |
| `AKI_AKI_RUN_MID_LP` | 17 | 3 |

`AnimationStateMachine` converts these source frames through
`ryoMotnGameplayTiming`, so the 37-sample walk's events occur at gameplay ticks
0 and 14 in its recovered 28-tick cycle. Run events remain at ticks 8 and 17.
Callbacks are emitted while advancing ticks, including tick zero when a
locomotion state begins or loops; they are not elapsed-time approximations.

The executable's callback target is `FUN_0c17bb14`. Its literal block identifies
the queried property as `STEP`. The function:

1. gets the actor position;
2. resolves the collision/material beneath it;
3. falls back to the actor object's `STEP` property when no material resolves;
4. indexes the 23-entry command table at `0x0c29c068`;
5. adds an engine-random variant `0..3` for ordinary contact kinds;
6. dispatches the resulting `AB03` command through the native sound system.

The exact table is retained in `play/audio/NativeFootstepCommands.js`.
`tools/audio/build_native_footstep_surface_catalog.mjs` extracts each map's native
`SOND` records and grid from MAPINFO. `NativeFootstepSurfaceResolver` reproduces
`FUN_0c0b3986`: it converts browser X/Z to native coordinates, reverses native
grid rows, and chooses the highest overlapping record. The low 16-bit record
code stores overlap priority in `floor(code / 100)` and the `STEP` index in
`code % 100`; native STEP values 15, 19, and 20 are filtered from this query.

Nine browser areas now carry source-hashed native surface grids. Their authored
records expose playable STEP indices 1, 2, 3, 4, 5, 8, 9, 10, 11, 13, 16, 17,
and 21. The fallback is not globally surface 1: the callback reads the active
actor's area-authored `STEP` property. Pinned live property trees prove AKIR
uses index 0 in MFSY and index 3 in JOMO. The compact provenance and exact
property bytes are retained in
`play/data/native-actor-footstep-properties.json`. Three random variants are
joined/delayed multi-playback compositions; they remain explicit fail-closed
records until that timing format is decoded exactly rather than being flattened
into a guessed mix.

The browser-only Forklift Playground keeps `nativeArea: MA00` for its gameplay
and forklift state, but renders the full MFSY Harbor map and MFSY placements.
Its `collisionArea: MFSY` field therefore selects both collision and footstep
material data owned by the geometry actually under the player. The real
Forklift Races world renders MA00 resources and does not use this override.

Browser worlds without an extracted native surface grid or actor `STEP`
property—including DGCT/You Arcade—use surface 0 as their explicit default.
This selects the same `AB03:40–43` pavement family proven for Ryo in MFSY;
authored area records and captured actor properties continue to take priority.

## Assets

The 49 currently simple-playback footstep effects come from Disc 1
`data/SOUND/SYSTEM1.SND`. `tools/audio/build_world_audio_pack.mjs` reconstructs each
command through its DTPK track, playback descriptor, sample ID, and composite
rate. It normalizes the pinned DTPKDump WAV layout and emits mono WebM/Opus at
48 kbps under `public/audio/world`.

Rebuild after running DTPKDump:

```sh
python DTPKDump.py -wavconv SYSTEM1.SND
npm run build:world-audio -- /path/to/decoded-output
```

`public/audio/world/manifest.json` records the native bank hash, command group,
track/playback/sample chain, original DTPK rate, output hash, decoder procedure,
and encoding settings.

## D000 logical-door effects

D000's immutable 65-record door table has `0xffffffff` placeholders in its
three sound words. The actual commands are installed by generated operation-5
registration calls in MAPINFO file region `0x67900..0x68aee`.
`tools/audio/extract_d000_door_audio.py` symbolically follows those SH-4 descriptors.
Because the SH-4 stack grows downward, it reverses the eight pushed words into
native descriptor order before interpreting:

```text
word 0      logical-door selector
words 4..6 sound command words copied to logical-record words 9..11
```

The main door state machine at `0x25098..0x273e6` passes those record words
unchanged to SCN3 operation `0x006c`. Its primary call at `0x26d0e` occurs
immediately before the native animation operation, establishing an opening
contact cue rather than an elapsed-time estimate. The extractor finds 41
registrations and all 41 agree with independently captured RAM records. The
remaining 24 selectors are explicitly absent; they receive no inferred sound.

The registered command sets are:

```text
AB02:21
AB02:23
AB02:24
AB02:21 + AB02:29 + AB02:28
```

The first command is the proven browser opening cue. The additional two
commands exist only for nine linked/native multi-stage registrations and are
retained for later state-machine coverage. They are not guessed onto the
browser's simplified close action.

All five tracks come from `SCENE/01/SOUND/F1DOBUIT.SND`. Rebuild them after
decoding that bank with pinned DTPKDump:

```sh
python DTPKDump.py -wavconv F1DOBUIT.SND
python3 -m tools.audio.extract_d000_door_audio /path/to/D000/MAPINFO.BIN
npm run build:d000-door-audio -- /path/to/decoded-output
```

`tools/evidence/d000-door-audio.json` retains descriptor offsets, command
words, native state-machine call sites, source hashes, and RAM agreement.
`play/data/native-d000-door-audio.json` is the generated compact runtime
mapping. The WebM/Opus assets and their sample/playback provenance live under
`public/audio/world/f1dobuit`.

SCN3 operation `0x006c(0x0aa0, 1..3, 30)` is separately found in map-change
paths across all three discs. It drives the three-track SYSTEM1 `AB0A`
transition group. It is therefore a shared transition effect, not a generic
door-mechanism sound, and is deliberately not substituted for an unregistered
door selector.

All three native AB0A layers now start together for validated door and boundary
travel. They remain alive across outgoing-world disposal so the loading
transaction cannot cut the effect off, but are stopped on application disposal.
Their command/sample provenance is part of `public/audio/world/manifest.json`;
their bank-scoped assets are under `public/audio/world/system1`.

## JOMO authored door pairs

JOMO uses a different door framework from D000. Its SCN3 static section passes
four exact tables to the shared initializer at MAPINFO file offset `0x15af0`
(runtime `0x0c3db230`):

```text
context +0xc0  18 x 13-word logical interaction records
context +0xc4  18 x 2-word logical-record mappings
context +0xc8   7 x 4-word model/audio rows
context +0xcc  18 x 9-word placement rows
```

Each model/audio row contains a typed model-code reference, a logical action
type, and two F1OMOYAA AB02 commands. The exact authored rows are:

```text
DR15_026  action 20  AB02:2  AB02:3
DR15_029  action 20  AB02:4  AB02:5
DR01_015  action 27  AB02:0  AB02:1
DR15_028  action 20  AB02:6  AB02:7
DR15_016  action 15  AB02:8  AB02:9
DR01_016  action 30  AB02:0  AB02:1
DR23_000  action 23  AB02:2  AB02:3
```

This proves model ownership, including the Hazuki main entrance
`DR15_016`, without assigning sounds from filenames or auditioning. The
18 placement records select these rows directly and preserve authored scale,
position, and fixed-turn Y.

The immutable logical records initialize words 9 through 12 to `0xffffffff`.
JOMO selector 11 reads logical word 9 at `0x12794` and `0x128e0` before
operation `0x006c`; selector 12 has the same kind of reads at `0x14694` and
`0x147d0`. Those empty logical words remain a separate negative route and do
not replace the model-owned pair.

The `DR23_000` row supplied the dynamic phase anchor. Starting from the
source-hashed wardrobe state, only Ryo was repositioned beside exact static
door placement 17; the door and object-action state were untouched. The
retail focus selector and three successive A presses produced:

```text
closed -> AB02:2 at cycle 185214168064  opening start
open   -> AB02:3 at cycle 186965756728  closing start
closed -> AB02:2 at cycle 188300311688  opening start
```

All three calls entered typed dispatcher `0x0c17a91c` from `0x0c0bb71e`.
The repeated third event closes the complete-cycle ambiguity. The browser
does not transfer that result to other rows merely because their commands are
adjacent.

A second interpreter trace closes the shared table dataflow. At the generated
opening controller, `r6` is the model/audio table base `0x0c458218` and `r7`
is element index `26 = row 6 * 4 + 2`; the result is `AB02:2` in local field
`r14+4`. At the closing controller, the same table base is paired with index
`27 = row 6 * 4 + 3`; the result is `AB02:3` in local field `r14+0`.

The source-hashed SH-4 scan then accounts for every generated consumer of
those table columns. Seven sites compute `model row * 4 + 2`; six sites
compute `model row * 4 + 3`. Each uses the placement-selected row and the
same context `+0xc8` model/audio table:

```text
opening field 2: 0x5104 0x554c 0x7fb8 0x9e74 0xb4f4 0xe074 0x11694
closing field 3: 0x5ad2 0x8500 0xa11c 0xede8 0xfd08 0x11984
```

Those are table-wide phase columns, so all seven rows now have proven
`openingStart` and `closingStart` roles. The browser maps all 18 authored
placements through their exact model row, including sliding and swinging
doors, and ships all ten AB02 command assets.

`tools/audio/extract_jomo_door_audio_evidence.py` source-hash checks JOMO
`MAPINFO.BIN`, validates the SCN3 layout and relevant SH-4 instructions, and
regenerates `tools/evidence/jomo-door-audio.json`:

```sh
npm run extract:jomo-door-audio
python3.12 DTPKDump.py -wavconv F1OMOYAA.SND
npm run build:jomo-door-audio -- /path/to/decoded-output
```

The evidence retains all ten commands and all 18 placements, the compact
full-cycle dispatcher trace, the pair-index dataflow trace, and every
field-2/field-3 consumer. `public/audio/world/f1omoyaa/door-manifest.json`
records exact AB02 composition, playback, sample, rate, decoder, model scope,
and encoded asset provenance for all ten tracks.

## AUTH timeline sound events and D000 vending

AUTH cutscene files carry a structured ASEQ timeline independent of MOTN
action metadata. `tools/lib/AuthSequence.js` now walks it sequentially rather
than searching for byte patterns. Each timeline group contains:

```text
uint32 global frame
one or more typed records
uint32 zero terminator
```

The record type's high byte gives its payload length in 32-bit words. Including
the type word, actor declaration `0x0202` is 12 bytes, sound `0x0306` is
16 bytes, and motion `0x0503` is 24 bytes. Multiple records can share one
global frame; treating the word before every record as a frame is incorrect.
The final timeline frame is `0xffffffff`.

A sound record contains the actor tag, four native command bytes, and an event
index. `ffffffff` in the command field is an authored stop/clear sentinel.
Motion records contain the actor, one-based MOTN reference, local start/end
frames, and their timeline group provides the global start. Since AUTH and
MOTN both advance at 30 fps, a sound maps exactly to:

```text
local MOTN frame =
  motion local start + (sound global frame - motion global start)
```

All 129 sound events across D000's seven `DJHN/SEQDATA*.AUTH` files resolve
inside the active actor motion interval. The sequential parse corrects two
cases an aligned byte scan cannot represent: a valid sound following another
record in sequence 1, and two actor sounds sharing frame 1090 in sequence 3.

D000 MAPINFO provides the bank link directly. At
`0xb1884..0xb1a20` it lists `DJHN_01` through `DJHN_07`, `DJHN_MOT`,
then `a1_yanji.snd` at `0xb1a09`, followed by model `01JUCEA`. The AUTH
commands are A904 tracks in
`SCENE/01/SOUND/A1_YANJI.SND` (SHA-256
`a9ec9b5a7b69359da2852bf6ecfe6c5aa3bad9855458b0ace13d42606865d4b0`).
Twenty-two of its 24 tracks are referenced by these sequences.

Rebuild the evidence and browser-ready, still-unwired WebM/Opus pack with:

```sh
node tools/worlds/audit_d000_vending_interaction.js
python DTPKDump.py -wavconv A1_YANJI.SND
npm run build:d000-vending-audio -- /path/to/decoded-output
```

`tools/evidence/d000-vending-interaction.json` retains every AUTH record,
timeline frame, resolved motion name/local frame, resource-cluster offset, and
source hash. `public/audio/world/a1_yanji/manifest.json` records the complete
DTPK track/playback/sample and conversion provenance.

The browser currently stages separate exact-source motions
`AKI_IRERU_COIN`, `AKI_TORU_JUICE`, and `AKI_NOMU_JUICE`; the seven AUTH
sequences instead schedule longer cinematic motions. Pose comparison does not
show those standalone clips to be byte- or curve-identical subsegments.
Transferring cinematic cue frames to them would therefore be an estimate, so
runtime vending **audio** playback remains disabled pending the free-roam vending
controller path or another exact association.

The playable purchase path walks to the cabinet using the normal collision
controller before sending the server transaction. `vendingInteractionPose`
applies one local `(0, 0, 0.8)` staging point to each JIHS5 placement and faces
back toward its local front. This is browser staging checked against the
cabinet geometry (front about `+0.30 Z`) and M_DJUC hand reach (about `0.50 m`),
not a recovered native VEND placement constant. Blocked approaches fail without
charging; world changes cancel pending presentation. Server purchase requests
are not automatically repeated after an error.

The existing emote phases blend from the displayed walking/turning pose into
coin insertion, collection, drinking, and idle. Movement stays locked until
completion. The can follows render key `-0x41` in the **resolved character
pose**, under the character content root. Generic MT5 prop vertices already
have X reflected; undo that reflection before the source hand matrix and let
the character content root perform its own reflection. Applying the raw hand
matrix directly under `modelOffset` instead puts the prop on the opposite side
of the actor. Tests: `ControllerApproach`, `VendingInteractions`,
`VendingDrinkProp`, and `AnimationStateMachine`.

The can also needs a local grip transform, rather than sitting at the wrist
origin. `VENDING_CAN_GRIP` records the original DJHN `CAN1 -> AKIR` control-18
FIXO arguments at D000 `0x89392`: translation `(0.1081, 0.0192, -0.0134)`
and fixed-turn rotation `(-4125, 20600, -9448)`. The literal-pool provenance
is recorded by `audit_d000_vending_interaction.js`; reuse with the standalone
M_DJUC motions is checked visually, not claimed as an independently recovered
free-roam controller binding.

Browser discard choreography releases at source frame 660 in the hot/cold
drinking clips. It samples the exact release pose, detaches in world space,
and follows a 12-frame ballistic arc with a tumble toward the bin opening.
The can disappears on entering the bin and never reattaches during the rest
of the emote. These timing/trajectory choices are browser staging based on
the rendered gesture, not native VEND event/physics recovery. Flight uses
animation time, handles skipped frames, and is cleared on cancellation.

Both vending emotes opt into `preserveEndPosition`: their final pose settles
to idle beside the bin. On natural completion, the source-space horizontal
displacement is transferred through the character's render transform to the
player root and collider, then persisted and marked for network publication.
Cancellation does not apply the unplayed endpoint. Other emotes retain their
existing return-to-origin behavior.

GT cabinets contain their bin: its rim center is local `(-0.6966, 0.7256, 0)`.
The KR cabinet in Sakuragaoka instead has an authored, separately placed
`GMK02LCG` bin (`VM_0 -> VMG0`), whose rim center is local `(0, 0.7256, 0)`.
`bindBins` resolves these from the loaded placements before interaction;
missing separate bins are errors, not imaginary landing targets.

### D000 telephone-book AUTH

The same structured route resolves the Dobuita telephone-book assets without
relying on the suggestive filename alone. D000 MAPINFO's contiguous resource
cluster at `0xaea94..0xaeae1` contains `a1_telp.snd`, resource type `AUTH`,
`seqdata0.bin`, and package `01TEL`. That AUTH selects sequence 24 of
`M_01TE.MOTN`,
`AKI_SIRABERU_DENWATYOU_ETC_TABACOYA_0100`, over local frames 18..925.
Its seven sound records resolve to local motion frames:

| Local frame | Native command |
| ---: | --- |
| 77 | `A904:00` |
| 149 | `A904:07` |
| 207 | `A904:08` |
| 271 | `A904:07` |
| 331 | `A904:0A` |
| 420 | `A904:0B` |
| 874 | `A904:01` |

`tools/audio/audit_d000_phone_book_audio.mjs` retains the exact MAPINFO offsets,
source hashes, AUTH records, motion resolution, and local frames.
`tools/audio/build_d000_phone_book_audio_pack.mjs` packages the six referenced
tracks from the 13-track A904 group in `A1_TELP.SND` as deterministic
WebM/Opus under `public/audio/world/a1_telp`.

Rebuild with:

```sh
npm run audit:d000-phone-book-audio
python DTPKDump.py -wavconv A1_TELP.SND
npm run build:d000-phone-book-audio -- /path/to/decoded-output
```

These assets are deliberately not played yet. The browser's existing
telephone-book interaction uses three shorter `M_D000.MOTN` sequences:
`AKI_TORU_TELBOOK_90_F`, `AKI_LOOK_TELBOOK_LP_F`, and
`AKI_OKU_TELBOOK_90_F`. They are not the long AUTH motion. Until a native
controller path or exact curve correspondence supplies a temporal mapping,
copying the AUTH frame numbers to those clips would be a guess.

### D000 gacha-machine controller

D000's ordinary SCN3 controller provides a stronger association for the
capsule-toy interaction. MAPINFO names `e1gachap.snd` at `0xacaf6`
immediately before the `HI_GACH` resource at `0xacb13`. The bank
(SHA-256
`84538c809f1eb93b6afd52d39061b21d2009929c21f313ccef07a7ac7e406349`)
contains exactly one group: six simple A904 tracks backed by six distinct
samples. Tracks 0..4 have authored volume `0x7f`; track 5 has volume `0x41`.

`tools/audio/extract_d000_gacha_audio.py` resolves all six operation-`0x006c`
calls and follows operation-`0x0002` coroutine launches back to the gacha
controller at `0x52780`. That root polls Ryo's current motion frame and starts
child work at frames 100, 170, 215, 280, 300, and 310. Those launch frames do
not, by themselves, establish the later sound time inside each child.

One command has a complete authored-motion proof. Function `0x535e4` polls
`AKIR` through operation `0x002b`, compares the returned frame with the
literal 360 at `0x53830`, yields while it is lower, and then issues
`A904:02` at `0x53876` without another yield. The browser plays the exact
source `AKI_ASOBU_GATYA` sequence from `M_GACH.MOTN`; it has 540 source
frames at one source frame per game tick. The runtime therefore schedules
`A904:02` at frame 360 through the generalized authored-emote sound-cue path.

The remaining commands are packaged but intentionally unwired:

| Command | Native function | Proven parent route |
| --- | --- | --- |
| `A904:00` | `0x553d0` | frame-100 child via `0x52a90` |
| `A904:01` | `0x54244` | frame-170/215 counted children |
| `A904:03` | `0x555ac` | frame-215 child entry |
| `A904:04` | `0x555ac` | same child's later completion |
| `A904:05` | `0x540f0` | frame-310 controller children |

Their command identity and reachability are exact, but their scheduler/yield
completion has not yet been converted to Ryo motion frames. Audition or
placing them at the parent's launch frame would be a timing guess.

Rebuild the evidence and deterministic WebM/Opus pack with:

```sh
npm run extract:d000-gacha-audio
python DTPKDump.py -wavconv E1GACHAP.SND
npm run build:d000-gacha-audio -- /path/to/decoded-output
```

The source-safe proof is
`tools/evidence/d000-gacha-audio.json`; conversion provenance and every
track hash are in `public/audio/world/e1gachap/manifest.json`.

## Generalized MAPINFO sound-call inventory

`tools/audio/extract_native_world_audio_calls.py` applies the proven dispatcher ABI
to every MAPINFO on all three discs. It currently inventories 119 programs and
6,032 operation-`0x006c` calls. Constant runtime words are converted to native
little-endian command bytes, then joined to the F1 location banks named inside
that MAPINFO.

The resolver now models the common bank separately. The catalog proves
`SYSTEM1.SND` has the same
`d25eb40cdfc129a09f380922752891bd47e6e1714a0ddb4556fea6875dad2f59`
hash on discs 1, 2, and 3, so a command absent from the named F1 bank may be
joined to that one shared bank only when its exact command exists there. This
promotes 322 calls across eleven commands into the
`shared-system-bank-resolved` class, including all 196 direct AB05 calls.
It does not make AB06 global: those tracks still differ among location banks.
Runtime-loaded words, absent commands, and multiple location-bank matches
remain explicitly unresolved.

`tools/audio/build_world_audio_pack.mjs` consumes that aggregate directly and
packages every audible exact shared-bank command under
`public/audio/world/system1/`. Silent compositions are retained as
`controlOnly` manifest records rather than fabricated audio. The records keep
their native command, call count, composition bytes, playback/sample IDs,
rate, volume, encoded hash, and both evidence-file hashes. These assets remain
unwired until their individual map/object behavior is proven.

The detailed report lives in ignored
`.disc-work/audio/native-world-audio-calls.json`; the source-safe aggregate is
`tools/evidence/native-world-audio-calls.json`. Rebuild both with:

```sh
npm run extract:native-audio-catalog
npm run extract:native-world-audio-calls
```

The inventory also records object tags used by HMDL transforms or tagged
object actions in the same generated function. This is candidate discovery,
not a mapping rule. For example, JOMO's superficially promising sound
functions co-occur with `STAN`, not a drawer tag. The report therefore rejects
the former “nearby sound means drawer sound” shortcut and requires a direct
control-flow edge or emulator trace for promotion into runtime data.

### JOMO drawer selector boundary

The wardrobe drawer now has a source-safe negative proof rather than only a
co-occurrence warning. `ATS1`, the captured upper
`S1_JOMO_TANM4W3G.MT5` drawer, is an exact member of JOMO shared-object group
zero. That group contains callback token `0x000b05a9`, selector 11, which
resolves through JOMO's function table to generated routine `0x11f50`.

Selector 11 has two sound branches. At `0x12794` and `0x128e0` it reads word
9 of a selected 13-word logical record, rejects `0xffffffff`, and only then
passes the word to operation `0x006c` at `0x1280e` or `0x1295a`. This is an
exact conditional route, not evidence that a playable command is present.

Three source-hashed full-RAM checkpoints from the synchronized native drawer
session establish the runtime side:

```text
JOMO module base             0x0c3c5740
installed script context     0x0c4963ac
logical-record pointer       0x0c457da0
18 records x words 9..12     all 0xffffffff
```

All 216 inspected runtime sound slots remain sentinel values. Consequently,
the captured drawer session cannot obtain a cue from this selector-11 logical
word path. The fixed AB05 calls in nearby `STAN` and scheduled-Saki routines
are not substitutes, and the model-owned JOMO door pairs are not generalized
to drawers.

The suspected engine object-action phase route is now bounded too. Operation
`0x0139` mode 21 stores two opaque phase values in engine slots
`0x0c2164e8`/`0x0c2164ec`. The selector-10/11 manager later sends each
nonzero value once through shared typed-command dispatcher `0x0c17a91c`, then
clears it. The earlier analysis made an endianness/boundary error here.
`0x000b05a9` can be described as opcode `0x05a9`, selector 11 while it is
SCN3 bytecode, but the receiving typed dispatcher examines its low byte
`0xa9` and sends it to sound queue `0x0c1d4b18`. Its little-endian bytes are
the playable `A905:11` command.

The exact JOMO location bank closes the mapping. Group zero, which owns
drawer `ATS1`, supplies playable `A905:11`, `A905:10`, and `A905:100`
commands backed by samples 31, 30, and 32 in `F1OMOYAA.SND`; all three play
at 11,025 Hz. The empty logical-record words remain useful negative evidence
for a separate route, but they do not cancel these phase sounds.

The synchronized interpreter trace now closes their phase meanings. Starting
from the source-hashed Hazuki wardrobe state, left-trigger focus plus A opens
the visibly closed ATS1 drawer. B then closes it from the visibly open state.
An entry trace at the typed dispatcher records:

```text
closed  -> A905:11 at cycle 165949853736  opening start
open    -> A905:10 at cycle 167748160768  closing start
closing -> A905:100 at cycle 167998610128 closing impact
```

The zero fourth group word means there is no opening-completion command.
The normalized three-row capture is retained at
`tools/evidence/jomo-ats1-drawer-phase-dispatch.csv`; the extractor
pins its hash, the archived-state hash, PC, return addresses, command words,
and their bank playback/sample joins. The browser emits those phases only for
ATS1 through ATS6, the drawer tags proven to share group zero. It spatializes
them from the drawer root through the normal world-effects path.

Regenerate the proof and browser assets from the pinned JOMO MAPINFO, compact
runtime trace, and decoded source bank:

```sh
npm run extract:jomo-drawer-audio-scope
npm run extract:jomo-object-phase-callbacks
python3.12 DTPKDump.py -wavconv F1OMOYAA.SND
npm run build:jomo-drawer-audio -- /path/to/decoded-output
```

The results are `tools/evidence/jomo-drawer-audio-scope.json` and
`tools/evidence/jomo-object-phase-callbacks.json`. The three deterministic
WebM/Opus assets and their provenance manifest live under
`public/audio/world/f1omoyaa`. No full RAM binary or executable byte dump is
added to source control.

## D000 AUTH audio inventory

`tools/audio/extract_d000_auth_audio_inventory.mjs` applies the shared ASEQ parser to
all 39 AUTH resources currently unpacked from D000. Twenty-six files contain
453 authored sound events: 451 playable A904 commands and two explicit stop
sentinels, spanning 24 distinct playable commands. Every event retains its
AUTH path and hash, record offset, actor tag, event index, and exact global
30 fps timeline frame. All 39 timelines terminate cleanly.

This broader inventory does not assume that equal A904 command bytes select
the same sound across resource families. Each AUTH family remains
bank-unresolved until its archive/resource linkage is proven. It therefore
expands the extraction queue without turning coincident command numbers into
incorrect browser sounds. Rebuild it with:

```sh
npm run extract:d000-auth-audio
```

`tools/audio/audit_d000_auth_audio_banks.mjs` currently proves five such links from
the source-hashed D000 MAPINFO resource clusters:

| AUTH family | Native bank | Authored events | Distinct commands |
| --- | --- | ---: | ---: |
| `D0W0` | `A1_YAMAW.SND` | 188 | 20 |
| `AUTH` | `A1_TELP.SND` | 7 | 6 |
| `DJHN` | `A1_YANJI.SND` | 129 | 22 |
| `YQ14` | `N1014_4.SND` | 13 | 4 |
| `YBHN` | `A1_YOBI.SND` | 15 | 9 |

For each family, the audit verifies the bank and every sequence string at its
exact MAPINFO offset, parses the referenced DTPK, and requires every playable
AUTH command to exist in that bank. DRAUTH, YORU, and BUSS remain explicitly
unresolved.

The D0W0 cluster at `0xadb11..0xadc5c` places `A1_YAMAW.SND` directly before
all twelve `D0W0/seqdata*.bin` resources. The bank contains one 21-track A904
group; the twelve AUTH files use 20 of those tracks. The deterministic builder
packages those 20 exact cues under `public/audio/world/a1_yamaw/`, preserving
the 188-event frequency totals and both evidence hashes. They remain unwired
until the D0W0 sequence-launch path is integrated.

```sh
npm run audit:d000-auth-audio-banks
python3.12 DTPKDump.py -wavconv A1_YAMAW.SND
npm run build:d000-d0w0-audio -- /path/to/decoded-output
```

## Shared TELM object-controller audio

Tagged object operation `0x00f1` resolves a scene tag and its associated
`TELM` record. Its 18 numeric modes can enter the shared 22-state controller
whose update function begins at `0x0c16d40a`. This is the common native
mechanism behind a class of world-object interactions; it is stronger evidence
than placing a sound bank and an object filename near each other in MAPINFO.

`tools/audio/extract_native_telm_audio.mjs` now decodes the controller directly from
the source-hashed executable. It reconstructs the signed state jump table,
walks SH-4 direct branches and delay slots from every state entry, identifies
AB sound-command calls to shared typed-command dispatcher `0x0c17a91c`,
recovers each constant command word loaded into `r4`, and joins that command
to the all-disc DTPK catalog.
The result contains 24 dispatcher calls and ten unique command bytes:

```text
AB05 tracks 0, 1, 2, 3, 6, 7
AB06 tracks 0, 1, 2, 3
```

One `AB05:6` call belongs to controller initialization. The other 23 calls are
reachable from 13 numeric states. States 0, 4, 6, 9, 10, 11, 17, 19, and 21
do not directly issue a sound command. This is a reachability statement, not
an inferred label for what any state visibly does.

Every `AB05` command resolves uniquely to the identical SYSTEM1 bank shipped
on all three discs. `AB06` is intentionally different: its command namespace
exists in seven distinct F1 location-bank hashes, with different samples and
track counts. The active location bank must therefore be supplied by the
calling map context before an `AB06` cue can be packaged or played. Substituting
Dobuita's version globally would produce authentic bytes from the wrong place.

The SYSTEM1 builder packages the referenced AB05 compositions under
`public/audio/world/system1`, but leaves them unwired pending state semantics.
The DTPK composition itself must be retained: `AB05:01` stops playback 117 and
starts 118, `AB05:03` stops playback 119 and starts 120, and `AB05:07` is a
zero-volume stop for playback 122. The manifest records every operation and
emits no fake audio asset for that control-only track.

Rebuild the compact evidence with:

```sh
npm run extract:native-audio-catalog
npm run extract:native-telm-audio
npm run extract:tagged-telm-control
```

`tools/evidence/native-telm-audio-calls.json` retains every controller state
target, dispatcher call site, command load/literal, reachable-state set, bank
candidate, and the explicit semantic boundary. The dispatcher is not
audio-only; these particular calls are audio because their exact constants are
AB05/AB06. High-level names such as phone, drawer, switch, open, and close
remain unresolved until a script transition, animation contact, or emulator
trace joins an object operation to the numeric state. This prevents
shared-system cues from being assigned by audition alone.

The operation evidence also retains exact low-level behavior for modes 0, 1,
and 11 through 13. Modes 0 and 1 establish and clear a second associated TELM
link at fields `0x00a8`/`0x00ac`; modes 11 and 12 copy distinct authored
three-component values to `0x07bc..0x07c4` and `0x07c8..0x07d0`; mode 13 sets
field `0x07b8`. These are field-level descriptions, not invented
open/close/position semantics.

### JOMO telephone cadence

JOMO contains a stronger telephone-specific route than generic TELM
reachability. `tools/audio/extract_jomo_telephone_audio_evidence.py` source-hashes
the retail Disc 1 JOMO MAPINFO and verifies all three relevant generated
functions at their exact boundaries:

- coroutine `0x1d524..0x1d77a` starts shared `AB05:4`, waits for native
  operation `0x0031` to report `0x0200`, increments a counter from 0 and
  yields while it is at most 45, issues zero-volume `AB05:5`, performs the
  same off interval, and repeats against its incoming limit;
- its only two direct callers are in JOMO control routine
  `0x1e104..0x1ff4c`; one passes a runtime byte and one passes literal 6;
- independent state-30 function `0x6dfe4..0x6e62c` issues `AB05:5`, then
  JOMO-local `AB06:1`, then modes 11, 12, and 0 against literal `TEL_`, with
  `AKIR` supplied as mode 0's linked actor.

This proves the native cadence and the location-scoped cue without promoting
the other TELM-controller commands into phone sounds. The owning large
routine is callback selector 63 for static tag `DDFP` and references E1032
dialogue resources; DDFP is retained as its real tag rather than relabeled as
the phone.

The shared audible half already ships as
`public/audio/world/system1/ab050400.webm`; its `AB05:5` mate remains a
control-only manifest record. The location cue is decoded from source-hashed
`F1OMOYAA.SND` and packaged as
`public/audio/world/f1omoyaa/ab060100.webm`. It remains unwired because the
browser does not yet implement the owning E1032 incoming-call state. Playing
it during ordinary phone inspection would create a trigger absent from the
native route.

```sh
npm run extract:jomo-telephone-audio
python3.12 DTPKDump.py -wavconv F1OMOYAA.SND
npm run build:jomo-telephone-audio -- /path/to/decoded-output
```

JOMO's selected shared-object setup has also been bounded at the next native
layer. `tools/worlds/extract_jomo_controller28_evidence.py` verifies six calls that
configure engine controller 28. Its two static pointers are not motion names:
they point to four-float controller parameter tables, and the executable's
selector-2 handler copies the four values into controller fields. Nearby
`DEB_AKESIME_FUSUMA_*` debug strings therefore cannot be used to name the
drawer action.

The retained JOMO drawer captures close the Ryo side of that boundary without
using those strings. `tools/animation/extract_jomo_ryo_motion_evidence.mjs` reads the
MOTM rendered-frame clock and Ryo's 37 native matrices from three source-hashed
RAM images. It root-normalizes their matrix deltas and scores every decodable
sequence in the source-hashed retail player `MOTION/MOTION.BIN`. Sequence 902,
`AKI_AKI_TATI_IWA_L`, is the unique match: its relative delta error is
`0.0542`, while the runner-up is `18.17x` worse. The 60-frame sequence is
Ryo's ordinary standing idle, not a drawer-specific interaction motion. Its
authored action metadata has no sound or surface-sound cues. Consequently the
drawer sound cannot be assigned to a Ryo motion; its exact object/room command
remains unresolved and must not be guessed.

```sh
npm run extract:jomo-controller28
npm run extract:jomo-ryo-motion
```

## Runtime safeguards and spatial effects

World footsteps use the shared master/effects preferences. They play only while
the local actor is moving on a resolved support surface. They are suppressed
while movement is locked, during no-clip, while airborne, and while driving a
forklift. Active effects are stopped on world replacement and app disposal.

Interaction effects share the same preferences and
`WorldSounds.playCommand` path. Bank namespaces prevent identical command
bytes in different DTPK banks from colliding. Positional interactions use
inverse-distance gain from the local actor and a hard range boundary;
foot contacts remain listener-local.

## Forklift bank and runtime

Disc 3 has a dedicated forklift bank:
`SCENE/03/SOUND/E1FORKLI.SND`. It declares the A904 group with 26 tracks,
19 playback descriptors, and 20 Yamaha ADPCM samples. This is distinct from
the generic Disc 1/2 banks; the checked source SHA-256 is
`171e106f04972a5bb34ae1113cdaa47208f7cafb65b3814a5202a20da97933fc`.

`tools/audio/build_forklift_audio_pack.mjs` parses the recovered command table and
packages all playable commands. Tracks 2, 14, 18, and 20 are zero-volume native
stop mates for tracks 1, 13, 17, and 19, so they are recorded in the manifest
but do not need silent browser files. Seven samples contain real loop spans;
the builder trims those exact sample ranges into separate seamless Opus clips
instead of looping an entire decoded WAV across its authored attack.

Rebuild after DTPKDump:

```sh
python DTPKDump.py -wavconv E1FORKLI.SND
npm run build:forklift-audio -- /path/to/decoded-output
```

MA00's native operation `0x006c` calls establish these pairs:

| Native purpose | Start | Stop | MA00 evidence |
| --- | --- | --- | --- |
| race-level loop | `A904:01` | `A904:02` | `0x350f8`, `0x3525e` |
| positional forklift | `A904:13` | `A904:14` | four start/stop regions around the parked forklift objects |
| driven layer A | `A904:17` | `A904:18` | player/FOR2 initialization and update region |
| driven layer B | `A904:19` | `A904:20` | player/FOR2 initialization and update region |

An interpreter-mode emulator trace at the low-level sound-object update entry
also showed the driven sound object receiving updates only while the Dreamcast
right trigger was held. The browser therefore uses tracks 17 and 19 as
cross-faded low/high vehicle layers and varies their playback rate from actual
speed and throttle. This association is native-data-backed; the precise
original AICA parameter curve is not recovered yet.

`ForkliftSounds` also maps the short tonal track 15 to the reverse warning and
the long motor sweep track 21 to mast movement. Those two semantic labels are
an acoustic/control-flow classification, not yet a recovered symbolic name.
They are deliberately called out here rather than presented as exact native
labels. The original samples and command IDs remain intact, so a later trace
can correct the state association without replacing assets.

The forklift controller starts on entry, stops on exit/world replacement, uses
the shared effects preferences, cross-fades the two engine layers by effort,
plays the reverse warning at a fixed cadence, and runs the mast cue only while
lift input is active. No generic engine or synthesized effects are used.

## Remaining native work

- Recover why native SOND indices other than 1 and 10 are silent or absent in
  the currently loaded SYSTEM1 bank before enabling them.
- Trace A904 tracks 15 and 21 at their sound-object update sites to replace the
  current acoustic reverse/mast classifications with exact control routes.
- Recover the original AICA gain/pitch parameter curve for the driven A904
  track 17/19 layers.
- Recover the secondary and tertiary D000 door-state branches and the separate
  generated registration protocols used by the 24 non-main-state selectors.
- Recover the native free-roam vending controller's cue path so A1_YANJI
  commands can be mapped to the standalone coin, retrieval, and drinking MOTN
  clips without transferring frames from different cinematic motions.
- Extend the now-proven JOMO phase-command route beyond group-zero ATS drawers
  only after each additional callback family has its engine selector and
  visible operation dynamically joined. Implement the proven E1032
  incoming-call trigger before wiring the recovered JOMO telephone cadence
  and answer cue.
- Apply the same callback path to scheduled NPC locomotion once their local
  terrain/material lookup is available.
