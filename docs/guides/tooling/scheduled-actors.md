# Scheduled actor extraction tools

Commands below run from the repository root unless noted otherwise.
Raw disc inputs and captures are local, ignored prerequisites; a clean clone
does not contain them. See [runtime asset setup](../runtime-assets.md) for
the separate published-asset restore workflow.

## Placement & Data Extraction

The complete emulator-RAM placement method, structure offsets, coordinate
conversion, JOMO evidence, failure modes, and repeatable workflow are
documented in
[Runtime Object Placement from Dreamcast RAM](../../research/shenmue1/runtime-object-placement.md).

The scheduled-actor source extractor also follows dispatcher `0x0c119444`
semantics, not just opcode widths. It marks the operations whose switch cases
only advance the descriptor pointer, distinguishes operations `0x05`/`0x13`
that clear the current-operation field, and records operation `0x20` as a
continuation-pointer registration. These classifications have no direct actor
transform effect and reduce the exact-but-semantically-partial inventory to
796 occurrences across seven operation families.

Operation `0x19` is decoded as a direct motion-controller request, not an
object code. Dispatcher handler `0x0c11f804` stores its first operand at actor
`+0xf0` and submits it to `0x0c10d77c`; zero tears down the request. The
offline extractor, browser manifest, and motion manifest preserve the four
following controls and package each proven nonzero registered motion. Direct
state values from operations `0x09`, `0x0f`, `0x28`, and `0x38` are also
retained in browser data for consumer tracing.

`extract_scheduled_actor_route_completion_evidence.js` resolves operation
`0x35` completely. The dispatcher writes it to actor `+0x1c0`.
Operation-1 handler `0x0c11f948` uses a nonzero value verbatim as the route's
completion motion at `+0xf4` and copies it to current motion `+0x06` at
`0x0c11faba` when the route ends. All 37 nonzero records resolve to exact
registered M_MOBJ motions, and 47 following routes bind to an authored
override. Nine zero records restore the native four-choice actor-definition
idle domain at definition offsets `+0x7e/+0x80/+0x82/+0x84`.
`extract_scheduled_actor_default_idle_evidence.js` enumerates the native
resident-actor registry in all 476 unique RAM captures and recovers 249
byte-stable definition tables from 38,780 resident records. Every one of the
904 nonzero candidates resolves exactly through M_MOBJ. The browser packages
all authored candidates and executes a default automatically only when all
four choices are identical; it does not replace the shared process-wide PRNG
with an unrelated local random choice.

- **Usage**:
  `node tools/actors/extract_scheduled_actor_route_completion_evidence.js [scheduled-actors.json] [1ST_READ.BIN] [M_MOBJ.BIN] [output.json]`

- **Default-idle usage**:
  `node tools/actors/extract_scheduled_actor_default_idle_evidence.js [capture-inventory.json] [1ST_READ.BIN] [M_MOBJ.BIN] [output.json]`

`extract_scheduled_actor_area_residency_evidence.js` resolves operation
`0x08`'s native consumer. Handler `0x0c1195d8` writes its four-character
area operand to actor `+0x0c` and clears XYZ when the area changes.
Resident-actor lookup `0x0c11bf5c` walks the `0x1f0`-byte scheduled-actor
array by four-character actor code. Linked-actor acquisition at
`0x0c11bfb0` and update at `0x0c11b63c` both require owner and target area
codes to match, otherwise the link at `+0x7c` is rejected or cleared. This
is an exact same-area residency gate, not a numeric interaction cohort.

`extract_scheduled_actor_direct_state_evidence.js` pins the separate compact
handlers and first native consumers for operations `0x09`, `0x0f`, `0x28`,
and `0x38`. They write actor lifecycle/control state at `+0x14`, a
script-queryable state register at `+0x90`, a strict boolean controller mode
at `+0x149`, and a bounds/control-footprint mode at `+0x1d1`, respectively.
The evidence retains numeric values and consumer boundaries without assigning
unproven presentation labels such as visibility.

### Scheduled actor action-controller evidence

`extract_scheduled_actor_action_evidence.js` joins operation-`0x30` action
requests in existing captures to exact source operations. It resolves actor
records through relocated PRG1 owner pointers, then requires the resident
normalized program hash, numeric action ID, and actor `+0xec` operation
pointer to agree. The report preserves the native install/teardown handlers,
fixed controller mode, actor/controller field offsets, all five numeric action
IDs, and per-ID actor/capture counts. Actor `+0x18d` proves the records are
queued requests. The report treats a null actor `+0x6c` controller pointer as
null rather than RAM offset zero and separates 480 controller-absent snapshots
from 24 resident-controller snapshots. Operation `0x30` feeds the generic
controller command path. Its request initializer at `0x0c10d7f6` resolves
each nonzero ID through registered-motion lookup `0x0c092f14`. All five IDs
therefore map exactly to the `OTH`, `PNW`, `SIN`, `SYP`, and `YKI`
`KASA_UDE_MONOMOTI_LP_F` umbrella-carrying loops in `M_MOBJ`; zero tears the
request down.

- **Usage**:
  `node tools/actors/extract_scheduled_actor_action_evidence.js [capture-inventory.json] [scheduled-actors.json] [output.json] [1ST_READ.BIN]`

### Native NPC runtime controllers

For the current runtime ownership, generated-data pipeline, persistence, and
obstruction policy, see the canonical
[`docs/implementation/scheduled-npcs.md`](../../implementation/scheduled-npcs.md). This tools section
documents extraction and native evidence rather than application architecture.

`extract_npc_runtime_controllers.js` resolves live scheduled actors through
their relocated `????PRG1` owner pointers, then follows the native
`actor +0x6c` controller pointer. The controller's `+0xb4` field identifies
its `0x48`-stride control records and `+0xb0` identifies its `0x40`-stride
final matrices. The record count is accepted only while every control
`+0x44` points to its same-index matrix.

The report preserves every control record byte-for-byte. It also follows the
record's authored default-position, default-rotation, and child pointers, but
uses neutral field names for values whose NPC meaning is not yet proven.
Ryo's controller semantics are never assumed merely because both records are
72 bytes wide.

- **Usage**:
  `node tools/actors/extract_npc_runtime_controllers.js capture/ram.bin [ACTOR ...] [--out report.json]`

The report also reads the target controller-family index at controller
`+0x1c4`. Ghidra proves that model construction copies this value from the
model's signed `IMGM` runtime field at payload `+0x16`. That field is updated
from the selected runtime model node. This target family is independent of
the source family stored in each MOTN sequence.

`build_npc_controller_family_evidence.mjs` performs a lightweight version of
that extraction across every retained `captures/pvr/**/ram.bin`, joins actor
codes to exact scheduled model codes, preserves RAM paths and hashes, and
emits an independent RAM cross-check only when all observations agree.
Conflicts remain in the evidence report and are never resolved by a visual or
naming heuristic.

- **Usage**: `node tools/actors/build_npc_controller_family_evidence.mjs`
- **Evidence**:
  `tools/evidence/npc-controller-family-evidence.json`
- **RAM cross-check data**:
  `tools/evidence/npc-controller-family-ram-evidence.web.js`

`build_npc_controller_family_data.mjs` implements the original offline model
rule recovered from `FUN_0c0faef2`. The selected HRCM hierarchy node's low
word stores a type in the `0x7001..0x7015` range; subtracting `0x7001`
produces the target controller-family index. Scheduled character resources
select their root hierarchy node. The generator reads that value from every
exact HUMANS CHRM asset, verifies each file against its archive-provenance
SHA-256, and requires every retained RAM observation to agree.

- **Usage**: `node tools/actors/build_npc_controller_family_data.mjs`
- **Disc evidence**:
  `tools/evidence/npc-controller-family-disc-evidence.json`
- **Browser data**:
  `play/data/npc-controller-target-families.web.js`

The executable's complete 21-entry family table is extracted separately by
`tools/ghidra/ExportControllerFamilies.java` and converted with
`build_shenmue_controller_family_data.mjs`. Runtime motion curves map from
their source family to the target family by authored control type, matching
`FUN_0c107e7c`; equal numeric indices are not assumed.

### Scheduled actor native motion banks

`inventory_npc_motion_banks.py` inventories area and shared MOTN containers
from the extracted discs and records the result in
`tools/evidence/npc-motion-bank-inventory.json`.

`build_scheduled_actor_motion_manifest.mjs` then joins browser schedule
operations to their proven native banks. It reproduces `FUN_0c092f14`'s
process-wide registered-range lookup: unsigned IDs inside
`(0x0000, 0x0618)` select one-based entries in the shared `MOTION.BIN`, while IDs inside
`(0x8000, 0x8358)` select one-based entries in `M_MOBJ.BIN`. Operation codes
`0x02` and `0x1a` both use this same resolver; neither selects a bank. Its
operation-`0x01` handler copies the route operand verbatim to actor
current-motion `+0x06`; `extract_scheduled_actor_operation_one_motion_evidence.js`
therefore resolves all 24 route states through the same native registry.
Every state has a complete authored `MOTION` or `M_MOBJ` sequence, including
the cat and dog families. The generated runtime does not use a hand-written
mode table, invent entry/exit clips, or assign a Ryo fallback.

- **Usage**: `npm run build:scheduled-actor-motions`
- **Operation-0x01 evidence**:
  `node tools/actors/extract_scheduled_actor_operation_one_motion_evidence.js`
- **Output**: `play/data/scheduled-actor-motions.json`
- **Runtime assets**: `/motion/MOTION.BIN` and
  `play/assets/scheduled-actors/M_MOBJ.BIN`

### JOMO telephone player motions

`build_jomo_telephone_motion_pack.mjs` gunzip-decodes the exact Disc 1
`JOMO/COMMON01.PKS`, validates the PAKS/IPAC dictionary and all source hashes,
and extracts only `M_JOMO.MOTN`. It also parses the resulting motion bank and
requires native request `0x203e`/index 61 and `0x203f`/index 62 to remain the
two complete authored Goro telephone answer clips. The generated manifest
retains the source container, archive member, registry bounds, request mapping,
and output digest.

- **Usage**: `npm run build:jomo-telephone-motion`
- **Output**: `play/assets/hazuki/M_JOMO.MOTN`
- **Manifest**: `play/assets/hazuki/M_JOMO.manifest.json`

### Scheduled actor resident-character selection evidence

`extract_scheduled_actor_character_selection_evidence.js` derives the
operation-`0x2b` lookup handler and global character-table pointer slot from
`1ST_READ.BIN`. It follows that executable-derived slot in every unique
capture, validates the counted four-character table, and resolves each source
operand to the zero-based index written at actor `+0x08`. The report retains
invalid/transient tables separately and does not infer an alternate HUMANS
model from a character code.

- **Usage**:
  `node tools/actors/extract_scheduled_actor_character_selection_evidence.js [capture-inventory.json] [scheduled-actors.json] [output.json] [1ST_READ.BIN]`

### Scheduled actor model-override evidence

`extract_scheduled_actor_model_override_evidence.js` derives operation
`0x2f`'s handler, empty-string byte, and scheduler clock signature from
`1ST_READ.BIN`. It decodes each source model name/control operand and resolves
Fukuhara actor records through relocated PRG1 owner pointers. Runtime
observations preserve the exact `+0x18e` override bytes, live model pointer,
character index, and scheduler second. This proves the persistent `FUB_M`
selection independently of the source corpus and keeps the one resident
program mismatch explicit rather than claiming an exact-operation join.

- **Usage**:
  `node tools/actors/extract_scheduled_actor_model_override_evidence.js [capture-inventory.json] [scheduled-actors.json] [output.json] [1ST_READ.BIN]`

### Scheduled actor linked scene-object evidence

`extract_scheduled_actor_scene_object_evidence.js` derives operation
`0x2a`'s handler and actor object-code offset from `1ST_READ.BIN`. It decodes
all 41 source records that bind 19 NPCs to Dobuita scene objects
`BS01`–`BS16`: the handler stores the object code/control at actor
`+0xc8/+0xd4` and calls the shared object-state routine with mode
`control + 4` and the scheduler clock. Existing captures supply four active
records; all four join one exact source operation through the relocated PRG1
owner and native next-descriptor pointer. The trailing position, facing, and
two-float interaction payload remains numeric because its higher-level
interaction meaning is not yet independently proven.

- **Usage**:
  `node tools/actors/extract_scheduled_actor_scene_object_evidence.js [capture-inventory.json] [scheduled-actors.json] [output.json] [1ST_READ.BIN]`

### Scheduled actor timed variable-motion evidence

`extract_scheduled_actor_variable_motion_evidence.js` documents operation
`0x22` from its extension handler (`0x0c0f90f2`), initializer
(`0x0c0f8f48`), update routine (`0x0c0f8f8c`), canonical source programs, and
existing RAM captures. All 53 source operations across 19 actors resolve an
owned `0xffffffff`-terminated array of 16-byte numeric motion candidates:
155 candidate records in total. Negative time operands are relative durations;
nonnegative operands are absolute scheduler seconds. Across 2,474
structurally resolved actor observations, all 558 active `0x22` records join
one exact source operation through actor `+0xac`; candidate count, selected
index, and selected low-16-bit motion state match the source candidate in
every case. Two paused captures retain the operation after its stored target
second, which is reported explicitly. Eight source operations have one unique
numeric motion state across all of their candidates (seven single-candidate
arrays and one repeated-state array), so their browser motion selection is
RNG-independent. The browser applies those eight exact states. Native update
code also proves the first index is zero and later selection is
`(current + 1 + random15 % (current.selectionAdvanceControl + 1)) % count`.
`random15` comes from the shared engine LCG at `0x0c1ce1f0`, seeded at
`0x0c2a1d58`, with recurrence
`seed = seed * 0x41c64e6d + 0x3039 (mod 2^32)` and output
`(seed >>> 16) & 0x7fff`. The remaining 45 operations retain multiple possible
motion IDs. Their exact process-wide sequence depends on calls from other
engine systems, so it remains explicitly unresolved rather than substituting a
browser-local pseudo-random sequence; no authored motion name is inferred.

- **Usage**:
  `node tools/actors/extract_scheduled_actor_variable_motion_evidence.js [capture-inventory.json] [scheduled-actors.json] [output.json] [1ST_READ.BIN]`

### Scheduled actor linked-interaction evidence

`extract_scheduled_actor_linked_interaction_evidence.js` recovers operation
`0x18` as a timed interaction gate synchronized with a registered target
actor. Dispatcher handler `0x0c0f9812` resolves the target code through
`0x0c0f9458`; target subtype 1 uses handler `0x0c0f8ec0`, while subtype 3
uses `0x0c0f6b38`. All 15 source operations across ten owning actors retain
their target, relative/absolute time control, three numeric motion-state IDs,
and four control values. Existing captures provide 1,573 active records among
2,147 structurally found owners, and every active operation joins exactly
through actor `+0xd8`. Of those, 1,569 valid target reads collapse to nine
unanimous subtype/active-window bindings. Four torn target-object reads from
one capture remain explicit and are excluded from the bindings. The browser
uses the two native completion predicates and the proven target windows; it
does not assign higher-level names to the numeric animation payload.

- **Usage**:
  `node tools/actors/extract_scheduled_actor_linked_interaction_evidence.js [capture-inventory.json] [scheduled-actors.json] [output.json] [1ST_READ.BIN]`

### Scheduled actor interaction-registration evidence

`extract_scheduled_actor_interaction_registration_evidence.js` separates
operation `0x17`'s two native roles. In normal descriptor traversal,
`0x0c0f96d0` sets the continuation flag and advances over the 56-byte record
immediately; registration stores its pointer at actor `+0xa4`. A linked actor
can later activate the record through initializer `0x0c0f956a`, which stores
subtype/state at `+0xd4`, the exact source record at `+0xd8`, and its target
registry record at `+0xdc`, before subtype 0, 1, or 3 behavior runs.

All 329 source registrations across 76 actors retain their target, signed
interaction mode, relative/absolute time control, position, and seven numeric
controls. Existing captures provide 605 active records among 12,765
structurally resolved owners. Every active record joins one exact source
operation, has identical `+0xa4/+0xd8` pointers, and resolves the authored
target code. The browser exposes all registrations at their proven descriptor
registration second, but does not turn them into owner-side timing gates or
invent subtype-specific animation/placement mappings.

- **Usage**:
  `node tools/actors/extract_scheduled_actor_interaction_registration_evidence.js [capture-inventory.json] [scheduled-actors.json] [output.json] [1ST_READ.BIN]`

`extract_scheduled_actor_target_registry_evidence.js` independently recovers
the registry consulted by native target lookup `0x0c0f9458`. The relocated
header pointer is stored at `0x0c217970`, the record-array pointer at
`0x0c217974`, and the header count at `+0x08`. Each record is 24 bytes:
four-character target code at `+0x00`, object pointer at `+0x04`, and the
interaction subtype is the first dword of the dereferenced object. Of 476
unique captures, 248 contain the resident registry and 228 correctly contain
no registry. Every resident capture contains the same 28 records; all 6,944
record observations agree on subtype, and all 25 target codes referenced by
source operations `0x17`/`0x18` resolve exactly. The only native subtypes
present are 0, 1, and 3. Browser manifest generation requires these exact
bindings and fails rather than guessing an absent or conflicting subtype.

- **Usage**: `npm run extract:scheduled-actor-target-registry`
- **Evidence**:
  `tools/evidence/scheduled-actor-target-registry-evidence.json`

### Scheduled actor attachment evidence

`extract_scheduled_actor_attachment_evidence.js` scans existing RAM captures
for actor records through each relocated PRG1 owner pointer. It follows the
native actor `+0x98` linked-object pointer, checks owner identity, and compares
actor/object XYZ and facing fields bit-for-bit without fixed capture-specific
addresses. Active routed attachments additionally retain their `+0x5c` route
pointer, `+0x60/+0x62` count/target index, and `+0x140` movement-control field;
the tool compares runtime XZ words against the offline operation-`0x1c`
arrays. It also locates the reviewed scheduler literal signature from
`1ST_READ.BIN` inside each capture and follows the embedded cache pointer to
record exact seconds since midnight without adding a capture-specific RAM
address. For exact source-matched routes it records the per-update path step
at actor `+0x58`, the adjacent prior-position vector at `+0x168`, and their
measured displacement. This validates movement numerically without using
visual frame estimates. Byte-identical route arrays are also grouped when
their object code, live target index, current/prior positions, and frame step
all agree. The resulting groups retain each owner's timetable start, providing
a reproducible test of timetable-relative versus shared map-residency phase.
The executable checks additionally distinguish the two signed path-control
modes: positive values are multiplied by the float at `0x0c1290f0`, while
negative values select an attachment-type speed-table entry through
`0x0c12ab92`. All 114 source routes resolve to a finite native step. The 65
`FK01`/`FK02` records authored with `-20` select table index 1 at `0x0c2778a4`,
which is bit-identical to the scaled step used by the 49 records authored with
`+20`; the browser retains the signed operands while animating both families.

- **Usage**:
  `node tools/actors/extract_scheduled_actor_attachment_evidence.js [capture-inventory.json] [scheduled-actors.json] [output.json] [1ST_READ.BIN]`

### Scheduled actor MCIR occupancy evidence

`extract_scheduled_actor_mcir_occupancy_evidence.js` scans each unique capture
hash for resident `ISU_0.25` graphs, matches the full graph-header shape to an
offline MCIR table, and reads the native leaf occupant code at `+0x10`.
Runtime leaf positions must exactly match the independently extracted offline
record. Actor/target bindings observed on one leaf in every capture are kept
separate from bindings proven to vary across leaves. The report also groups
occupancy by exact resident scheduled-program set plus inferred disc/area.
Those map-residency cohorts retain the capture hashes and expose when a
globally varying binding is deterministic in each observed residency state.
The report additionally joins a binding to a normalized source-program hash
only when that actor code has exactly one resident program in every supporting
cohort. Browser placement can therefore require both an authored journey map
and the exact source program without conflating duplicate actor-code variants.
More strongly, it structurally joins each occupied leaf to a runtime actor
record only when actor `+0x04` is operation `0x16` and actor `+0x64` points
immediately after the exact extracted operation targeting that MCIR root.
Normalized source hash and operation offset remain part of every resulting
binding, preventing evidence from one occurrence from being reused for another
occurrence in the same program. The report also records the executable-backed
claim/release lifecycle: `0x0c126cca` claims the first free leaf while the time
gate waits, and `0x0c126ec2` clears and reselects a leaf when the gate opens.
It applies that final clear/reselect rule to each captured MCIR population and
retains both the waiting leaf and the resulting final leaf. This exposed two
deterministic differences that an occupied-leaf-only join would miss.
The offline MCIR extractor also proves final-endpoint equivalence directly:
35 of 37 roots end every leaf's second route at the same bit-exact XYZ point.
The browser can therefore place operations targeting those roots independently
of allocation order. Root resolution follows native global target-code lookup,
not the CYCLEMAN file neighboring a source program; both exact graphs coexist
in captures and their 37 target codes are disjoint.
For a non-invariant root without a matching capture, the browser manifest also
performs a fail-closed source-wide first-claim proof. It computes claim-ready
and release times from native waits and squared-route timing, requires stable
timing for every exact operation occurrence, requires every root leaf to start
empty, and requires the candidate to release before any other claimant journey
can begin. This proves `TATM` takes serialized `FBEA` leaf 2 and brings exact
operation-`0x16` placement coverage to 116/116.

- **Usage**:
  `node tools/actors/extract_scheduled_actor_mcir_occupancy_evidence.js [capture-inventory.json] [scheduled-actors.json] [output.json]`

### Scheduled actor operation-0x16 subordinate evidence

`extract_scheduled_actor_subordinate_evidence.js` independently scans every
unique capture for live operation-`0x16` actor records. It accepts an
observation only when actor `+0x118` points to the exact extracted source
operation and actor `+0x64` points to that operation's end. It then records
the controller state at `+0x110`, initialized target at `+0x114`, authored
subordinate index at `+0x120`, flags at `+0x1d8/+0x1d9`, current nested opcode
at `+0xa8`, and subordinate cursor at `+0x1dc`. The cursor is resolved only
against exact source-record boundaries. The scheduler clock is recovered from
the reviewed executable literal rather than a fixed capture address.

All 1,376 live observations join one source operation with no ambiguous or
unmatched pointer. In 1,192 observations the cursor is exactly after the
current authored record; 809 are native operation-`0x07` waits with their
absolute actor `+0x78` deadlines preserved. The report keeps descriptor-gate
time separate from controller initialization time: the executable anchors a
negative gate operand to the timetable entry start, while initializer
`0x0c126cca` stores a new clock-relative target after the gate has already
entered its waiting lifecycle. Browser playback uses 34 deterministic
capture-proven claimed leaves during that lifecycle and retains the remaining
subordinate motion/control phase as authored metadata rather than assigning an
unsupported duration.

- **Usage**:
  `node tools/actors/extract_scheduled_actor_subordinate_evidence.js [capture-inventory.json] [scheduled-actors.json] [output.json] [1ST_READ.BIN]`

### placement_extractor.py
General utility for parsing and dumping object coordinates and metadata from scenario files.

### furniture_extractor.py
Specialized script for identifying and extracting the database of furniture and prop items found in the game's indoor environments.

### extract_placements.py
Generates `scene.json` for the viewer from MAPINFO.BIN, focusing on model references and associated position data.

### extract_hrcm.py
Extracts HRCM model data from binary archives.

### extract_single.py
Extracts individual TEXN texture entries with their 8-byte IDs from binary data.
