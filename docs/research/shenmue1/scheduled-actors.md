# Scheduled actors: native extraction and behavior

This document owns the recovered schedule/controller evidence. For browser
loading and lifecycle, use [Scheduled NPCs](../../implementation/scheduled-npcs.md).
Coverage figures below describe the cited extraction snapshots, not a promise
that every NPC behavior is playable.

## Scheduled-actor extraction and native behavior

Scheduled NPCs, animals, and moving props are a separate system from ordinary
placed objects. This section records native formats, extraction evidence, and
reverse-engineering findings. Current server/client ownership, generated-data
flow, persistence, obstruction, and operational checks belong in the canonical
[scheduled-NPC guide](../../implementation/scheduled-npcs.md).

For supported Shenmue I multiplayer worlds, the standalone Go server publishes
actors and the browser renders and projects its authoritative state. Shenmue II
crowd shards currently reuse the browser presentation runtime but evaluate
their recovered `nativeSchedule` locally; they are not yet part of the Go NPC
engine.

A schedule program contains timetable entries of the form
`(seconds_since_midnight, descriptor_pointer)`, terminated by `0xffffffff`.
Descriptor operation 8 selects an area. Every operation 1 uses the same native
movement handler and contains a movement-mode value, point count, and route
array pointer; `0x8016` is one of 24 observed modes, not a distinct opcode.
Route positions use the same Dreamcast-to-browser conversion `[-x, y, z]`.

The JU00 RAM capture originally confirmed nine programs. Generalized source
extraction now maps all 219 independently identifiable scheduled NPC/animal
actor codes to identities and HUMANS models. Another 23 source codes are
losslessly retained as crowd, bus, or door controllers rather than being
misrepresented as individual characters. The otherwise missing `ISYM` mapping
is independently established by HUMANS entry 275, whose model package contains
paired `ISYM.BIN` and `SHY_L.CHRM` resources for Rena Isayama.

`tools/actors/build_browser_scheduled_actor_manifest.js` retains 226 mapped source
program variants, 412 selector-backed timetable variants, 1,215 entries, 1,560
authored route segments, and 38,626 points. Playback selects a relocated RAM
table where one was observed, while preserving every mutually exclusive source
table. The currently selected tables contain 780 entries and 1,230 routes; 13
programs with no matching RAM capture use the native selector-mode-1 table as
an explicitly labeled fallback. Distinct D000 and MFSY programs for shared
actor codes are scoped to their pre-harbor or harbor browser worlds so they
cannot create duplicates.

`tools/actors/build_scheduled_actor_assets.js` pairs each exact HUMANS CHRM child with
the PAKF texture entry immediately before its PAKS model entry. Duplicate
archive candidates are accepted only when their extracted bytes match. All 219
identity model/texture pairs and the operation-`0x2f` `FUB_M` override
instantiate under `Mt5Loader` with no missing named textures; detached mouth
variants are suppressed.

The generated Go interpreter evaluates native operation-3 static positions and
fixed-point facing, operation-7 waits, operation-8 area changes, and
operation-1 movement. The browser receives the evaluated operation, route,
position, and presentation state and projects movement between corrections.
Native route timing converts the proven path step per 30 Hz controller update
into schedule speed using the normalized day length. `FUN_0c12751a` squares
the current movement step only when comparing it with the distance to the next
waypoint; it does not accumulate squared segment lengths as route progress.
Authoritative playback therefore advances at constant arc-length speed across
the authored polyline,
including residual scheduler time after a completed route. An operation-1
descriptor may inherit the actor area from
the preceding timetable entry; preserving that native field exposes 214 routes
that were previously rejected despite containing finite XYZ arrays. Operations
`0`, `4`, and `0x12` stop descriptor traversal while retaining the last proven
transform; operations `0x05` and `0x13` clear an actor operation field, not its
world position.

Operation `0x35` supplies the motion installed when an operation-1 route
finishes. The dispatcher stores its operand at actor `+0x1c0`; operation-1
resolves it into actor `+0xf4` and copies that halfword to current motion
`+0x06` at route completion. Thirty-seven nonzero records resolve to eight
exact M_MOBJ motions and bind to 47 routes. A zero operand invokes the shared
native PRNG modulo four and selects an actor-definition halfword at
`+0x7e/+0x80/+0x82/+0x84`. The actor-definition pointer is actor `+0x00`.
Enumerating the executable-backed resident actor array in 476 unique RAM
captures yielded 38,780 observations and 249 four-character actor codes.
Every actor code had exactly one byte-stable four-choice table; all 904
nonzero candidates resolve to named M_MOBJ sequences. The browser packages
the exact domains. It only installs one without the process-wide PRNG when
all four entries are identical, because an independent local random choice
would not reproduce the game's call-order-dependent stream.

Operation `0x30` drives the actor action-controller lifecycle. Handler
`0x0c11f026` stores operand one at actor `+0xf0`, retains the exact operation
pointer at `+0xec`, requests fixed controller mode 7 through `0x0c10d77c`, and
sets the actor request flag at `+0x18d`; a zero action ID dispatches teardown
through `0x0c11efd2`. The source corpus contains 128 exact occurrences: 67
installs, 61 teardowns, and five distinct nonzero IDs across 27 actor codes.
Existing captures provide 504 nonzero requests, all of which join one exact
source operation by resident normalized program hash, unique owner actor,
action ID, and operation pointer. The browser reproduces install/teardown state
and the native request initializer at `0x0c10d7f6` passes each nonzero ID to
registered-motion lookup `0x0c092f14`. Actor `+0x18d` is one in all 504, proving
that these are queued requests. Actor `+0x6c` is legitimately null in 480
observations; the evidence reader now rejects null instead of interpreting RAM
offset zero as a controller record. The other 24 retain numeric controller
snapshots—19 at state `0x8176`, four at `0x8177`, and one not yet
initialized. Thus operation `0x30` is a queued mode-7 registered-motion
command. Its five IDs name the `OTH`, `PNW`, `SIN`, `SYP`, and `YKI`
`KASA_UDE_MONOMOTI_LP_F` umbrella-carrying loops in `M_MOBJ`; the browser
selects those exact authored clips and clears them on the authored zero.

Operation `0x19` is a second, distinct motion-controller request path; it is
not an object/prop attachment as its first four bytes initially suggested.
Dispatcher handler `0x0c11f804` tears down the previous request, stores operand
one at actor `+0xf0`, and passes that value plus the following controls to
controller request `0x0c10d77c` through actor controller pointer `+0x6c`.
Operand one is a registered motion-state value: zero tears the request down,
while nonzero values resolve through the same process-wide motion ranges used
by other scheduler motion states. The browser retains all four trailing
controls, includes every nonzero request in the generated MOTN manifest, and
clears the active motion when the authored zero record executes. This closes a
notable animation gap in Fukuhara's evening sweeping descriptor: its repeated
`0x82f3` requests and zero teardowns are now reproduced rather than mistaken
for malformed four-character object codes.

Operation `0x2b` changes the actor's resident character selection without
changing its transform. The dispatcher calls `0x0c1147ec`, which linearly
searches the current four-character table and writes its zero-based result to
actor `+0x08`. The six source occurrences select `MIK2`, `NOR2`, `TJM2`, or
`YUM2` for four Dobuita actors. The character-table pointer is derived from
the executable literal at `0x0c1148bc`, not a capture-specific address. All
four codes resolve identically in one 369-entry table across 475 valid unique
captures, at indices 203, 237, 310, and 366 respectively. One transient
capture contains an invalid table count and remains an explicit error. The
browser retains the proven code/index but does not claim an alternate HUMANS
model mapping.

Operation `0x2f` controls a genuine actor model override. Handler
`0x0c11acd8` accepts a NUL-terminated name shorter than 12 bytes, copies it to
actor `+0x18e`, and refreshes the live model through actor `+0x8c`. A zero
fourth operand then overwrites the first character with the executable-derived
empty byte at `0x0c277200`; a nonzero operand leaves the override resident.
All 16 source occurrences belong to Fukuhara: six persist `FUB_M`, while ten
refresh `FUK_M` and clear the override. Structural owner-pointer discovery
finds 227 Fukuhara actor observations with no resolution errors. One capture
at exact scheduler second 60,939 (`16:55:39`) retains `FUB_M`, a live model
pointer, and character-table index 105; the other 226 have empty override
buffers, and all 227 observe the executable empty byte as zero. The browser
packages the exact HUMANS `FUB_M` child and texture pack, carries persistent
selection across timetable entries, and swaps between the two models at the
proven descriptor activation times.

Operation `0x16` honors its proven 300-second/absolute-time gate. Its compact
subordinate stream is decoded with exact native widths and terminator
boundaries: the 255 unique source programs contain 116 such operations, 595
records, and 123 local object-transform records. World placement comes from
two `MCIR` graphs containing 37 roots and 513 route points. Every observed
target code resolves to exactly one root. The group predicate at `0x0c1274a4`
is an unconditional `return 1`, proving that selection scans serialized leaves
and takes the first free one. Position handler `0x0c126ec2` then uses the final
point of that leaf's second route.

The interpreter at `0x0c1264e4` also fixes the execution phase and handler for
every nested opcode. Operations `0x02`, `0x07`, `0x10`, `0x11`, and `0x1a`
execute only in controller state 5; `0x2d` executes in state 4 and `0x2e` in
state 6. `0x02` calls actor motion-state selector `0x0c11f7a0` with its signed
16-bit state ID and a zero update flag. `0x07` stores
`schedulerSecond + durationSeconds` at actor `+0x78`. Operations `0x10` and
`0x2d` call local-transform registration `0x0c11d1de`, while `0x11` and
`0x2e` call registered-object transition `0x0c11d2b6`. Operation `0x1a`
passes its motion state and two controls to `0x0c11f8dc`. The manifest retains
all of those distinctions and the authored numeric payloads; mapping the
remaining motion IDs to named animations is still open.

The actor-local object renderer is also recovered as a generic engine path.
Registration `0x0c11d1de` allocates a 56-byte record on the actor's `+0x94`
list. Resolver `0x0c11d3a8` looks up the serialized four-character location
code in the current scene registry and retains that object's render pointer.
Placement mapper `0x0c11d960` maps modes 0–9 to controller nodes
12, 18, 12, 18, 5, 9, 15, 7, 13, and 2; modes 10 and 11 select the actor
controller transform and actor world transform. Matrix routine `0x0c11d6fa`
composes that target with the record's local position and three fixed-turn
controls, and `0x0c11d53c` renders the object while applying the state/fade
timer. Operation `0x11` changes the matching record to state 3 with a
30-frame timer.

Those controller-node values are types, not universal array indices or MT5
render keys. Resolver `0x0c1140e6` obtains the actor's `MOMT` controller
array, then `0x0c092ea0` scans 72-byte records until the byte at record
`+0x00` matches the requested type. The returned parent matrix is the
64-byte matrix beginning at record `+0x44`. This distinction matters because
the 21 native controller families permute those types: for example type 12
is matrix 30 in family 0 but matrix 36 in family 4. The browser therefore
routes every ordinary placement mode `0..9` through the actor CHRM's exact
controller family. It retains the complete evaluated controller matrix array
as well as MT5 render routes, so attachment-only controller types 7 and 13
do not require an invented Ryo render-key mapping.

Mode 11's special branch is also reproduced. The native routine constructs
the actor world matrix from actor position at `+0x1ac` and facing at `+0x50`.
The browser's scheduled-actor parent is already placed from those authored
position/facing values, so mode-11 local objects compose against identity in
actor-local space and inherit that exact world parent. All five authored
mode-11 records are FUKU records whose preceding scheduler position remains
static while the attachment is active, so this equivalence covers the
complete extracted corpus rather than assuming that action position always
equals current position.

Mode 10's distinct branch is reproduced separately. Relocation-aware
disassembly of `0x0c11d6fa` shows that it dereferences the controller at actor
`+0x6c`, creates an identity matrix with translation from controller
`+0x150`, applies rotations from `+0x190`, `+0x18c`, and `+0x194` in that
native order, and finalizes the matrix. Independent live captures for TKNB
and KNJI show controller `+0x150` tracking current actor position within
`0.0411` world units while actor action position `+0x1ac` is more than
`12.27` units away. The browser scheduled-actor root is the corresponding
live controller transform, so all 64 mode-10 records compose against its
actor-local identity parent without being conflated with mode 11. The full
instruction and capture evidence is retained in
`tools/evidence/scheduled-actor-controller-transform-evidence.json`.

For Fukuhara's sweeping sequence, both the JOMO and JHD0 runtime placement
registries independently resolve `ITEM`/`SO01` to `HOUS501G.MT5`. That model
has a single render hierarchy root, eliminating any remaining internal
subtree choice. The authored record selects controller node 12 and carries
local position `(0.43519, -0.85081, 0.48438)` plus fixed-turn controls
`(4733, 31675, 3822)`. This identifies the exact prop and attachment rule;
the browser now renders it through the same generic local-object path used by
every schedule registration rather than a Fukuhara-specific rule.

`play/data/scheduledActorLocalObjectModels.js` retains the
source-backed scene-tag-to-model resolutions recovered from the tagged
Dreamcast scene registries. At world load, `/play` loads one hidden template
for every resolved model required by the active schedule shard. Each actor
receives a recursively cloned instance that shares immutable geometry and
materials with that template, so two actors may use the same prop type at the
same time without moving or taking ownership of a map-scenery instance.
Operation `0x10` attaches that instance using the exact controller-family,
placement-mode, and local-transform rules above; operation `0x11` releases
and hides it. A registration without a source-backed model resolution is
deliberately left unresolved rather than guessed. The older placed-scene
lookup remains only as a fallback when the current scene itself supplies an
exact matching tagged object.

`tools/actors/extract_scheduled_actor_subordinate_evidence.js` now validates that
interpreter model against live state. It scans all 476 unique captures and
accepts an actor only when source pointer `+0x118` identifies one exact
operation and next-operation pointer `+0x64` identifies its exact end. This
produces 1,376 observations across 249 captures with zero unmatched or
ambiguous source joins. Controller state `+0x110` is state 5 in 1,363
observations; the remaining records are five state-1 and eight state-10
transitions. Current nested opcode `+0xa8` and cursor `+0x1dc` resolve to an
exact authored record boundary in 1,192 cases, always with the cursor
immediately after the current record. Of those, 809 are operation-`0x07`
waits. Their absolute deadlines at actor `+0x78` are retained alongside the
structurally discovered scheduler second.

This also separates two clocks that initially looked similar. Gate
`0x0c11a952` anchors its negative operand to the timetable entry start:
`journeyStartSecond - operand`. Initializer `0x0c126cca` runs later and stores
`schedulerSecondAtInitialization - operand` at actor `+0x114`. The latter is
live controller state, not a replacement for the descriptor gate formula.
The browser therefore preserves the proven gate calculation. For 34 exact
source/map operations whose captured allocation is deterministic, it now
places the actor at the claimed MCIR leaf while the gate waits, including the
leaf's fixed-point facing, and keeps that waiting placement separate from the
final second-route endpoint. The nested stream remains visible as exact
metadata where its intermediate motion duration is not yet proven.

The selected leaf usually does not matter to world placement. The offline MCIR
extractor compares the exact float words of every leaf endpoint: 35 of 37 roots
have one endpoint across all their leaves. Those roots cover 113 of the 116
browser operations—36 operations target a single-leaf root and 77 target a
multi-leaf root whose final endpoint is invariant. Only roots `HDG1` and
`FBEA` have more than one final endpoint, and no extracted scheduled operation
targets `HDG1`.

Root lookup is global, not scoped to the CYCLEMAN file neighboring a source
program. `0x0c127302` receives the global resident MCIR directory and the
four-byte target code. Both exact graphs coexist in reviewed MFSY captures,
and their 37 target codes are disjoint. Following that lookup connects seven
cross-table operations that the earlier per-program table restriction left
unresolved.

Runtime occupancy closes a further part of that gap without replay guesses.
`tools/actors/extract_scheduled_actor_mcir_occupancy_evidence.js` scans all 499
inventory entries once per unique hash (476 unique captures), matches resident
`ISU_0.25` graphs to the two exact offline MCIR header shapes, and reads the
native occupying actor code at leaf `+0x10`. All 476 unique captures contain a
matched graph; 488 graph observations yield 1,417 occupied-leaf observations
and 41 actor/target bindings. Runtime leaf positions match their offline
records exactly, and every serialized leaf belongs to one target root.

Thirty-six actor/target bindings use one leaf in every reviewed capture; five
bindings explicitly vary across multiple leaves and remain dynamic. The
extractor now goes beyond that coarse actor/target identity. For each occupied
leaf it structurally finds the owning runtime actor record, requires current
operation field `+0x04` to be `0x16`, and requires saved next-operation pointer
`+0x64` to equal the end of the exact extracted operation that targets the
occupied root. This produces 1,368 exact active-operation owner observations,
zero ambiguous observations, and 49 unmatched or stale observations.

Grouping those joins by normalized source-program hash and operation offset
produces 45 exact-operation bindings: 40 use one captured leaf and five retain
multiple leaves. Endpoint invariance is stronger than these population-specific
observations and now supplies most browser placements. The two observed
operations on non-invariant root `FBEA` retain exact-operation evidence:
`SKRD` selects leaf 2 and `ITOH` selects leaf 3. Together with the 113
allocation-independent operations and the source-wide first-claim proof below,
all 116 browser placements are implemented.

This corrects an earlier 58/116 result. That result joined only actor code,
target code, and sometimes program/map, so an observation for one `0x16`
occurrence could be reused for a different occurrence in the same source
program. Normalized source hash and operation offset are now mandatory; nine
unsupported placements, including `SATO` at 00:00, were removed.

The five varying bindings are not random allocator choices. The native free
lookup at `0x0c12733a` performs a first-free scan in serialized
root/group/leaf order. Grouping the 488 graph observations by exact resident
scheduled-program set plus inferred disc/area produces 24 map-residency
cohorts and 174 cohort-local actor/target bindings. All 174 use exactly one
leaf within their cohort, including both observed choices for `ECHO:BYO2`,
`MTRI:BYO2`, `YJIH:DGCT`, `SATO:MAJ1`, and `YOHI:MAJ1`. This proves that the
changes track population/map residency and occupancy history. Source-program
disambiguation produces 125 map/program bindings: 122 have one leaf, while
the three JHD0 `YJIH`, `SATO`, and `YOHI` bindings explicitly retain both
story-dependent leaves. The exact active-operation/map join has 123 bindings:
120 have one captured leaf and three retain multiple leaves. These population
joins remain valuable validation evidence even where equivalent endpoints make
their leaf differences irrelevant to placement.

`TATM`'s 10:40 `FBEA` operation is not present in the capture corpus, but it is
resolved without borrowing `SKRD`'s or `ITOH`'s leaf. Every `FBEA` leaf has a
null initial occupant in the exact offline MCIR graph, and graph cleanup at
`0x0c126232` writes zero to every leaf occupant field. An exhaustive census of
all 255 unique source programs finds exactly three operations targeting
`FBEA`. Native descriptor traversal reaches `TATM`'s operation at game second
39587.229567597424 (10:59:47.229), and its gate releases at second 44100
(12:15). Neither of the other claimant journeys can begin before second 57000
(15:50), and all claims release before the end of the game day. The native
first-free scan must therefore choose serialized leaf 2. Its second route ends
at runtime float words `c1b98bc2000000001f25b142`, or browser position
`[69.86280059814453, 0, 88.57250213623047]`. This source-wide proof closes the
operation-`0x16` placement inventory at 116/116.

The executable establishes the lifetime of these observations. Dispatcher
`0x0c119444` reaches the operation-`0x16` time gate at `0x0c11a952`.
Initialization handler `0x0c126cca` claims the first free leaf while the gate
waits by writing the actor code at leaf `+0x10`. When the gate opens, position
handler `0x0c126ec2` clears every occupancy for that actor, reruns the first-free
selection, and uses the chosen leaf's second-route endpoint. Thus the capture
corpus directly proves waiting-state allocations. Applying the final handler
to each captured population produces an exact reselected leaf for all 1,368
active-owner observations. Two deterministic bindings differ from their
waiting claim: `YOSI:MKYU` moves from leaf 19 to 18, and `MIKI:DPIZ` moves from
leaf 30 to 28. The browser now uses the reselected endpoints and retains the
waiting leaf indices. It additionally renders 34 deterministic captured
waiting leaves before release; population-dependent waiting allocations such
as `YOHI:MAJ1` remain explicit instead of being collapsed. This proves the
final choice for the captured population; it does not prove that population
remained unchanged until an unobserved gate opening.

Each PRG1 program owns a 16-slot timetable pointer table at relocation-base
offset `0xbc` and zero or more 16-byte override conditions. The native selector
at `0x0c11a5ec` starts from a normalized base mode, then tests required-set and
required-clear story flags, month/day bounds, and an optional required base
mode before choosing an override slot. The extractor and browser retain these
conditions verbatim. An immediate `0xffffffff` is a valid empty timetable:
NGSM uses one to become absent under matching story flags. Runtime data retains
all mapped variants. The server temporarily selects native base mode 1 with an
empty global story-flag state; MMO adaptation must convert native predicates
into reviewed narrative policy rather than feed personal flags into shared NPC
simulation.

`tools/actors/audit_scheduled_actor_timelines.js` samples all 234 mapped program
instances and all 431 selector variants every five minutes and at journey,
wait, and operation-`0x16` boundaries. It finds no non-finite runtime state.
428 variants and all 234 program instances produce finite states. Twenty-four
variants use the map-residency secondary-route controller during at least one
sampled active phase.

Operation `0x24` is dispatched through `0x0c12b9a0`. Its active linked-object
record is stored at actor offset `0x98`; the linked XYZ/facing fields are at
offsets `0x1c`/`0x44`, while actor XYZ/facing are at `0x24`/`0x50`.
`tools/actors/extract_scheduled_actor_attachment_evidence.js` discovers actor records
from their relocated PRG1 owner pointers rather than fixed RAM addresses. It
finds 284 owner-matched active attachments across 249 relevant captures, and
all 284 copy XYZ and facing bit-for-bit. This proves attachment placement for
forklifts, bicycles, and several cabinet props. It also recovers exact enabled
forklift placements for `FLD7` and `FLDF`.

Operation `0x1c`, reached through the operation-`0x20` linked-object stream,
is initialized by `0x0c128a2e`. Its operands contain an object code, point
count, and relocated array of runtime XZ pairs; `0x0c12ac2e` synchronizes the
moving object back to the actor. The initializer installs the relocated route
pointer and point count at actor offsets `0x5c`/`0x60`, and stores
`pathControlFloat * 0.0092592584` at `0x140` for positive controls. The
multiplier is loaded directly from executable literal `0x0c1290f0`; for the
forklifts, the authored `20` therefore becomes the observed
single-precision value `0.1851851642`. A negative control instead calls
`0x0c12ab92`, which selects one of five movement steps from a table chosen by
the attached-object code; `-10`, `-20`, `-21`, `-22`, and `-30` select
indices zero through four. All 65 negative source records use `-20` with
`FK01` or `FK02`. The `FK0` table at `0x0c2778a4` contains
`0.1851851642` at index one, bit-identical to the positive-`20` calculation.
Together with the 49 positive records, every one of the 114 source routes
therefore has an executable-backed finite per-update step.
The linked-object interpreter at `0x0c117240` executes and persists exactly one
opcode per actor update. The four forklift controllers therefore revisit each
of their two route operations once per five-opcode loop.

Existing RAM supplies a second independent check: 56 active attachment
observations retain a route array that matches an offline operation-`0x1c` XZ
array word-for-word. Every active `FLD6`, `FLDB`, `FLDE`, and `FLDG`
observation is among those matches. Their live route counts and target indices
are also present at actor `+0x60/+0x62`; the reviewed observations include
`155/25`, `102/42`, `40/23`, `40/32`, and `28/8`. The live `+0x140` value is
`0.1851851642` in every reviewed dynamic forklift record, exactly matching
the initializer's single-precision `20 * 0.0092592584` calculation.

The downstream preparation function at `0x0c127a9a` copies `+0x140` into the
per-update path-step field at actor `+0x58`; route target selection and
advancement occur in `0x0c12751a`. The evidence tool now also reads the
adjacent `+0x168` prior-update position vector. In all 56 source-array-matched
observations, the three-dimensional displacement from that vector to current
actor XYZ matches `+0x58` within `0.00001` world unit. This numerically proves
the spatial step and target direction for every reviewed forklift update.
`stepSecondaryRoute()` implements that one-update rule and reproduces all 56
capture positions from the prior position, indexed offline waypoint, and live
step within the same tolerance. The same native helper advances across
waypoints already within one step and, at the final waypoint, snaps to the
authored endpoint and reports completion; the browser primitive preserves
that behavior. The exact number of native updates since map residency remains
the blocker for clock-driven playback.

The scheduler driver calls `0x0c114856`, which returns exact seconds since
midnight, and caches the result through the pointer embedded in its literal
pool at `0x0c115b08`. The attachment evidence tool searches each capture for
that reviewed `1ST_READ.BIN` literal signature and follows its resident
pointer, rather than adding a capture-specific RAM address. All 249 relevant
captures yield an in-range clock. In particular, the two dynamic-forklift
captures are exactly `08:48:50` and `12:01:37`.

Those exact clocks also rule out a simple “distance since timetable start”
phase. The generated report hashes each source route's exact XZ words and
groups owners only when object code, target index, frame step, current XYZ,
and prior XYZ all agree. It finds five groups representing two unique runtime
states, and every group contains different timetable starts. At `08:48:50`,
`FLDB` and `FLDG` have identical FK01 route state despite `08:30` and `08:41`
starts. At `12:01:37`, `FLD8`, `FLDB`, and `FLDG` are bit-identical despite
starts at `08:50`, `08:30`, and `08:41`, a 20-minute span. Route phase
therefore includes shared-object/map-residency state and cannot be derived
from the actor's timetable start alone.

All 114 mapped operation-`0x1c` occurrences retain their 12,871 points across
42 distinct arrays. Browser playback now treats these as map-residency
controllers, matching the capture evidence instead of deriving phase from
the timetable clock. Initialization preserves an existing shared-object
position within ten XZ units of the first target and otherwise snaps to that
first point, directly matching the `100.0` squared-distance branch in
`0x0c12b138`. The controller then advances the proven path step at the game's
30 Hz update rate. It preserves position between paired routes and accounts
for the intervening `0x24` operation and the wrapping `0x04` operation as
separate actor updates. Both signed source modes are retained in the manifest,
and the 65 negative-selector routes are no longer discarded. This supplies
finite moving states for `FLD6`, `FLDB`, `FLDE`, and `FLDG` without
substituting a static capture position.

### Native scheduled-actor animation

The browser now uses authored scheduled-actor MOTN sequences rather than a
procedural gait or a substituted Ryo walk. The native registered banks cover
all currently decoded route and state paths:

- Operation `0x01` handler `0x0c11f948` copies its route operand at
  descriptor `+0x04` verbatim to actor current-motion `+0x06`. The operand is
  therefore a registered motion state, not a browser-defined movement-family
  selector. All 24 values resolve to exact `MOTION`/`M_MOBJ` sequences.
- The process-wide `MOTION/MOTION.BIN` supplies registered motion IDs
  `0x0001` through `0x0617`.
- `M_MOBJ.BIN` supplies registered motion IDs `0x8001` through `0x8357`.

Operations `0x02` and `0x1a` do **not** select one of those banks. The shared
native lookup `FUN_0c092f14` walks a process-wide linked list of motion-bank
registrations and finds the exclusive range containing the unsigned 16-bit
request. The request IDs are one-based within each registered range, so the
zero-based sequence index is `id - lowerExclusive - 1`.

This was verified with Nozomi standing in Dobuita in save-state slot 9.
Her scheduler held request `0x8192`; the live range
`(0x8000, 0x8358)` selected `M_MOBJ` sequence 401,
`SIN_NOZ_TALK_LP_QTE`. Its family is 15 and its 193 frames explain the
controller's terminal-frame value of 192. At captured controller frame 137,
all 105 native joint-rotation components matched the decoded MOTN sequence
exactly. The browser therefore resolves `0x8192` through the same registry
rather than treating operation `0x02` as an `M_FREE` selector.

The registered low range is not `SCENE/01/FREE/M_FREE.BIN`. A Dobuita runtime
capture proves that state `0x0066` resolves to `MOTION.BIN` sequence 101,
`AKI_AKI_WALK_LP` (37 frames, controller family 0); the same numeric index in
the scene-local `M_FREE.BIN` is `OTH_MAN_BIKESHOP_F_LP_F`. Treating the
scene-local file as the registered bank made ordinary scheduled pedestrians
play that hunched bike-shop pose. `tools/actors/extract_scheduled_actor_operation_one_motion_evidence.js`
therefore reads the same process-wide MOTION asset served to the browser.

That extractor joins the
1,560 route occurrences across 166 actor codes to those registered ranges.
It resolves all 24 distinct values with zero unknowns, including
`0x8016 -> CAT_CAT_WALK_LP`, `0x803c -> DOG_DOG_WALK_LP`, both Goro route
states, and the kimono-walk state. The handler contains no entry/loop/exit
lookup: when the route ends, it independently copies the already recovered
completion state from actor `+0xf4` into current-motion `+0x06`.

`tools/actors/build_scheduled_actor_motion_manifest.mjs` scans all browser schedule
shards and regenerates `play/data/scheduled-actor-motions.json`. The current
manifest packages 4 `MOTION` state mappings, 415 `M_MOBJ` state mappings, and
all 24 exact operation-`0x01` route states. At world load, the runtime parses
only sequences required by that world's actors, and samples a clip lazily on
first use to keep browser memory bounded.

Subtype-1 linked interactions registered by scheduler operation `0x17` carry
their ambient actor motions in the first two 32-bit control values at record
offset `+0x1c`. `FUN_0c0f84b4` advances the global PRNG, reduces it modulo two
through `FUN_0c1dc440`, and indexes those values. The third value at `+0x24`
belongs to the interaction transition rather than the standing idle. The
browser retains both exact authored candidates but deliberately does not pick
between differing candidates, since independent multiplayer clients cannot
reproduce the Dreamcast process's shared PRNG call stream from schedule data
alone. Akihito Anzai's final `MARY`
registration contains `0x80fc` (`OTH_LOOK_PUNF_LP_F`) and `0x80e0`
(`OTH_CHU_MITERU_TOBAKU_LP_F`).

Scheduled placement lives on a parent transform separate from the character
render root, so schedule/world placement remains independent of the native
controller matrices. Scheduled HUMANS meshes are baked into their bind pose
once and then assigned Babylon skeleton attributes from their exact MT5 render
nodes. Ordinary vertices remain rigidly weighted to their owning node,
matching the original HRCM renderer's one-matrix-per-piece contract. Exact
duplicate boundary vertices shared by two or more MT5 nodes receive the same
adjacent-node influences, which is the GPU equivalent of the player path
rewelding those boundaries after every pose. This keeps joints closed without
soft-skinning the rest of a low-poly limb. Per-frame animation now uploads
bone matrices and lets the vertex shader deform the meshes. It no longer
rewrites and reuploads every NPC vertex on the JavaScript main thread, and it
does not reduce animation frequency with distance.

The 37-control topology and solver dispatch were first recovered from Ryo's
live runtime, but it is not a universal NPC skeleton. Each scheduled actor
uses the exact controller family selected by its CHRM metadata, including
that family's authored hierarchy, dimensions, rotations, and solver classes.
MOTN curves are mapped from their source family into that target family by
control type before the target controller is evaluated. Ryo's player-only
shoulder correction is excluded from this path.

The resulting controller matrices are absolute render matrices. They must not
be converted into local rotations and rebuilt through the CHRM hierarchy.
The Dreamcast path proves this directly: `FUN_0c12d70c` traverses HRCM,
`FUN_0c0924a0` resolves each signed render key, and `FUN_0c1d1a00` copies the
resolved matrix unchanged. Babylon therefore routes those matrices directly
to the matching MT5 bones; each bone's inverse bind matrix supplies the
model-specific geometry relationship. This matters for compact models such
as `SHY_L`, whose authored render hierarchy collapses leg nodes that remain
separate in the controller. Reconstructing controller output through that
render hierarchy displaced its legs even though both the model family and
motion family were correct. The `SHY_L`/`SIN_SIN_WALK_LP` regression test
now requires every authored render key to receive its native controller
matrix unchanged.

The executable contains an authoritative 21-entry controller-family table at
`0x0c293ea4`. Its family sizes are
`37,37,37,37,37,37,37,37,37,35,37,35,37,37,35,35,41,42,43,35,43`.
Each entry supplies the exact control type order, hierarchy, default
translations, default rotations, solver class, and solver subtype. The
relocation-aware Ghidra exporter `tools/ghidra/ExportControllerFamilies.java`
extracts the table, and `tools/actors/build_shenmue_controller_family_data.mjs`
generates the browser representation. The browser no longer maintains a
hand-written adult, child, skirt, or handedness family.

Source motion family and target model family are separate authored values:

- A MOTN sequence stores its **source family index** in the low 15 bits of the
  halfword at sequence data `+0x02`; bit 15 remains a separate flag.
- During model-component construction, `FUN_0c113384` stores the **target
  family index** at component `+0x1d8`. The controller begins at component
  `+0x14`, so this is exactly controller `+0x1c4`.
- That target value comes from `FUN_0c0e3498`, which looks up the model's
  `IMGM` metadata (`0x4d474d49`) and returns its signed 16-bit field at
  metadata payload `+0x16`.
- `FUN_0c0e2f62` updates `IMGM +0x16` from the selected runtime model
  record's field at `+0x0c`.
- `FUN_0c0fafd8` selects and instantiates the HRCM hierarchy subtree.
  `FUN_0c0faef2` initializes that runtime record directly from the selected
  source hierarchy node's low 16-bit type:
  `nodeType > 0x7000 ? nodeType - 0x7001 : 0`.
- `FUN_0c10d0cc` passes controller `+0x1c4` as the target family and the MOTN
  family as the source family to `FUN_0c107c6e`.
- `FUN_0c107e7c` maps every source curve by its authored control **type** into
  the target family's control carrying the same type. Numeric array indices
  are not assumed to match.

This explains both previously observed failure classes. A 37-control source
can target a differently ordered 37-control model without crossing its arms,
and a 35-control target does not become a 37-control target merely because a
particular motion contains more tracks. The target topology remains model
metadata; only the source descriptor changes with the selected motion.

`tools/actors/build_npc_controller_family_data.mjs` applies that exact node-type rule
to all 220 scheduled-character CHRM resources extracted from `HUMANS.AFS`.
Before accepting a model it verifies the CHRM SHA-256 against
`play/data/scheduled-actor-assets.json`. It resolves all 220 assets across 12
authored families and exports 223 model codes after retaining the three
documented archive aliases. The complete offsets, flags, node types, archive
entries, hashes, and decoded families are preserved in
`tools/evidence/npc-controller-family-disc-evidence.json`.

`tools/actors/extract_npc_runtime_controllers.js` independently recovers the live
target family from actor `+0x6c` controller `+0x1c4` and validates a
controller by requiring control `+0x44` to point at its same-index final
matrix. `tools/actors/build_npc_controller_family_evidence.mjs` applied that method
to all 505 retained RAM captures. 191 captures contributed 40 model
observations. Every one agrees with the family decoded independently from its
CHRM root; RAM is now a cross-check rather than the source of the browser
mapping.

`Mt5Loader` also exposes the decoded family on each loaded model root, so the
scheduled animation runtime consumes the value carried by the actual CHRM
being displayed. The generated Disc table is checked against it and remains
the alias/index audit. No target family is inferred from height, sex,
clothing, motion name, track count, or visible pose.

The renderer does not require a target character to contain every render key
seen in Ryo's hierarchy. `FUN_0c12d70c` traverses the target model's authored
runtime hierarchy. For each target node, `FUN_0c12d69a` calls
`FUN_0c0924a0` to find that exact signed key in the live controller render
tree; only a successful lookup supplies the matrix pointer at controller-tree
node `+0x38` to `FUN_0c1d1a00`. There is no table that inserts missing target
nodes.

This recovers the two exceptional scheduled models without a substitute
mapping. `HOB_L.CHRM` and `TKI_L.CHRM` intentionally omit hip-wrapper keys
`0x10` and `0x15`, but retain the other 11 humanoid render routes, including
thigh keys `0x11` and `0x16`. The browser now derives the same intersection
from each loaded CHRM and animates only those authored routes. An automated
roster audit constructs finite rigs and retarget profiles for all 220 of 220
unique scheduled-character assets: 218 expose the ordinary 13 routes and
these two expose 11.

Horizontal root translation is removed from route clips because the scheduler
owns the authoritative world path; animation provides the body motion. Entry,
looping, and stopping clips are selected from route elapsed and remaining
time. Explicit `_LP_` state clips loop, while other state clips hold their
final pose.

The nonhuman family-16 cat and family-18 dog render trees are also routed
directly. Their Disc-authored HRCM hierarchies add limb, neck/head, tail, and
dog-ear render keys beyond Ryo's 13-key subset. Those keys are associated with
the matching controller types in the executable's exact family descriptor,
then intersected with the loaded animal HRCM in the same way as humanoid
models. Cats and dogs therefore use their own topology and `CAT_CAT_*` /
`DOG_DOG_*` motions; they do not receive a human/Ryo fallback. MCIR
shared-leaf allocation and other unresolved descriptor semantics remain
explicit.

The bicycle/moped seen in Yamanose remains unresolved. Bicycle resources are
resident, but no owning HMDL or JU00 schedule has yet been proven; an earlier
experimental bicycle incorrectly followed the yellow cat route and was removed.
Resident resources alone must therefore never be assigned a schedule by
proximity or guesswork.

### Generalized scheduler discovery and offline relocation

The extractor no longer uses the nine reviewed JU00 addresses as discovery
inputs. It scans four-byte-aligned `[A-Z0-9]{4}PRG1` identifiers and treats the
next aligned program header as the exclusive ownership boundary. In offline
programs, timetable roots come only from the native 16-slot pointer table,
which prevents an interior row from being mistaken for a shorter suffix table.
A timetable may be empty or have one or more strictly increasing times below
86400, must end in `0xffffffff`, and every non-empty row's descriptor pointer
must resolve inside the same owner. Descriptors are accepted by exact
dispatcher traversal to an engine terminal, not by assuming their first
operation is an area selector. In RAM, the word four bytes before the PRG1
identifier is the selected relative timetable pointer, so extraction follows
that one authoritative root. The final resident program is reported as
unbounded instead of being assigned the rest of RAM.

`tools/actors/inventory_scheduled_actor_captures.js` performs one sequential pass over
the capture corpus. It hashes each RAM image and allocator-bounded program,
records exact and scheduler-population duplicate groups, and gets the active
disc/area from the highest-address mutable `SCENE/0<disc>/<area>` loader path.
Lower static path literals are retained as candidates but are not mistaken for
the active path.

The complete inventory covers 499 RAM captures. The deterministic merged
evidence contains 241 RAM actor codes, 313 byte-exact loaded variants, and
1,684 timetable entries across 13 captured disc/area pairs. Byte-different
extents are never merged merely because their actor identifiers match.

Complete cycle programs also exist offline in `CM_*.BIN` and
`CYCLEMAN.BIN` MOBJ files. The Disc 1, 2, and 3 data tracks have now been
extracted, and their global `CM_D000.BIN`, `CM_JOMO.BIN`, and `CM_MFSY.BIN`
files are byte-identical across all three discs. Program-local pointers use:

```text
resolved file offset = PRG1 identifier file offset - 4 + raw pointer
```

For example, CATB's source descriptor value `0x1168`, combined with its RAM
header `0x8cc5926c`, relocates to
`0x0cc5926c - 4 + 0x1168 = 0x0cc5a3d0`; the extractor normalizes that cached
alias to `0x8cc5a3d0`. Its 5,088-byte source program is
98.6% byte-identical to the loaded program; the differing words include these
relocations.

The native descriptor dispatcher at `0x0c119444` establishes the exact word
width of every operation present in the corpus. Its registered extension
handler at `0x0c0f5b28` supplies the widths for operations `0x17`, `0x18`, and
`0x22`; operation `0x16` carries its variable width in operand four. The shared
operation-1 handler at `0x0c11f948` reads the movement mode, point count, and
XYZ-array pointer for every mode. Sequential decoding now reaches an engine
stop (`0`, `4`, or `0x12`) without an unresolved boundary in every source
descriptor.

The three unique source files contain 255 scheduled program variants across
242 actor/controller codes, 19,176 exactly bounded descriptor operations,
1,560 proven movement paths, and 38,626 points. The deterministic RAM manifest
retains 241 actor codes, 313 loaded variants, 1,684 timetable entries, 1,446
paths, and 35,110 points. All raw bytes, numeric operands, owning programs,
entries, and provenance remain available. Native dispatcher control flow now
classifies 2,841 synchronous payload skips, 175 current-operation clears, and
350 continuation-pointer registrations. Together with the already decoded
state, control, attachment, transform, and movement handlers, this reduces the
semantic remainder from 8,035 to 668 occurrences across six partially decoded
families: `0x16`, `0x17`, `0x18`, `0x1c`, `0x22`, and `0x2a`.
Higher-level payload semantics and
free-roaming/cutscene/minigame classification remain open. The original JU00
manifest remains unchanged as a regression fixture.

The same dispatcher trace also fixes the direct-state offsets that must remain
available to later world-state reconstruction: operation `0x0f` writes the
script-queryable dword at actor `+0x90`; operation `0x28` writes the strict
boolean controller byte at `+0x149`; and operation `0x38` writes boolean byte
`+0x1d1` before refreshing actor bounds/control state through
`0x0c11a382`.

Operation `0x35` is no longer an unnamed dword. The dispatcher writes its
operand to actor `+0x1c0`. Operation-1 handler `0x0c11f948` copies the route's
movement-controller operand to current motion `+0x06`, then resolves `+0x1c0`
into route-completion state `+0xf4`. At route completion, instructions at
`0x0c11faba` copy `+0xf4` back to current motion `+0x06`. A nonzero override
is used verbatim. Zero calls the shared PRNG modulo four and reads one of the
actor definition's four halfword idle states at `+0x7e/+0x80/+0x82/+0x84`.
The source corpus contains 46 operation-`0x35` records across 14 actors: 37
nonzero records all resolve exactly to eight registered M_MOBJ standing/idle
motions and bind to 47 following routes; nine zero records restore the native
actor-definition default domain. Browser traversal now performs the exact
nonzero route-completion handoff. It does not synthesize the still-unextracted
default candidate table or its process-wide random choice.

Operation `0x08` has a proven native area-residency consumer. Handler
`0x0c1195d8` writes the four-character area operand to actor `+0x0c` and
clears actor XYZ at `+0x24/+0x28/+0x2c` when it changes. Lookup
`0x0c11bf5c` walks the resident scheduled-actor table in `0x1f0`-byte
records and resolves a target by its four-character actor code at definition
`+0x04`. Linked-actor acquisition `0x0c11bfb0` and linked-actor movement
update `0x0c11b63c` require the owner and target area codes at `+0x0c` to
match; a mismatch rejects or cancels the link stored at actor `+0x7c`.
Across 1,257 source operations used by 219 actors, this proves a same-area
residency gate.

Operation `0x09` is separate. Handler `0x0c1195fc` writes its numeric operand
to actor `+0x14`; the native actor loader initializes that field to `2`.
Values other than `1` call `0x0c11ee08`, which can create the resident
controller, save its current state, install controller state `0x2c`, and
restore the actor definition's default motion from definition halfword
`+0x7c` into current motion `+0x06`. The native resident registry proves 226
exact registered default motions, 23 authored zero defaults, and no unresolved
nonzero default among 249 byte-stable actor definitions. The source uses
values `0`, `1`, and `2`. This proves a lifecycle/control-state field but does
not prove that those values mean visible, hidden, walking, or a map layer.

This definition state is also a required motion asset even when it is absent
from every explicit timetable operation. The native reset writes it directly
from definition `+0x7c`; consequently, the browser motion runtime now adds
every recovered nonzero `nativeDefaultMotionStateId` to its preload
requirements before scanning journey operations. This fixes stationary actors
whose exact default clip was previously never loaded. For example, TKNB's
definition state `0x8143` resolves through the registered M_MOBJ range to
`OTH_TATI_2_LP_F`. The runtime does not infer an idle from the actor's name,
model, or pose.

Three other compact state handlers now have exact field and first-consumer
evidence. Operation `0x0f` writes a dword to actor `+0x90`; query
`0x0c119888` resolves an actor by four-character definition code and returns
that register to the script VM. Operation `0x28` writes a strict boolean to
actor `+0x149` and propagates it through the controller. Operation `0x38`
writes boolean bounds mode at actor `+0x1d1`, then `0x0c11a382` recomputes
the actor's control footprint from definition extents `+0x10/+0x14`. These
are retained without inventing user-facing names beyond what the native
consumers establish.

Operation `0x2a` now has an exact scheduler-side core within that partial
remainder. The dispatcher calls handler `0x0c0f9efa`, which writes the
four-character linked scene-object code to actor `+0xc8`, writes its control
to `+0xd4`, and invokes scene-object state handler `0x0c0f9c90` with
`control + 4` and the current scheduler second. The 41 source records use only
controls zero and one across `BS01` through `BS16`. Four active RAM records
among 3,566 structurally found actors join one exact source operation each via
the next-descriptor pointer. The browser manifest and scheduler preserve the
transition and its position/facing/two-float interaction payload across later
timetable entries; the payload remains numeric pending independent proof of
its higher-level interaction behavior.

New Yokosuka deliberately does not treat this scheduler-side state as player
access authorization. The first authoritative timed shop rule instead joins
the independently proven D000 layer-14 half-open clock window to native door
selector 30 and its direct `DCHA` transition. Operation `0x08` is likewise an
actor area-residency write, not a door or player-travel command.

Dobuita presentation now has a narrower exact mapping. Tagged runtime objects
join `BS01` through `BS16` one-to-one to `DBS9901G.MT5` through
`DBS9916G.MT5`. The 16-entry runtime table supplies each shutter's X/Z
placement, fixed facing, and lower/upper Y endpoints. Its update routine adds
`+0.01` or `-0.01` to current Y per frame and clamps at those endpoints;
synchronized captures independently caught `BS14` and `BS16` descending
during their scheduled close operations. For this reviewed D000 set only,
control zero is the upper/open target and control one the lower/closed target.

The narrow D000 evidence feeds a generated Shenmue I scene-object catalog.
Generation inventories every Shenmue I asset area and available runtime
placement manifest, then fails unless every extracted operation-`0x2a` command
belongs to exactly one reviewed object. All 41 current commands resolve to the
D000 set; the corpus contains no non-D000 scheduled scene-object command. The
browser controller selects per-world definitions and consumes an explicit
movement axis, control targets/state labels, and speed rather than hard-coding
Dobuita. Areas with no reviewed mapping load no object.

Live boundary crossings animate at 0.3 units per real second. Loads,
reconnects, day rollovers, backward debug changes, and stale clock changes snap
to the latest endpoint. This client presentation does not add collision or
feed access authorization. New areas require independent proof of their
commands, tagged models, direction/endpoints, and control meanings; D000's
mode interpretation is not generalized.

Operation `0x22` also has an exact scheduler-side timing and candidate core
within that partial remainder. Extension handler `0x0c0f90f2` calls
initializer `0x0c0f8f48`, which turns a negative first operand into
`invocation clock + abs(operand)` and retains a nonnegative operand as an
absolute target second at actor `+0xcc`. Its second operand points to a
`0xffffffff`-terminated array of 16-byte motion candidates. All 53 source
operations across 19 actors resolve exactly, containing 155 numeric
candidates. The operation pointer, selected index, and candidate count live at
actor `+0xac/+0xd0/+0xd4`; update routine `0x0c0f8f8c` writes the selected
candidate's low-16-bit motion state at `+0x06`. Existing captures provide 558
active records among 2,474 structurally resolved actor observations. Every
active record joins one exact source operation and matches its source count,
selected index, and numeric motion state. Eight operations collapse to one
unique numeric state across every authored candidate: seven have one candidate
and one repeats the same state in multiple candidates. Browser traversal now
applies that RNG-independent motion state during and after the proven
relative/absolute gate. The native selection rule is now exact as well. The
first selection uses index zero. Each later selection is
`(currentIndex + 1 + random15 %
(current.selectionAdvanceControl + 1)) % candidateCount`, where the control is
candidate offset `+0x0c`. `random15` comes from the process-wide generator at
`0x0c1ce1f0`: its seed at `0x0c2a1d58` begins as one, advances by
`seed = seed * 0x41c64e6d + 0x3039` modulo `2^32`, and returns bits 16–30.
The other 45 operations retain multiple motion states. Because that generator
is shared by many unrelated engine consumers, the exact later sequence also
depends on global native call ordering that the scheduler programs alone do
not encode. The browser therefore does not invent a local substitute or an
unproved authored motion name.

Operation `0x18` is a second engine-proven timed extension gate. Handler
`0x0c0f9812` resolves its four-character target through registry lookup
`0x0c0f9458`; registered target subtype 1 dispatches to `0x0c0f8ec0`, and
subtype 3 dispatches to `0x0c0f6b38`. Common initializer `0x0c0f96f0`
retains encoded target subtype/state at actor `+0xd4`, the source operation
pointer at `+0xd8`, target registry record at `+0xdc`, and target second at
`+0xe0`. Subtype 1 completes only when its target is outside the half-open
active window and the target second has arrived. Subtype 3 completes outside
its inclusive window or strictly after the target second. All 15 source
operations across ten owners decode their target, relative/absolute time
control, three numeric motion-state IDs, and four numeric controls. Existing
captures contain 1,573 active records among 2,147 structurally resolved
owners; every record joins one exact source operation. The 1,569 valid target
reads give nine unanimous subtype/window bindings, while four torn reads in
one capture stay explicit. Browser traversal applies those exact release
predicates without inventing animation names for the remaining numeric
payload.

Operation `0x17` is the declaration consumed by those linked-actor systems,
not another timed stop in its owning descriptor. Its normal handler
`0x0c0f96d0` sets the continuation flag and returns the record's `0x38`-byte
width. Registration stores the operation pointer at actor `+0xa4`; external
activation uses `0x0c0f956a` to store target subtype/state at `+0xd4`, the
same operation pointer at `+0xd8`, and the resolved target registry record at
`+0xdc`. Update routine `0x0c0f9630` dispatches subtype 0, 1, or 3 to their
separate interaction state machines. The source corpus contains 329 records
across 76 actor codes and 25 target codes. Their signed modes include `-3`
and `-1`; 254 time operands are relative durations and 75 are absolute
scheduler seconds, with no zero operands. Across existing captures, all 605
active `0x17` actors among 12,765 structurally resolved observations join one
exact authored record, have identical `+0xa4/+0xd8` pointers, and resolve its
target code. Browser schedules now expose every declaration and its exact
descriptor registration second while leaving subtype-specific numeric
animation/placement mappings explicit and unresolved.

The target subtype used by both linked-interaction operations is no longer
inferred from whichever target happened to be live in a capture. Native lookup
`0x0c0f9458` reads a registry whose relocated header and record-array globals
are `0x0c217970` and `0x0c217974`. The header count is at `+0x08`; each
record is 24 bytes with four-character code at `+0x00`, object pointer at
`+0x04`, and subtype in the first dword of the referenced object. Across 476
unique captures, 248 have the resident registry and 228 have its native null
state. Every resident registry has 28 records, and all 6,944 observations are
byte-stable. The complete registry contains only subtypes 0, 1, and 3, and
all 25 target codes referenced by the 329 operation-`0x17` and 15
operation-`0x18` source records now have exact subtype bindings. Generated
browser records carry that proven subtype, and manifest generation rejects
any missing or conflicting source binding instead of using a character-name,
model, or capture-presence heuristic.

Dialogue runtime-component predicate mode 6 is the persistent yen balance.
The native accessor reads selector 2 from save-state offset `+0x18`;
operations `0x005f` and `0x0060` expose that selector to scripts. Capsule-toy
payment reads it, subtracts exactly ¥100, and writes it back, while the vending
affordability and `MONEY_LOCK` paths independently use the same balance.
Browser predicate evaluation accepts the authenticated character's server
yen explicitly and leaves it unresolved when that value is unavailable.

The browser actor selector is generated from the original bounded SCNF
streams rather than the large forensic graph. Five byte-identical archive
repeats collapse to 257 unique actor resources and 510,152 exact bytes.
`NativeDialogueSelector.js` executes native expression, conditional branch,
relative branch, null-return, and entry-marker behavior and returns the exact
conversation body. A missing story-state input produces an unresolved result,
never an inferred fallback line.

All 28,049 actor message entries are generated as 257 actor-scoped lazy
modules. The browser therefore loads only the selected NPC's message table.
The resumable body interpreter preserves nested message construction,
predicate branches, authored random blocks, saved continuations, external
event yields, and lifecycle transitions. It reports any unavailable progress,
random, or dynamic-continuation input explicitly rather than flattening every
possible line into one conversation.

---
