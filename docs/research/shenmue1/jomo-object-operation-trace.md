# JOMO Object Operation Trace

This is the evidence boundary for scripted objects in the Hazuki Residence.
It exists to prevent a four-character object tag, a shared TASK callback, or
a similar model name from being treated as proof of an animation.

The machine-readable result is:

```text
tools/evidence/jomo-object-operation-trace.json
```

Regenerate it from the extracted Disc 1 room script and the synchronized
runtime TASK registry:

```text
tools/worlds/extract_jomo_object_operations.py \
  .disc-work/exact/jomo/MAPINFO.BIN \
  play/data/jomo-runtime-placements.json \
  --out tools/evidence/jomo-object-operation-trace.json
```

## What is traced

JOMO's SCN3 payload is native little-endian SH-4, not an opaque placement
list. The scanner recognizes every call through the room engine dispatcher:

```text
r5 = operation ID
r0 = *(script context + 40)
r4 = *(script context + 52)
r6 = downward-growing argument stack
jsr @r0
```

Arguments are resolved backward inside their local basic block. Literal
four-character values are joined to the 160 live `TASK + 0x168` identifiers
recovered from RAM. The report retains operation IDs, argument positions and
values, every native call-site offset, static record words, and membership in
the 15 compact JOMO static tag groups.

The first complete scan contains:

```text
160 runtime TASK identifiers
146 active rendered placements
8,472 engine-dispatch calls in the SCN3 code section
179 generic HMDL transform (0x00c9) calls
65 identifiers used literally by at least one engine call
```

The 179 transform sites are partitioned without overlap:

```text
93  directly name one of the 160 live JOMO tags
 3  read a handle from the proven dor0..dor9 indexed table
 7  name non-runtime literal pseudo-objects (MEMO or BANK)
76  receive object identity through a runtime stack/local
```

Every one of the 160 identifiers has an entry. An entry's `traceStatus` has a
strict meaning:

- `direct-engine-operations`: the tag is an actual resolved engine-call
  argument.
- `static-group-metadata-no-direct-call`: the tag is present in a compact
  static group, but the scanner does not pretend that the group's purpose or
  runtime-local dataflow is known.
- `static-metadata-only`: the tag has one or more static records but no
  direct call argument.
- `runtime-only-unresolved`: the tag exists in the live TASK registry but no
  exact four-byte static occurrence was found.

The last three statuses do **not** mean an item cannot animate. They mean its
tag reaches operations through a runtime local, generated identifier, or
engine-owned table and has not yet been bound by static dataflow.

## Why all door tags looked the same

`dor0` through `dor9` all have the same directly tagged operation set:

```text
0x0018  0x001d  0x001f  0x0027
0x0072  0x008f  0x00f7  0x0191
```

Those operations set up and coordinate a door slot. They do not encode
whether the visible leaf translates or rotates.

The generated door dataflow is also resolved. The initializer at file offsets
`0x15830..0x15938` constructs each tag with:

```text
little-endian 0x30726f64 + index * 0x01000000
0 <= index < 10
```

That is exactly `dor0` through `dor9`. Operation `0x0008` creates each slot
and the returned handle is stored at:

```text
script context + 0x1a8 + index * 4
```

Four later engine sites consume this indexed table:

```text
0x19800  operation 0x0002
0x748dc  operation 0x00c9, HMDL node 7, static vector 0x9a2b8
0x74972  operation 0x00c9, HMDL node 7, runtime vector
0x74cc0  operation 0x00c9, HMDL node 7, static vector 0x9a2d0
```

These are shared, parameterized operations for every door slot. They still
do not distinguish translation from rotation; the same node-7 writer is
driven with different vectors at runtime.

This is why classifying every `dor*` item as a sliding door was wrong even
though the tag scan itself was complete. The current browser distinction is
instead supported by model geometry:

- `DR15_*` and `DR23_*` contain centered paired leaves and translate.
- `DR01_015` contains one leaf authored to one side of an edge pivot and
  rotates.

The operation manifest records the shared tagged setup calls but does not
mislabel them as the leaf transform.

## The unresolved transform boundary

Operation `0x00c9` has a proven five-word descriptor:

```text
object tag
HMDL node key
position-vector pointer
rotation-vector pointer
mode: set / add / read / set-scale
```

Literal descriptors, such as the `TOKE` alarm-clock routine, are fully
resolved. Parameterized descriptors whose source table is proven are attached
to every affected object's `parameterizedEngineOperations`. The remaining 76
are kept in `unboundObjectTransformCalls`. Each entry still contains the exact
call site, node, mode, and any resolved static vector; only the runtime-local
object identity remains unclaimed. The seven literal `MEMO`/`BANK` calls are
separate in `nonRuntimeLiteralObjectTransformCalls`.

## Shared object tables

The compact tables are now also decoded by:

```text
tools/worlds/extract_jomo_shared_object_dispatch.py \
  .disc-work/exact/jomo/MAPINFO.BIN \
  play/data/jomo-runtime-placements.json \
  --out tools/evidence/jomo-shared-object-dispatch.json
```

This requires neither a running emulator nor one interaction per object. It
recovers all 15 groups, 73 grouped tags, callback tokens, 94 aligned object
records, nine repeated action IDs, interaction offsets, flags, and
node/variant selectors.

For example, group 1 contains five exact pairs. `GGB1` and `GGB2` share
action ID `0x1c`, have opposite X offsets (`-0.3` and `+0.3`), and select
routes `0x0d` and `0x08`. This is enough to reject the old assumption that
every group-1 record is simply the same hinged operation.

The extractor also resolves opcode `0x05a9` selectors through JOMO's exported
function table at `0x9d160`. Group 1's selectors `10`, `11`, and `100` lead
to SH-4 entries `0x11ce0`, `0x11f50`, and `0x58464`. Selector 11
participates in the selected-record path, but the record's action ID and the
engine's object-action selector are separate values. In particular, GGB's
record action ID is `28`, while the captured engine action selector is `10`.
They must not be conflated.

## Proven GGB object-action path

The GGB cabinet capture closes the previous last-leg boundary for this
selector family:

```text
JOMO operation 0x0139 mode 11
    object tag GGB1
    engine action selector 10
        |
        v
1ST_READ 0x0c0cac06  tagged-object action dispatcher
        |
        v
1ST_READ 0x0c0d1c40  selector-10/11 interpolation handler
        |
        v
1ST_READ 0x0c0d7110  interpolation initializer
        |
        v
live TASK + 0x40 HMDL root; recursively resolve node routes 13 and 8
        |
        v
1ST_READ 0x0c0d29cc  per-frame interpolation update
        |
        v
1ST_READ 0x0c0d2aaa  captured child position-X writer
```

The synchronized trace at `captures/analysis/interpolator-controller-entry.csv`
caught generic action-context setup at `0x0c0d6eaa` with:

```text
r4 = 0x0c82f220  live GGB1 TASK
r1 = 0x31424747  literal "GGB1"
r5 = 10          engine action selector
```

The same trace caught route traversal with live child nodes
`0x0c82f660` and `0x0c82f6a0`, whose route IDs are `8` and `13`. Those are
the same route values encoded in the aligned GGB2 and GGB1 static records.
This is now a programmatic binding from record metadata to live model nodes,
not a classification inferred from mesh shape.

The state-write trace at
`captures/analysis/interpolator-state-fpu-writes.csv` then shows the
initializer copying the node's starting position and target values into the
state rooted at `0x0c491520`. The earlier FPU capture proves that all 25 GGB1
position-X writes come from `0x0c0d2aaa`, with a final displacement of
`0.4382354915`.

JOMO's selected-record setup also configures controller slot `28` through
operations `0x006a` and `0x0066`. The source-hashed reconstruction in
`tools/evidence/jomo-controller28-evidence.json` corrects an earlier,
unsupported motion-name interpretation. The two static pointers supplied to
selectors 2 and 6 are four-float parameter tables at file offsets `0x9c670`
and `0x9c680`; neither is a string. The engine's selector-2 target at
`0x0c0eb1d0` copies four floats into controller offsets `+0x08..+0x14` and
mirrors them to its secondary pool.

Operation `0x006a` passes two runtime addresses to the controller initializer,
which sets selectors 0, 7, and 8 and activates controller 28. The remaining
`0x0066` calls set scalar selectors 4 and 5 plus integer selector 10. This
configuration proves an interaction-controller boundary, but does not identify
Ryo's motion or a motion-owned audio cue by itself. Nearby
`DEB_AKESIME_FUSUMA_*` debug strings have no proven dataflow into these calls
and must not be used as mappings.

The source-hashed frozen captures independently resolve the player side.
`tools/evidence/jomo-ryo-motion-evidence.json` compares root-normalized deltas
from Ryo's 37 retail runtime matrices at MOTM rendered frames 11, 20, and 24
against every decodable sequence in `MOTION/MOTION.BIN`. The unique match is
sequence 902, `AKI_AKI_TATI_IWA_L`; the next candidate's relative error is
`18.17x` larger. Ryo is therefore continuing his ordinary 60-frame standing
idle during these drawer samples. That sequence contains no authored sound or
surface-sound cue. This rules out a Ryo-motion owner for the sampled drawer
sound. The object-action phase route and synchronized trace below identify the
command independently; it is not owned by Ryo's motion.

The operation manifest now retains all 74 statically recognized operation
`0x0139` calls in `objectActionCalls`, instead of exposing only their aggregate
count. Five are mode-11 action invocations. The shared GGB site remains
runtime-parameterized in static code, while the emulator trace supplies its
exact `GGB1, 10` values.

The engine selector families are now separated offline in
`tools/evidence/shenmue-object-action-selector-families.json`. The per-frame
dispatcher at `0x0c0cae40` reads the selector saved at state offset `0x292`
and routes it to these managers:

```text
0..3   -> 0x0c0caff4
10/11  -> 0x0c0cb3b8
20/21  -> 0x0c0cb884
30     -> 0x0c0cbc72
40     -> 0x0c0cbfd0
50     -> 0x0c0cc2e0
60     -> 0x0c0cc5ea
```

This closes the most important classification ambiguity. Selector `10/11`
copies MT5 node field `+0x20` into state, and both recovered per-frame paths
at `0x0c0d29cc` and `0x0c0d2d12` write that same field. In the MT5 node
layout used by `Mt5Loader`, `+0x20` is floating-point position X. This family
is therefore a translating/sliding operation by executable semantics.

Selector `20/21` instead copies node field `+0x0c`. Its recovered per-frame
path at `0x0c0d3990` reads and writes `node + 0x0c` at instructions
`0x0c0d3a8c` and `0x0c0d3a98`. That field is fixed-turn rotation Y. This
family is therefore a hinged/turning operation by executable semantics.

These two families use the same generic initializer at `0x0c0d7110`; the
initializer itself does not identify the motion. The node field selected by
the invoke handler and per-frame writer does. Selector `30` is bounded as a
compound hierarchy/position operation because it traverses `node + 0x2c`
and reads position XYZ at `+0x20..+0x28`. The exact channels for families
`0..3`, `40`, `50`, and `60` remain deliberately unlabelled.

This analysis used the decoded bytes held by the Ghidra project. The retail
`1ST_READ.BIN` is scrambled on disc, so
`tools/ghidra/ExportShenmueMemoryRange.py` provides reproducible decoded
ranges for external SH-4 disassembly. No additional emulator interaction was
required.

`tools/ghidra/ExportJomoSelectorActionPaths.py` records the current Ghidra
call-graph boundary in
`tools/evidence/jomo-selector-action-paths.json`. It finds all 24 exported
selectors and all five static mode-11 sites. Stock Ghidra does not produce a
direct selector-to-site path because the generated room code resumes
coroutines through computed `braf`/jump offsets. Two recovered action
coroutines have a common incoming function at `0x0c44995c`; the captured
runtime-tag site itself belongs to the coroutine at `0x0c44673c`. A missing
static call-graph edge here means “computed coroutine transition,” not “no
relationship.” The engine-side saved-selector dispatcher and family managers
are now recovered as described above.

The selector-11 room-side transition is now reconstructed too. In the generic
group coroutine, `0x0c446e6c` loads the selected callback selector,
`0x0c446e72` subtracts one, and `0x0c446e74` stores the result that is passed
to operation `0x0139` mode 11 at `0x0c446ea6`:

```text
engine object-action selector = selected JOMO callback selector - 1
```

For the captured GGB1 path this is exactly `11 - 1 = 10`; the synchronized
trace contains mode `11`, tag `GGB1`, and selector `10` on the argument stack.
The same trace shows the preceding mode-21 call receiving callback token
`0x000b05a9`. RAM at `0x0c460e40` independently contains the compact group
table byte-for-byte, including group 1's four callback words and GGB tags.
This closes the mapping without inferring it from the cabinet's appearance.

Mode 21's engine boundary is now recovered directly from the source-hashed
retail executable as well. The operation handler's mode-21 jump-table entry
lands at `0x0c16566e`; `0x0c165670..0x0c165676` forwards its two descriptor
values unchanged to `0x0c0ccb14`. That function stores them in one-shot phase
slots `0x0c2164e8` and `0x0c2164ec`. The selector-10/11 manager later checks,
submits, and clears those slots at four phase boundaries:

```text
slot 0x0c2164e8 -> dispatch 0x0c0cb506 -> clear 0x0c0cb514
slot 0x0c2164ec -> dispatch 0x0c0cb56e -> clear 0x0c0cb57c
slot 0x0c2164e8 -> dispatch 0x0c0cb778 -> clear 0x0c0cb784
slot 0x0c2164ec -> dispatch 0x0c0cb806 -> clear 0x0c0cb812
```

All four calls target `0x0c17a91c`. That address is a shared typed-command
dispatcher, not an audio-only routine: TELM sends proven `AB05`/`AB06` sound
commands to it, while these JOMO groups supply `0x000b05a9`. That word is
opcode `0x05a9`, selector `11` only under the SCN3 interpretation. At this
dispatcher the low byte `0xa9` selects sound queue `0x0c1d4b18`, and the
little-endian bytes `a9 05 0b 00` are the playable JOMO `A905:11` command.
The exact F1OMOYAA bank independently resolves the other nonzero group-zero
phase words as `A905:10` and `A905:100`.

This is particularly important for group-zero drawer `ATS1`. Its phase route
does supply authentic location-bank sounds. Selector 11's separate
room-level logical sound word remains `0xffffffff` in every pinned live JOMO
record, but that is negative evidence only for that logical-record path.

That final phase-label boundary is now closed by a synchronized interpreter
run from the archived Hazuki wardrobe state. Left-trigger focus and A opened
the visibly closed ATS1 upper drawer; after it visibly reached open, B closed
it. Tracing entries to `0x0c17a91c` produced this exact order:

```text
cycles        visual state before dispatch  r4          phase
165949853736  closed                        000b05a9    opening start
167748160768  open                          000a05a9    closing start
167998610128  closing                       006405a9    closing impact
```

The little-endian commands are respectively `A905:11`, `A905:10`, and
`A905:100`. Their playback/sample joins are `8/31`, `7/30`, and `56/32`.
The empty second token explains why no command occurs at opening completion.
`tools/evidence/jomo-ats1-drawer-phase-dispatch.csv` preserves only
these normalized entry events, not a giant emulator dump, and the evidence
extractor pins the capture and archived-state hashes. This justifies runtime
playback for ATS1 through ATS6; it does not generalize the commands to groups
whose engine selector path remains unresolved.

Rebuild the compact evidence without Ghidra or an emulator:

```sh
npm run extract:jomo-object-phase-callbacks
```

Groups 0 and 1 both declare selector 11 as their primary callback, so the same
native path binds all 37 of their tags to engine selector 10 and therefore to
MT5 node position X. The reproducible result is:

```text
tools/worlds/extract_jomo_object_action_bindings.py \
  tools/evidence/jomo-shared-object-dispatch.json \
  tools/evidence/shenmue-object-action-selector-families.json \
  --out tools/evidence/jomo-object-action-bindings.json \
  --browser-out src/generated/JomoObjectActionBindings.js
```

That extractor deliberately emits only these two proven groups. The other
JOMO callback families still require their own native dataflow traces; their
numeric proximity is not treated as an engine selector.

The captured interior-door write is an example of that boundary. At runtime,
file call site `0x8ca6` received a descriptor for a `dor*` slot, node `7`, and
a position vector. Static code alone shows the node and operation, while the
particular door-slot value is loaded from a coroutine-local argument rather
than the indexed table. This distinction is preserved in the report.

## Browser policy

The common object callback `0x0c2de638` is not animation evidence. Drawers,
hinged doors, static furniture, and controller/proxy TASKs share it.

The browser may use:

1. a captured and numerically replayed operation;
2. a literal static descriptor such as `TOKE`;
3. model topology proving the affected pivot/leaf class.

An unbound static group or shared callback is not sufficient on its own.
