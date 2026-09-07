# Dobuita (`D000`) object placement

This document owns Dobuita-specific placement evidence and regeneration. See
[World loading and transitions](../../implementation/world-loading-and-transitions.md)
for the application-level scene and placement lifecycle.

Dobuita combines three placement systems. Treating any one as the complete
source loses objects:

1. `MAP*.MT5` supplies the static street and building geometry.
2. `MAPINFO.BIN` contains a 120-record static door table.
3. Native SH-4 room code creates tagged `TASK` objects and attaches HMDL render
   nodes for telephones, vending machines, capsule machines, signs, and other
   props.

## Direct emulator warp

The Shenmue 1 RAM warp record resolved to `0x8c3c522c` in the captured
Disc 1 JOMO context:

| Address | Meaning |
| --- | --- |
| `0x8c3c522c` | trigger (`1` requests the warp) |
| `0x8c3c5230` | four-byte area ID (`D000`) |
| `0x8c3c5234` | scene/disc ID (`1`) |
| `0x8c3c5238` | entry ID |
| `0x8c3c523c` | required initialized value (`7`) |

This was not inferred from a screenshot. The idle record contained
`JOMO, 1, 0, 7`; replacing it with `D000, 1, entry, 7` and setting the trigger
produced the game's native Dobuita loading screen. Entries 0, 1, and 2 were
captured independently.

This is a scene-context-relative address, not a permanent global address.
`0x0c0f0a86` resolves the current context through the owner pointer at
`0x0c217488`, then writes the trigger at context `+0xcc` and the remaining
fields through `+0xdc`. See
[`map-transition-trace.md`](map-transition-trace.md) before issuing a warp
after any room load.

## Tagged runtime model binding

`tools/worlds/extract_tagged_runtime_objects.js` joins each object using runtime
pointers:

1. scan `TASK` structures whose callback is `0x0c2de638`;
2. read the four-character object tag at `TASK + 0x168`;
3. read position/rotation/scale from the TASK transform;
4. follow `TASK + 0x60` to its HMDL render node;
5. follow the node's mesh pointer into the relocated HRCM model;
6. match that relocated HRCM against models extracted from D000's packages by
   its 12-byte header and full-buffer byte agreement.

The three entry captures produced 75, 75, and 76 tagged objects. The selected
entry-2 capture bound 65 tags to exact models, including 26 modeled world
objects. Zero-position records remain explicitly classified as
`origin-or-inactive`; they are not placed at the world origin.

Example:

```text
TEL0 TASK 0x8c7f7960
  position      (38.533, 0.970, 9.521)
  render node   0x8c7f7d80
  mesh          0x8c7f20a4
  runtime HRCM  0x8c7f1340
  source model  OMG/TELM402G.CHRM
  agreement     97.9%
```

## Multiplexed vending-machine placement

`VM_0` is deliberately reused by the game. Its runtime position changes to the
active neighborhood, so one capture is not a complete placement list. The
native D000 code contains the full branch table:

| Runtime X | Runtime Y | Runtime Z | Raw yaw | Degrees |
| ---: | ---: | ---: | ---: | ---: |
| 17.9500 | 0.0724 | 25.9690 | `0xed27` | -26.5045 |
| -15.9900 | 0.0724 | 72.2601 | `0x0000` | 0 |
| -97.8900 | 0.0724 | 96.8260 | `0xa60f` | -126.4801 |
| -108.8248 | 0.0724 | 74.6069 | `0xa1c6` | -132.5061 |
| -70.8000 | 0.0724 | 56.6000 | `0x2882` | 56.9641 |

Four positions were independently observed in RAM across the entry captures.
The fifth is recovered from the same static branch table and instruction
pattern.

## Browser manifest

`tools/worlds/build_d000_placement_manifest.js` combines:

- 120 static door placements from
  `tools/evidence/d000-static-door-placements.json`;
- 24 fixed modeled world TASKs;
- five vending-machine branch-table placements;
- two parent-local capsule objects composed under their matching capsule
  machines;
- the exact captured bus, driver, and inactive-car states.

The result is `play/data/d000-runtime-placements.json`: 154 placements across
63 distinct model names. Models omitted by the old public catalog are
bundled under `play/assets/dobuita/`; every other model name is verified against
`public/models.json`.

No captured dynamic tag is omitted. `BUS_` is the bus TASK, whose complete
runtime HRCM agrees 99.0% with `HUMANS.AFS` entry 33
`BUSS530G.CHRM`. `BUSS` is the separately modeled driver. The AMOV chunks in
`BUSS/SEQDATA2.AUTH` and `SEQDATA5.AUTH` are byte-identical and provide exact
8.216666-second Hermite position/rotation tracks for `BUS_`, `BUSS`, and
`AKIR`. `/play` lets a click on the bus or driver replay the exact bus and
driver tracks. All four BUSS AUTH timelines now also resolve their 16 motion
events across the bank-`0x10` `M_01BUS` package and bank-`0x02` global
`MOTION.BIN`, including the exact Ryo bus entry/exit clips and frame ranges.
The native story-state trigger and simultaneous Ryo motion/movement staging
remain explicitly unresolved.

`CAR7` is also retained, at its exact captured inactive position
`(-100, -20, 0)` in browser coordinates. Its `C85M201G.CHRM` model loads
successfully and all four model texture identifiers resolve in D000's texture
pack. All available runtime states park it below the map, and none of the four
BUSS AUTH files contains a `CAR7` actor track, so the browser does not invent
an active route.

The reproducible bus/model/movement audit is:

```text
tools/evidence/d000-bus-assets.json
```

## TKO ambient fixture animation

The two `TKO0101G` instances (`TKOK` and `TKOL`) share an authored native
operation:

```text
dispatcher operation 0x00c9
mode                 1 (add)
render node          0x98 / 152
source rotation      [0, -910, 0] fixed-turn units per update
update rate          30 Hz
```

The direct calls are at MAPINFO file offsets `0x69254` and `0x69440`.
A runtime dispatcher recording independently observed 11,696 matching
`TKOK` calls at `0x0c42e994`. Both production-loaded `TKO0101G` models expose
render key 152. `Mt5Loader` reflects source Y rotation into Babylon `-Y`, so
the browser applies the corresponding smooth positive rotation at
149.96337890625 degrees per second.

The reproducible evidence is:

```text
tools/evidence/d000-tko-node-spin.json
```

## Native operation-handler resolution

The captured script call target `0x0c0bb69c` enters `0x0c0bb6fe`, which indexes
the u32 handler table at `0x0c29a9e0` directly by operation ID. This resolves
the previously anonymous static call evidence to exact SH-4 entry points. For
example, operation `0x00c9` maps to `0x0c15820a`, `0x016b` maps to
`0x0c1600aa`, and `0x015b` maps to `0x0c1600d2`.

`tools/scripting/extract_dreamcast_operation_handlers.py` resolves all operations present
in the Dobuita call report and hashes the first 128 bytes of every handler, so
subsequent semantic naming is tied to immutable code rather than call-shape
guessing:

```text
tools/evidence/d000-operation-handlers.json
```

This handler map also narrows `WAGK` without guessing its visual behavior.
Operation `0x001f` reads/sets/clears mask `0x04` in the resolved object's
`+0x88` flag byte. Operation `0x00a8` toggles mask `0x04` at `+0x5c` on an
associated object and swaps scheduler state. `WAGK` has both set and clear
branches for both operations. Following their owning routine proves it is a
nighttime cutscene controller: it tests `hour >= 19 OR hour <= 6`, stages
`AKIR` through operations `0x0019`/`0x001c`, and invokes camera/event
operations while WAGK itself receives no HMDL transform. The browser now
keeps WAGK as a passive prop in the captured visible state and no longer
invents an inspection animation:

```text
tools/evidence/d000-object-state-operations.json
```

`TKOM` and `TKON` construct a three-word rotation vector on the routine's
stack. Its Y component is not a pointer: the routine loads `-910`, then adds
`(41 - counter) * 22` while an unsigned byte counter descends from 40 to 1.
That proves a 40-tick slowdown curve from `-888` through `-30` fixed-turn
units per update, totaling `-18360` fixed turns. The browser exposes the exact
curve through `evaluateD000TkoSlowdown`, but does not start it at page load:
the native story/time-state branch selecting the transition is not yet
proven. Reproducible arithmetic and call-site provenance are recorded in:

```text
tools/evidence/d000-tko-node-slowdown.json
```

The four TKO tasks are two mutually exclusive pairs. Initialization dispatches
set `TKOK/TKON` active and `TKOL/TKOM` inactive; live RAM independently stores
task flags `0x85` for the active tasks and `0x81` for the inactive tasks. In
the million-row dispatcher recording, only active `TKOK` receives the
continuous node-152 update. The browser therefore reproduces that captured
state instead of drawing all four variants on top of each other. The exact
call and RAM evidence is:

```text
tools/evidence/d000-tko-initial-state.json
```

The surrounding state machine is now decoded far enough to identify its
inputs without assigning a guessed browser trigger. `TKOK`/`TKOM` are selector
0, controlled by typed scene-variable `0x02f3`; `TKOL`/`TKON` are selector 1,
controlled by `0x0298`. Both reads test result mask `0x02`. The same controller
calls the shared game-clock predicate with an exact start-inclusive,
end-exclusive window of `07:00` through `19:00`. The predicate reads the
scene-context hour and minute bytes at offsets `+0xcc` and `+0xcd`. It
normalizes every hour below `06:00` by adding 24 before comparison, which is
how other D000 callers express overnight windows.

```text
tools/evidence/d000-tko-state-machine.json
```

This closes the earlier ambiguity over whether these variants should change
when clicked: they are driven by Shenmue story state and game time. `/play`
has an authoritative shared game clock, but therefore keeps the captured
initial state until it has authoritative values for those two scene variables.

## Interaction completeness boundary

`tools/worlds/build_d000_interaction_coverage.js` audits every final placement rather
than treating a loaded model or generic click handler as proof of faithful
behavior. Its report is:

```text
tools/evidence/d000-interaction-coverage.json
```

Current operation-level accounting is:

```text
154 total placed objects
154 have an intentional browser classification
135 have exact native/no-interaction semantics accounted for
 19 retain an explicit native-semantics gap
```

Eleven gameplay-fixture instances now invoke source-native MOTN rather than
the generic inspection pose:

- `TBK1` uses D000's take/look/return telephone-book sequence. The browser
  also reproduces its two native FIXO states: the closed `DENS501G` book is
  attached to AKIR model-control 18/runtime matrix 36 using the exact MAPINFO
  local transform, then the opened `DENS502G` book is attached to model-control
  12/runtime matrix 30. Both are detached/restored at the script-backed phase
  boundaries; no hand offset was visually fitted. Its owning AUTH timeline
  independently selects `M_01TE` sequence 24 and exact frames 18 through 925;
- `GCH0`, `GCH3`, and their two `GBX` child components use
  `AKI_ASOBU_GATYA` from `M_GACH.MOTN`;
- all five `VM_0`/`VM_1` placements use D000's no-money pocket check.
- `TEL0` uses the original telephone take/idle/return phases already recovered
  from `MOTION.BIN`.

No Dobuita fixture now uses the local inspection fallback. `WAGK` is a
state-dependent passive prop owned by the recovered nighttime cutscene
controller; the cutscene trigger and Ryo/camera staging remain outside the
current browser implementation. `HDCA` is fixed passive scenery: its transform
is identical in all three captures, its model
has only a root render route, it has no direct HMDL transforms, and its only
literal-tag call is one setup operation. `DAMY` is now treated as
the non-rendered, non-interactive scene anchor established by its 3 cm
root-only model and three runtime states; its downstream gameplay consumer
remains unknown. The remaining gaps are WAGK's owning cutscene, those two passive objects'
unproven external consumers, the
interactions whose remaining camera/audio, inventory/payment, or result-state
effects are not decoded,
two state-dependent `TKOM`/`TKON` fixtures, and three traffic
actors whose native state triggers are incomplete. All 15 paired-door
placements have their native node-7/node-12 side-selection route. This
distinction prevents placement and model-route success from being reported as
completion of original gameplay behavior.

The `DAMY` classification is reproduced by:

```text
tools/evidence/d000-passive-anchor.json
tools/evidence/d000-static-fixtures.json
tools/evidence/d000-phone-book-interaction.json
```

## Complete logical-door mapping

D000 does not attach a callback to each visible door TASK. It creates ten
reusable nearby handles named `dor0` through `dor9`, then stores a logical door
selector in a parallel table. The room context recovered from RAM exposes:

| Context field | Purpose |
| --- | --- |
| `+0x144` | 65 logical records, 13 words each |
| `+0x148` | logical-record entry to static-placement index map |
| `+0x18c + slot*4` | selector for streamed `dorN` slot |
| `+0x22c + slot*4` | generated `dorN` tag |

The immutable identity word of logical record `N` is also present in
`MAPINFO.BIN` at `0xa776c + N*52`. It indexes the u32 table at `0xa84d4`.
That result is a record in the 120-entry static door placement table.

Nineteen selectors point to a type-1 doorway/collision proxy. Each is followed
by its adjacent type-2 visible door leaf. Normalizing those pairs produces a
bijection:

```text
65 logical selectors
65 unique visible type-2 records
65 total type-2 records in MAPINFO
19 selectors routed through an invisible type-1 proxy
```

`tools/worlds/extract_d000_door_logic.py` performs and validates this join. The
generated `tools/evidence/d000-door-logic.json` includes all selectors, models,
transforms, source words, and runtime-populated words. Sixteen independent RAM
captures streamed 40 of the doors through the ten `dorN` slots; all 40 agree
with the offline mapping and there are zero selector conflicts.

The runtime record flags are not uniform: 49 records use `0x0002`, nine use
`0x0120`, four use `0x0122`, two use `0x01a0`, and one uses `0x0000`. Native
code at source `0x28770` reads the selector's 13-word record and tests at least
bits `0x0100` and `0x0020`. It then routes generic HMDL operation `0x00c9` to
specific child-node keys including `5`, `8`, `10`, and `13`. Main door leaves
are node `12` for a single/left leaf and node `7` for a paired right leaf.

The main-leaf state machine is also localized at source `0x27000`–`0x273e6`.
It converts degree results to Dreamcast fixed turns using
`angle / 360 * 65536`, and sends them to node `12` and, when present, node
`7`. Separate state branches source the two leaves from different local angle
fields (`+88`, `+92`, and `+96`), so paired leaves can move in opposite
directions. These facts prove that applying one root-level rotation to every
model would be incorrect.

An active interpreter recording now supplies the first exact operation:

```text
selector          25
static door       22
model             S1_D000_DR13_010.MT5
moving route      child node 12
start             0 fixed turns
endpoint          -16679 fixed turns (-91.620483 degrees)
distinct updates  52
other routes      unchanged
```

`captures/objects/object-once-1784883671.csv` is the raw 420-frame RAM
recording. Interpreter host frames repeat game state, so
`tools/worlds/extract_d000_door_curve.py` retains the 53 distinct values (closed pose
plus 52 updates). The resulting native curve is replayed in the browser at the
game's 30 Hz update rate, including its non-linear pause and acceleration.
This active evidence supersedes the earlier passive inference that every
main-leaf transition lasts 20 ticks.

The operation itself was then captured at the SH-4 dispatcher boundary, not
inferred from the changed HMDL memory. `tools/worlds/extract_d000_door_call_trace.py`
reduces that trace to five exact `dor0` operations:

```text
0x0c3e5456  node 12  mode 2  read rotation
0x0c3e548c  node  7  mode 2  read rotation
0x0c3e5502  node 12  mode 2  read position
0x0c3e5fe6  node 12  mode 2  read rotation (52 updates)
0x0c3e70da  node 12  mode 0  set rotation (105 calls)
```

The mode-0 descriptor at `0x0c3e70da` contains the exact Y-turn value sent to
the engine. Its first 52 changing values reproduce the independently recorded
HMDL curve bit-for-bit and then remain at `-16679` for 35 calls. This proves
the selected child route, axis, operation mode, samples, and endpoint through
two independent observations. The reduced trace is preserved at
`tools/evidence/d000-selector-53-door-call-trace.json`. The original
working note labeled this selector 25, but the captured Ryo position is next
to selector 53 / static door 0 (`DR01_011`); the corrected evidence now
records that authoritative spatial match.

`tools/worlds/audit_d000_door_models.js` then loads every distinct visible door
through the production MT5 loader. All 34 distinct models used by the 65
logical doors contain the native primary child route, node 12; there are zero
missing-route failures. Fourteen models additionally contain paired node 7.

The native caller and branch are now statically verified in
`tools/evidence/d000-door-node-route.json`. Its `0xdc` value is the fifth
incoming stack word, populated with the actor/door relative-heading quadrant.
Values 2/3 select node 12 at file offset `0x2199a`; values 0/1 select node 7
at `0x219e2`. The capture places Ryo at door-local positive Z and observes
node 12. The browser therefore selects node 12 for nonnegative local Z and
node 7 for negative local Z when both leaves exist, while single-leaf models
continue to use their only node-12 route. The fixed-turn sign is reflected
with the same side test so the leaf opens away from Ryo.

## Remaining interaction boundary

Every visible door now has an exact logical selector, model, transform, and
verified primary node-12 interaction. Selector 53 supplies the exact shared
transition curve and endpoint through independent HMDL-memory and SH-4-call
traces. Fourteen paired-leaf models also expose node 7 and now use the exact
native side-dependent route recovered statically. Area transitions remain
outside the browser object's local animation.

## Capsule-toy machine setup and interaction model

D000 does not store its two active capsule machines as unrelated literal
placements. Native code indexes three parallel six-entry tag tables:
`GCH0..GCH5`, `HGC0..HGC5`, and `GBX0..GBX5`. A corresponding six-entry,
20-byte record table has only records 0 and 3 populated. They contain the
exact source positions `(24.5, 0, 32.16)` and `(23.75, 0, 32.16)`, yaw
`0x8000`, and `CCOW` selector bytes 4 and 2. The setup routine instantiates and
places each `GCH`, enables it, writes that selector byte, creates its `GBX`,
and associates the pair.

The interaction separately loads resource `HI_GACH`. Its exact
`GAT0G00G`/`GAT0G03G` models have the same machine bounds as the street LODs
plus native render nodes 152 and 153. `/play` now replaces only the selected
machine body with the matching high-detail model while
`AKI_ASOBU_GATYA` from `M_GACH` runs; the owned capsule box remains in its
native placement. `tools/evidence/d000-gacha-interaction.json` verifies the
tables, calls, handler routes, model hashes, and motion.

The prize catalog is no longer opaque. Function `0x4f978` selects one of
sixteen exact model-token lists, while `0x4fe10` maps a category and zero-based
item index to the corresponding 16-bit collectible lookup value. The byte
table at file offset `0xabd4c` is proved to be the sixteen pool lengths because
each value exactly matches the number of entries consumed by that category's
lookup branch. Category 10 deliberately contains a zero lookup entry, so these
are counted fields rather than zero-terminated arrays. The neighboring table
at `0xabd5c` participates in the random split at `0x57330`; it remains
deliberately unnamed until that comparison's meaning is proved.

The physical-machine link is also direct: operation `0x0024` reads the active
machine's `CCOW` selector at `0x56ef2` into category state, and the result
presenter at `0x57b3c` receives that state along with the selected item index.
The debit routine at `0x55288` reads currency selector 2, subtracts exactly
100, and writes selector 2 back. This is the same balance field independently
identified by the vending affordability and `MONEY_LOCK` paths. The exact
random primitives are also known from their live engine handlers: operation
`0x0009`, mode 16, returns the shared RNG result multiplied by a float bound;
operation `0x004f`, mode 6, truncates that RNG result multiplied by an
exclusive integer bound. The room branches at exact one-third, two-thirds,
and one-third constants. How those branches combine the neighboring split
table with collection state is not yet fully proved. Browser economy,
collection state, and result presentation remain explicitly unresolved.

The native collection mutation itself is proved. After `0x4fe10` resolves the
selected category/index to a 16-bit lookup value, operation `0x003d` receives
that value with quantity 1 at `0x56e82`. Its mode-0 handler calls
`0x0c0e38b6`; the duplicate-avoidance checks use operation `0x003f`, whose
mode-0 handler calls the paired getter at `0x0c0e38be`. The remaining work is
to reproduce the exact policy that chooses an index and then expose equivalent
browser-side balance and collection persistence.

## Vending-machine AUTH timelines

The seven `DJHN/SEQDATA1.AUTH` through `SEQDATA7.AUTH` files contain native
`ASEQ` motion records for Ryo (`AKIR`) and the second actor (`YKHI`). Each
`0x0503` record stores the actor tag, a one-based reference into
`M_01JUCE.MOTN`, and exact start/end frame indices. The terminal indices agree
with the referenced MOTN durations, which independently establishes both the
index convention and the frame unit. Some records deliberately clip or
overlap a longer motion, so concatenating whole named animations would not
reproduce the authored interaction.

The same room routine enables `CAN1`, attaches it to model-control 18 on
`AKIR` or `YKHI`, and detaches it between phases. The exact calls and all 21
AUTH motion events are recorded in
`tools/evidence/d000-vending-interaction.json`. The browser currently retains
the source-native no-money fallback rather than pretending that one of these
two-actor story branches is the generic solo vending interaction. Camera
staging, branch selection, can-attachment timing, and purchase/inventory state
remain explicit gaps.

The vending module also proves the price path without naming a mystery global
from intuition. It reads global-state selector 2, compares the value with 99,
subtracts exactly 100 before writing it back, and has a symmetric 100-unit
refund routine. The adjacent native diagnostic calls the failed exit
`MONEY_LOCK`, independently identifying selector 2 as the currency balance.
