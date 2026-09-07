# Scene and event analysis tools

Commands below run from the repository root unless noted otherwise.
Raw disc inputs and captures are local, ignored prerequisites; a clean clone
does not contain them. See [runtime asset setup](../runtime-assets.md) for
the separate published-asset restore workflow.

## Scene & Script Analysis

### build_shenmue1_scheduled_scene_objects.mjs

Builds the production per-zone scheduled scene-object catalog after the narrow
D000 evidence manifest has been generated. It inventories every Shenmue I area
in `public/models.json`, every available runtime-placement manifest, and every
operation-`0x2a` command in the browser schedule corpus. Generation fails if a
command cannot be assigned to a reviewed object definition. Areas without
complete command/model/endpoint evidence remain explicit disabled coverage
entries.

- **Usage**: `npm run build:shenmue1-scheduled-scene-objects`
- **Outputs**:
  `tools/evidence/shenmue1-scheduled-scene-objects.json` and
  `play/data/shenmue1-scheduled-scene-objects.json`

### scn3_extractor.py
Extracts object placement data (MOBJ), entities, and trigger information from Shenmue `MAPINFO.BIN` (SCN3) files.
- **Usage**: `python3 scn3_extractor.py [PATH_TO_MAPINFO.BIN] -v`

### scn3_decoder.py
A bytecode decoder for the SCN3 scripting language. Disassembles the logic used for object interaction and scene management.
- **Usage**: `python3 scn3_decoder.py [PATH_TO_MAPINFO.BIN] -v`

### full_scn3_decompiler.py
A higher-level decompiler that attempts to reconstruct the logic structure of SCN3 scripts into human-readable pseudo-code.
- **Usage**: `python3 full_scn3_decompiler.py [PATH_TO_MAPINFO.BIN]`

### extract_jomo_shared_object_dispatch.py
Decodes JOMO's compact shared interaction groups and aligned object records
without emulator input. It preserves callback selectors, action IDs, offsets,
flags, and node/variant routes without guessing a motion type.
- **Usage**: `python3 -m tools.worlds.extract_jomo_shared_object_dispatch MAPINFO.BIN play/data/jomo-runtime-placements.json --out tools/evidence/jomo-shared-object-dispatch.json`

### extract_jomo_ryo_motion_evidence.mjs
Pose-matches the source-hashed frozen JOMO drawer captures against every
decodable retail player motion. It uses Ryo's native 37-matrix runtime and
MOTM rendered-frame clock, proving that the sampled player motion is the
ordinary `AKI_AKI_TATI_IWA_L` idle and that it owns no authored audio cue.
- **Usage**: `npm run extract:jomo-ryo-motion`

### build_d000_scripted_store_state.py
Joins the exact standalone Dobuita clock-controlled MAP overlays to native
door-dispatch sources only when the authored door point lies inside an
authored overlay component's horizontal bounds. It deliberately excludes
broad paired day/evening layer variants and does not infer store names.
- **Usage**: `python3 -m tools.scripting.build_d000_scripted_store_state`

### D000 traffic and AUTH movement audit

`audit_d000_bus_assets.js` verifies the runtime/source bus HRCM byte agreement,
the exact `BUS_`/`BUSS` initial transforms and AMOV tracks in both matching
AUTH sequences, the required native bus render nodes, and production-loader
instantiation. `src/AuthMovement.js` parses the AMOV actor table and evaluates
its cubic Hermite channels; `/play` uses the same evaluator.
`tools/lib/AuthSequence.js` parses ASEQ actor/motion records and resolves mixed
motion banks, so all 16 BUSS motion events have exact MOTN names and frame
intervals rather than inferred clips.

- **Usage**:
  `node tools/worlds/audit_d000_bus_assets.js tools/evidence/d000-bus-assets.json`
- **Evidence**: `tools/evidence/d000-bus-assets.json`

### Dreamcast operation-handler resolver

`extract_mapinfo_dispatch_calls.py` disassembles any MAPINFO SCN3 payload and
emits engine calls in the exact memory order consumed by the native handler at
`r6`. This matters for multi-argument operations: generated code pushes
arguments left-to-right onto a downward-growing stack, so the final source
push is the first handler word.

- **Usage**:
  `python3 -m tools.scripting.extract_mapinfo_dispatch_calls MAPINFO.BIN --out calls.json`

`extract_dreamcast_operation_handlers.py` follows the live SCN3 dispatcher
table in a RAM capture and maps each operation observed in the static call
report to its exact SH-4 handler address and a reproducible code hash.

- **Usage**:
  `python3 -m tools.scripting.extract_dreamcast_operation_handlers captures/pvr/TIMESTAMP-frame-N/ram.bin .disc-work/d000-dispatch-calls.json --out tools/evidence/d000-operation-handlers.json`

### D000 passive-anchor audit

`audit_d000_passive_anchor.js` verifies `DAMY` across all three entry captures,
loads its exact `SEGM4SPG` model, checks the 3 cm root-only hierarchy, and
requires that no direct HMDL transform route exists before the browser hides
it as a scene anchor.

- **Usage**:
  `node tools/worlds/audit_d000_passive_anchor.js tools/evidence/d000-passive-anchor.json`

`audit_d000_static_fixtures.js` applies the same numeric approach to `HDCA`
and `WAGK`: it compares all entry captures, loads each exact model hierarchy,
and inventories every direct operation. This proves `HDCA` has only fixed
root scenery. For `WAGK`, it additionally hashes the owning script, verifies
its `hour >= 19 OR hour <= 6` predicate, and separates WAGK's task-state
operations from the same controller's Ryo/camera staging. WAGK is therefore a
state-dependent passive cutscene prop, not a clickable mechanical object.

- **Usage**:
  `node tools/worlds/audit_d000_static_fixtures.js tools/evidence/d000-static-fixtures.json`

`audit_d000_object_state_operations.py` follows operations `0x001f` and
`0x00a8` into their native handlers, verifies the exact flag offsets/masks and
scheduler branches, and inventories every `WAGK` mode without assigning an
unproven gameplay name.

- **Usage**:
  `python3 -m tools.worlds.audit_d000_object_state_operations captures/pvr/TIMESTAMP-frame-N/ram.bin .disc-work/d000-dispatch-calls.json --out tools/evidence/d000-object-state-operations.json`

`audit_d000_phone_book_interaction.js` proves the telephone-book prop route
without visual offset fitting. It decodes the two `0x00e6` FIXO attachments
and `0x001b` detach calls, verifies model-control IDs 18 and 12 against runtime
matrix indices 36 and 30, checks both local transforms directly in MAPINFO,
and requires the bundled opened `DENS502G` model to hash-match the disc.

- **Usage**:
  `node tools/worlds/audit_d000_phone_book_interaction.js tools/evidence/d000-phone-book-interaction.json`

`audit_d000_gacha_interaction.js` proves the two populated D000 machine
records and their generated `GCH`/`HGC`/`GBX` tag tables, follows the native
instantiate/place/state/association calls, verifies the `CCOW` selector-byte
route, and hash-checks the two exact `HI_GACH` interaction models. `/play`
uses those high-detail models only while the source-native `M_GACH` motion is
active.
It also recovers all sixteen native prize model-token lists, their counted
16-bit collectible lookup pools, the adjacent random-split table without
guessing its label, the exact `CCOW` selector-to-category-state path, and the
native 100-yen currency debit.

- **Usage**:
  `node tools/worlds/audit_d000_gacha_interaction.js tools/evidence/d000-gacha-interaction.json`

`extract_d000_gacha_audio.py` resolves the six E1GACHAP A904 commands through
the native gacha coroutine tree. It proves the one direct Ryo-motion cue at
frame 360 and preserves all child-coroutine timing boundaries as unresolved.
`build_d000_gacha_audio_pack.mjs` converts the six exact DTPK samples to
deterministic WebM/Opus; runtime wiring is restricted to that verified cue.

- **Usage**:
  `npm run extract:d000-gacha-audio`
- **Pack**:
  `npm run build:d000-gacha-audio -- /path/to/DTPKDump/output`

`audit_d000_vending_interaction.js` joins the seven `DJHN/SEQDATA*.AUTH`
cutscene timelines to `M_01JUCE.MOTN`. It verifies the one-based ASEQ motion
references, exact actor frame intervals, native `CAN1` attachment calls, and
the native 100-yen currency check/debit/refund path. The field identity is
independently supported by the room module's `MONEY_LOCK` diagnostic.

- **Usage**:
  `node tools/worlds/audit_d000_vending_interaction.js tools/evidence/d000-vending-interaction.json`

### D000 logical-door extractor

`extract_d000_door_logic.py` resolves D000's 65 logical door selectors through
the native placement-index map to all 65 visible type-2 door records. It also
normalizes the 19 selectors that first reference an adjacent invisible type-1
doorway proxy. An optional Flycast RAM capture supplies the fields populated
by the room at runtime, and the observed-binding report independently checks
selectors joined from streamed `dor0`–`dor9` TASK transforms.

- **Usage**:
  `python3 -m tools.worlds.extract_d000_door_logic .disc-work/exact/d000/MAPINFO.BIN tools/evidence/d000-static-door-placements.json --ram captures/pvr/TIMESTAMP-frame-N/ram.bin --observed-bindings tools/evidence/d000-active-door-bindings.json --out tools/evidence/d000-door-logic.json`
- **Method and evidence**: [Dobuita Object Placement](../../research/shenmue1/d000-object-placement.md)

`extract_d000_door_transitions.py` follows the native logical-door selector
at the script frame's `+48` field into the shared transition coroutine at
file offset `0x7ee88`. It only emits an edge when the selector equality leads
directly to literal `scene`, four-byte `area`, and `entry` arguments which
the coroutine forwards to operation `0x0030` at `0x7f256`. The current Disc
1 D000 binary proves 18 direct storefront selectors and three conditional
state machines (29 native calls and 21 transition selectors total), joining
each selector to its exact visible door through `d000-door-logic.json`.
The other 44 logical selectors contain no call to the native warp coroutine;
they are retained as non-warp dialogue/denial/locked/other interactions
rather than mislabeled as missing destinations.

- **Usage**: `python3 -m tools.worlds.extract_d000_door_transitions`
- **Evidence**: `tools/evidence/d000-door-transitions.json`

`extract_d000_door_dispatch_input_evidence.py` proves the logical selector's
input boundary without conflating it with the adjacent
operation-`0x0031(1)` query. The D000 coroutine copies a distinct
caller/resume argument from stack `+60` to selector local `+48`. Native
operation handler `0x0c16b4c8` separately reads argument `1` as a 16-bit
event/coroutine control field at record `+8`; 216 D000 captures contain only
`0`, `0x400`, and `0x1000` there rather than door selectors 1..45. The tool
records all eight exact operation-`0x0031` field routes, but leaves the
selector's native caller and store availability rules unresolved.

- **Usage**: `npm run extract:d000-door-dispatch-input`
- **Evidence**: `tools/evidence/d000-door-dispatch-input-evidence.json`

`extract_map_event_volumes.py` streams every typed `EVNT` payload, including
payloads which mix record kinds. Kind 5 is the six-float native
parallelogram. Kind 6 is an exact variable-length polygon:

```text
u32 flag, u32 kind=6, u32 vertexCount,
vertexCount * (f32 x, f32 y), u32 0xffffffff
```

The current all-disc inventory contains 149 exact records from 136 MAPINFO
files: 116 kind-5 parallelograms and 33 kind-6 polygons, with no opaque EVNT
payload remaining. `extract_map_event_callbacks.py` independently scans every
MAPINFO for a statically installed operation-`0x0001` callback table, validates
each callback target against the extended SCN3 executable region, and then
recovers native selector dispatches. Only D000, JD00, and JU00 install such a
table on the three discs: nine MAPINFO files, 36 callbacks, and 16 literal
transition routes. JOMO's 72 all-disc class-4 records are therefore exact
geometry with no operation-`0x0001` callback, not unimplemented warps.
`extract_map_entry_points.py` extracts typed destination
`Entry`/`Position`/`Angle` records. `build_map_warp_inventory.py` joins those
independent sources without using browser topology or proximity.

- **Usage**: `python3 -m tools.worlds.extract_map_event_volumes && python3 -m tools.worlds.extract_map_event_callbacks && python3 -m tools.worlds.extract_map_entry_points && python3 -m tools.worlds.extract_map_transition_objects && python3 -m tools.worlds.build_map_warp_inventory`
- **Evidence**: `tools/evidence/map-warp-inventory.json`
- **Current exact coverage**: all 24 native transition-class volumes. The two
  Disc 2/3 MFSY event-1 records remain explicitly unclassified callbacks,
  rather than being inferred to be warps.

`build_map_transition_coverage.py` is the whole-disc coverage join. It
enriches all 292 statically exact source/destination/entry edges from 136
MAPINFO programs with entry placement and physical-source evidence. Only
native EVNT callbacks, typed door-controller associations, and the recovered
D000 selector dispatcher qualify as physical bindings. The remaining
destination-only calls are not assigned to doors or volumes by proximity.

- **Usage**: `python3 -m tools.worlds.build_map_transition_coverage`
- **Evidence**: `tools/evidence/map-transition-coverage.json`

`build_player_portal_inventory.py` applies the stricter runtime boundary to
that join. An edge is a `native-player-portal` only when it has both an exact
typed physical source and an exact destination Entry/default-player
placement. This separates 106 proven player portals from 17 physical triggers
into scripted destinations, 102 placed destinations whose source dispatcher
is unbound, and 67 scripted-or-unbound calls with no free-roam placement.

- **Usage**: `python3 -m tools.worlds.build_player_portal_inventory`
- **Evidence**: `tools/evidence/player-portal-inventory.json`

`extract_map_transition_objects.py` scans each SCN3 static region for the
typed door-controller serialization (name pointer, sequential controller
words ending in `0x02ab`, scale, position, and fixed-angle field). It
associates a destination only through exact callbacks in the same MAPINFO.
The resulting evidence contains 86 records in 86 maps, with 70 exact
destination associations and 16 deliberately ambiguous or unrouted records.

`build_browser_map_transitions.py` joins those controller roots to exact
destination Entry records. It also decodes native `MPK00.PKF::CHARA.CHRT`
`DefImage` bindings before considering exact names or unique area assets.
This independently resolves the otherwise ambiguous `DYKZ:DOR2` as
`DR02_024.MT5`. All 12 free-roam Dobuita storefront interiors now have exact
return routes, exact D000 placements, and production-loader-verified door
models. `/play` picks the real MT5 door mesh, animates its proven moving node,
freezes movement, and changes maps only after the animation completes.

- **Usage**:
  `python3 -m tools.worlds.build_browser_map_transitions && node tools/worlds/audit_interior_door_models.mjs`
- **Runtime manifest**: `play/data/native-map-transitions.json`
- **Model audit**: `tools/evidence/interior-door-model-audit.json`
- **Evidence boundary**: the real door geometry is pickable, but native Door
  Box dimensions are not yet decoded and are never replaced by a guessed
  proxy volume.

`extract_d000_door_curve.py` turns an active object-memory recording into an
exact fixed-turn child-node curve:

```bash
python3 -m tools.worlds.extract_d000_door_curve \
  captures/objects/object-once-1784883671.csv \
  --word-address 0x8c9fa9ac \
  --selector 53 \
  --static-door-index 0 \
  --model S1_D000_DR01_011.MT5
```

`extract_d000_door_call_trace.py` independently reduces the interpreter's
SH-4 dispatcher trace into the exact `0x00c9` node/mode routes and the
fixed-turn values passed to the native setter:

```bash
python3 -m tools.worlds.extract_d000_door_call_trace \
  captures/d000-door-call-trace.csv \
  --tag dor0 \
  --selector 53 \
  --static-door-index 0 \
  --model S1_D000_DR01_011.MT5
```

`extract_d000_door_node_route.py` verifies the separate native branch that
reduces relative actor/door heading to a quadrant and selects node 12 for
quadrants 2/3 or node 7 for quadrants 0/1:

```bash
python3 -m tools.worlds.extract_d000_door_node_route \
  .disc-work/exact/d000/MAPINFO.BIN
```

`extract_d000_tko_spin.py` extracts the exact `TKOK`/`TKOL` ambient node-152
rotation from D000's native SH-4 room routine and optionally verifies it
against a dispatcher trace. The source operation adds `-910` fixed-turn units
at 30 Hz; the production MT5 coordinate reflection makes that a smooth
positive Babylon Y rotation.

```bash
python3 -m tools.worlds.extract_d000_tko_spin \
  .disc-work/exact/d000/MAPINFO.BIN \
  --trace .disc-work/d000-call-trace.csv \
  --out tools/evidence/d000-tko-node-spin.json
```

`audit_d000_tko_state_machine.js` verifies and records the native TKO pair
controller's two scene-variable selectors and exact `[07:00, 19:00)` game-time
window. It deliberately records the missing story-variable service instead
of inventing a click trigger.

```bash
node tools/worlds/audit_d000_tko_state_machine.js \
  .disc-work/exact/d000/MAPINFO.BIN \
  --dispatch-calls .disc-work/d000-dispatch-calls.json \
  --out tools/evidence/d000-tko-state-machine.json
```

`extract_d000_time_window_evidence.py` inventories all 19 calls to D000's
shared native clock predicate. The predicate treats 06:00 as its day boundary:
each hour below six is normalized by adding 24, then the half-open comparison
`start <= current < end` is evaluated. This preserves authored overnight
windows such as 22:00–05:25. The extractor builds direct intra-routine SH-4
control flow for the 17 canonical boolean result branches and classifies
object/flag calls as true-only, false-only, shared, or unreachable. It also
records eight exact branch-owned constant writes into native routine-local
state. Shared calls are never attributed to a clock window merely because
they occur in the same routine.

```bash
python3 -m tools.worlds.extract_d000_time_window_evidence
```

- **Evidence**: `tools/evidence/d000-time-window-evidence.json`
- **Boundary**: two calls combine the clock result with other runtime state
  before branching. Indirect helper effects and downstream consumers of the
  recovered local state require their own exact data-flow join before `/play`
  changes a store or object.

`audit_d000_door_models.js` loads all 34 distinct models used by the 65
logical doors and verifies that the shared native primary route, node 12,
exists in each:

```bash
node tools/worlds/audit_d000_door_models.js \
  tools/evidence/d000-door-logic.json \
  --out tools/evidence/d000-door-model-audit.json
```

`build_d000_interaction_coverage.js` joins all 151 browser placements to the
behavior registry, production model audit, native dispatcher-call scan, and
HMDL-transform scan. It deliberately separates “clickable in the browser”
from “the original native semantics are decoded.”

```bash
node tools/worlds/build_d000_interaction_coverage.js
```

The machine-readable result is
`tools/evidence/d000-interaction-coverage.json`.

### D000 public exports and generated door-coroutine table

`extract_d000_door_callback_table_evidence.py` reads the live SCN3 runtime to
recover D000's exact six-entry public export table, then independently scans
the token for its broader 858-entry generated-coroutine target table. It
validates both byte-exact tables in captured RAM and proves that the
logical-door dispatcher is generated-target index 570, not a public export.
The table index is also not a logical door ID.

```bash
npm run extract:d000-door-callback-table
```

### D000 Hato dialogue invocation

`extract_d000_hato_invocation_evidence.py` proves the native
operation-`0x0002` child-coroutine launch and three direct SH-4 calls leading
to Hato's dialogue target. It also records the exact persistent-flag query,
native game-hour window, and scene-context selector predicate without
inventing story semantics.

```bash
npm run extract:d000-hato-invocation
```

`extract_d000_interaction_selector_evidence.py` closes that selector boundary.
It verifies D000's operation-`0x0181` mode-zero call against the captured
Dreamcast handler, proves the native 24-byte spatial-record scan and `-1`
sentinel, and follows the zero-based result through the generated coroutine's
`result + 1` write to scene-context slot `+0x84`. Hato selector 6 is therefore
exact spatial result 5. The captured D000 interaction context proves `+0x6c`
is count 18 and `+0x70` points to the byte-identical relocated authored table;
both are passed directly to `0x0181`. Hato therefore selects authored row 5
exactly. The handler also proves the record schema and mode-zero test:
position, required fixed-turn facing, selector flags, and an auxiliary word;
an actor-oriented strip with ±0.4 vertical extent, 0.6 longitudinal
half-depth, a default 0.4 lateral half-width, and a strict circular facing
tolerance. A second terminated 12-byte table supplies per-row width
overrides. Its captured and serialized copies are byte-identical; Hato's row
has authored half-width 0.5. The row's higher-level story label and auxiliary
word semantics remain unresolved.

```bash
npm run extract:d000-interaction-selector
```

`extract_spatial_interaction_system_inventory.py` then audits every MAPINFO on
all three discs. The common subsystem appears in 24 of 136 rooms and has the
same lifecycle shape everywhere: one mode-zero selection call, two mode-two
updates, and one mode-one teardown. Twenty-one instances link exactly to a
six-argument child-coroutine launch carrying one serialized source pointer.
Their original `100000.0f` terminators prove 178 ordered 24-byte spatial
records, and the immediately following typed tables prove 88 custom lateral
widths. The three record-entry words not used by mode zero remain raw rather
than being assigned speculative meanings.
All 24 mode-zero coroutines now also have an exact generated result route:
the zero-based operation result is incremented and written to a room-specific
per-player selector array. Five distinct authored array bases are retained,
so later predicates can be joined to records without assuming D000's
`+0x84` layout applies everywhere.
The three `JABE` variants enter through a different root and remain explicit
source-recovery boundaries rather than inferred matches.

```bash
npm run extract:spatial-interaction-system
```

## Analysis & Debug Scripts

### build_drauth_activity_pack.mjs

Rebuilds D000's exact two-entry DRAUTH activity package. It verifies the
original PAKS/IPAC archive and member hashes, parses both AUTH timelines,
resolves all authored motions, and writes a manifest containing the exact
operation-`0x013e` slot/pointer identities consumed by operation `0x0050`.

- **Usage**: `npm run build:drauth-activity`

The builder delegates archive parsing, exact member checks, motion resolution,
and manifest emission to `tools/lib/NativeAseqActivityPack.mjs`. That shared
compiler also supports hash-verified canonical motion-bank references without
copying a shared binary into every activity family.

### build_native_cutscene_package_readiness.mjs

Builds the machine-readable rollout gate for every exact operation-`0x013e`
resource install retained by the reviewed native program pack. It joins each
slot/pointer pair to the source-hashed AUTH inventory and records owner,
payload, motion, audio, package, availability, and blocker states. Parsed AUTH
files are not promoted to selectable cutscenes unless their complete package
is registered and runtime-tested.

- **Usage**: `npm run build:native-cutscene-package-readiness`
- **Output**: `tools/evidence/native-cutscene-package-readiness.json`

### build_sakr_activity_pack.mjs / build_sakr_audio_pack.mjs

Build the exact YD01 `SAKR` training-memory package and its native audio. The
activity builder verifies all 19 archive members, resolves every bank-17
motion, and emits only activity-local data while canonical `S1_YD01` map and
body models remain in the shared asset catalog. The audio builder verifies
`A0128.AFS` and `A1_SAKRA.SND`, preserves the reused young-Ryo voice identity,
and decodes all five AUTH-addressed DTPK effects.

The reviewed owner and exact package are retained as research-only until the
archive-local `JKB_FTBL.BIN` TALK poses are evaluated successfully. Parsed
AUTH, working motion, and decoded audio do not bypass that presentation gate.

- **Usage**: `npm run build:sakr-activity && npm run build:sakr-audio`
- **Outputs**: `play/assets/yd01/sakr/` and `public/audio/world/sakr/`

### build_yq14_activity_pack.mjs / build_yq14_audio_pack.mjs

Build the exact two-activity YQ14 package and its native audio presentation.
The activity builder verifies the gzip-wrapped archive, references canonical
`M_ZAKO.MOTN` by hash, and emits the CHRT-proven package-owned `BIN_` beer prop.
The audio builder verifies the YQ14 MAPINFO-backed `N1014_4.SND` and
`A01114.AFS` sources, decodes four DTPK effects plus two voices, and preserves
the aligned SRF captions and lip cues.

- **Usage**: `npm run build:yq14-activity && npm run build:yq14-audio`
- **Outputs**: `play/assets/dobuita/yq14/` and
  `public/audio/world/yq14/`

### build_drauth_audio_pack.mjs

Builds the exact audio dependencies referenced by those two AUTH timelines.
It verifies `01REV.AFS` and `A1_SENFK.SND`, extracts only the 12 used native
voice members, resolves all 17 unique SFX command words through the DTPK bank,
and emits WAV assets plus immutable native/output provenance. It requires
DTPKDump.py and vgmstream-cli through arguments or `DTPK_DUMP` and
`VGMSTREAM_CLI`.

- **Usage**: `npm run build:drauth-audio`

### build_d000_selector18_music.py

Builds selector 18's exact one-shot `BGM013.SND` sequence for browser playback.
It verifies the source bank, original `AICADRV.BIN`, renderer, DTPK group, and
command `A8250000` by SHA-256. The output Ogg stream serial and page checksums
are canonicalized so repeated builds are byte-for-byte reproducible. The
180-second render is presentation media only; it does not assign semantics to
the native A0-family commands that follow it.

```bash
npm run build:d000-selector18-music -- \
  --disc-root /path/to/extracted-disc-root \
  --renderer /path/to/dsf-renderer \
  --ffmpeg /path/to/ffmpeg
```

- **Output**: `public/music/dobuita-selector-18.ogg`
- **Evidence**: `tools/evidence/d000-selector18-music.json`

### extract_sound_command_operation_evidence.py

Pins operation `0x006c`, its three-argument tail-call wrapper, and the exact
`1ST_READ.BIN` dispatcher body. The report distinguishes the direct `>= 0xA8`
AICA queue route from the separate `< 0xA5` parameter-building route without
inventing meanings for individual numeric commands.

- **Usage**: `npm run build:sound-command-evidence`
- **Evidence**: `tools/evidence/sound-command-operation-evidence.json`

### Native activity actor assets

`build_scheduled_actor_assets.js` also accepts an explicit `modelCodes` actor
source, which is used by `play/data/events/nativeActivityActors.json`. It
extracts only the explicitly declared native activity models from HUMANS.AFS, pairs
each CHRM with the immediately preceding PAKF texture entry, refuses
nonidentical duplicate candidates, and writes immutable hashes to
`tools/evidence/native-activity-actor-assets.json`.

```bash
node tools/actors/build_scheduled_actor_assets.js \
  play/data/events/nativeActivityActors.json \
  /path/to/SCENE/03/STREAM/HUMANS.AFS \
  play/assets/characters \
  tools/evidence/native-activity-actor-assets.json
```

After adding exact actor assets, regenerate controller-family evidence with the
activity manifest as the final argument to
`build_npc_controller_family_data.mjs`. The family comes from each CHRM root
hierarchy node; it is not selected from an actor name.

### extract_operation_0050_evidence.py

Verifies D000's exact operation-`0x0050` start/poll route and its post-activity
mode-`-7` delayed-stop-latch query, both authored operation-`0x013e` resource
bindings, DRAUTH archive membership, the native
one-frame updater, 30 Hz spline clock, motion interval adjustment, and the
seven-entry ASEQ command dispatch table.

- **Usage**: `npm run extract:operation-0050`

### extract_operation_0170_evidence.py

Pins operation `0x0170` and its exact 32-slot native MAP render-preparation
family. It proves selector 18's all-slot invalidate/rebuild pair, the
`MAP.MT5` / `MAP%02d.MT5` identities, source chunk names, hierarchy invalidator,
and `PRER` workspace path without treating Dreamcast preparation as Babylon
visibility or as a harmless no-op. The paired runtime adapter resynchronizes
light sources and dirties light-dependent materials only on exact loaded MAP
layers, with transaction rollback.

- **Usage**: `npm run extract:operation-0170`
- **Evidence**: `tools/evidence/operation-0170-evidence.json`

### analyze_mapinfo.py
Extracts placement transforms from MAPINFO.BIN SCN3 data, finding transform blocks and correlating them with model references.

### analyze_chrs.py / debug_chrs.py / scan_entities.py
Debug and analysis scripts for examining character data and entity structures in MAPINFO.BIN. These use hardcoded paths and are intended for interactive research.
