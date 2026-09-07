# Dialogue extraction tools

Commands below run from the repository root unless noted otherwise.
Raw disc inputs and captures are local, ignored prerequisites; a clean clone
does not contain them. See [runtime asset setup](../runtime-assets.md) for
the separate published-asset restore workflow.

### All-disc dialogue call graph

`extract_dialogue_call_graph.py` resolves direct SCN3 `bsrf` calls,
operation-`0x0002` child-coroutine launches, and each SCN3 header's native
initial routine for every dialogue-bearing MAPINFO program in the local
all-disc research corpus. It follows executable control flow back from each
dialogue target but does not claim that every conditional branch is active.
The current report proves modeled launch paths for 1,278 of 1,285
dialogue-bearing regions. The other seven retain their exact terminal
generated-function ancestors as unresolved indirect-scheduler roots; they are
not promoted to launches without runtime or public-export-table evidence. The
full graph stays under ignored
`.disc-work/dialogue/call-graph.json`; aggregate counts are copied into
`tools/evidence/dialogue-coverage.json`.

```bash
npm run extract:dialogue-call-graph
python3 -m tools.scripting.summarize_dialogue_evidence
```

`extract_dialogue_launch_arguments.py` continues across the wrapper boundary
that the call graph deliberately leaves numeric. It recovers direct-call
arity from the compiler's exact post-call stack cleanup, resolves literal
register loads and unchanged incoming frame arguments, and substitutes those
arguments through exact `bsrf` caller chains into operation-`0x0002`
dialogue launches. Conflicting callers remain explicit alternatives; computed
or mutable values remain runtime. Its detailed result stays under ignored
`.disc-work/dialogue/dialogue-launch-arguments.json`, while the source-safe
aggregate is `tools/evidence/dialogue-launch-arguments.json`.

```bash
npm run extract:dialogue-launch-arguments
```

`extract_resolved_object_vector_lifecycle_evidence.py` verifies the exact
operation-`0x0018` vector initializer and both authored operation-`0x0019`
query routes. In addition to 2,001 selector-`-1` base queries, all 565
well-formed indexed queries scan the literal `MOTM` record's 72-byte
component list, copy a matched matrix translation, and use the direct inverse
point transform or associated path selected by the exact flag. Missing records
or selectors fall back to the corresponding base-vector read. Exact list and
transform state remain runtime prerequisites.

```bash
npm run extract:resolved-object-vector-lifecycle
```

The first recovered wrapper context can be followed into an exact native
consumer with `extract_tagged_telm_control_operation_evidence.py`.
Operation `0x00f1` resolves its second argument through the scene's
four-character object registry and then retrieves that object's associated
`TELM` record. The D000 telephone family proves `TEL0` reaches that argument
through generated state at `r9+0x02e8`. The same evidence verifies the
complete 18-entry dispatch table without assigning meanings to every entry.
Mode 4 returns the `TELM` primary-link dword at `+0x00`. Mode 10 clears that
link, writes controller state 21 at `+0x013c`, and the native 22-state
controller update dispatches that value to its dedicated handler at
`0x0c16f8a8`. The gameplay-level name for state 21, the other 16 modes, and
the higher-level clickable-trigger relationship remain unresolved.

```bash
npm run extract:tagged-telm-control
```

`extract_indexed_binary_record_operation_evidence.py` verifies operation
`0x0065`'s handler, bounded 68-byte primary/mirror writer, and low-index
callback routine against exact executable byte hashes. All 426 authored calls
write zero or one. Indices below 128 update the primary record; indices below
32 additionally update the mirror record, callback low word, two
class-selected global bitfields, and their union. The callback class word is a
required runtime prerequisite and is never defaulted.

```bash
npm run extract:indexed-binary-record
```

`extract_hndl_hndr_vector_operation_evidence.py` verifies operation `0x005e`
against the exact handler, associated-record resolver, vector installer, and
19-entry executable index table. A zero side selector resolves literal tag
`HNDL`; a nonzero selector resolves `HNDR`. A present record clears 71 vector
slots at `+0x4c`, installs 19 raw vectors, sets byte `+0x49`, and writes the
signed low-word duration clamped to one at `+0x4a`. Missing records are native
no-ops, while an unavailable source table remains an explicit interpreter
stop.

```bash
npm run extract:hndl-hndr-vector
```

`extract_hndl_hndr_controller_operation_evidence.py` verifies operation
`0x00df` against the exact handler, associated-record resolver, request gate,
primary-controller clear, and controller initializer. Argument two selects
literal tag `HNDL` when zero or `HNDR` otherwise. The signed low byte of
argument one is admitted by the exact primary/nonnegative or
secondary/nonpositive controller-pointer gate. Admitted requests use argument
three's signed low word with the native range table and initialize the
selected raw controller state. A present primary controller has three dwords
cleared regardless of admission. Controller availability and range-selection
results remain explicit runtime prerequisites; neither is inferred.

```bash
npm run extract:hndl-hndr-controller
```

### Reachable native dialogue-code profile

`analyze_dialogue_reachable_sh4.py` starts at exact generated SCN3 function
entries and follows direct SH-4 control flow, compiler `braf` coroutine
resumes, and delay slots. This excludes embedded literal pools that a blind
linear disassembly mistakes for code. Across the modeled dialogue paths the
current corpus uses 40 SH-4 mnemonics and 58 normalized operand/addressing
forms, with no unresolved compiler `braf` target. The detailed per-map report
stays under ignored `.disc-work/dialogue/`; the source-safe aggregate is
`tools/evidence/dialogue-native-code-profile.json`.

```bash
npm run analyze:dialogue-reachable-sh4
```

### Branch-aware dialogue control-flow index

`extract_dialogue_control_flow_index.py` converts the recovered dialogue paths
into exact native basic blocks with branch successors, direct calls, child
coroutine launches, operation operands, dialogue targets, and recognized
`r9`-relative scene-field comparisons. Predicate recovery and operation
dataflow are separated into `native_event_predicates.py` and
`native_event_dataflow.py`. The scripted-event scope also retains exact
coroutine-frame predicates, operation result flows, child arguments, and
otherwise-unresolved indirect calls with their raw target-load provenance.
The detailed 64-room report stays at
`.disc-work/dialogue/control-flow-index.json`; its aggregate is
`tools/evidence/dialogue-control-flow-index.json`.

`extract_dialogue_control_dependencies.py` then performs branch-exclusive
reachability on that CFG. It accounts for the SH-4 compiler's boolean
normalization before `bt`/`bf`, retains exact direct-call and child-coroutine
edges, and follows only those edges to recovered dialogue regions. Compound
conditions that reconverge before an action remain unresolved. The
source-safe result is
`tools/evidence/dialogue-control-dependencies.json`.

`build_dialogue_interaction_candidates.py` keeps the larger research boundary
honest. Its ignored detailed report joins all 1,285 executable dialogue
regions to exact voice/subtitle provenance, actor tags, launch paths, and
proven trigger routes, and lists every missing prerequisite instead of making
those candidates clickable. The aggregate is
`tools/evidence/dialogue-interaction-candidates.json`.

`extract_d000_hato_conversation_flow_evidence.py` separately proves the
ordered Hato prelude, voice, postlude, and cleanup functions and retains every
native staging operation. The executable handlers now independently prove
operation `0x0028` as an actor motion request and `0x0029` as its controller
status-bit query. Their exact controller fields and Hato's one-based
`MOTION.BIN` requests are recorded in
`tools/evidence/actor-motion-operation-evidence.json`. Exact local constant
propagation resolves Hato's three runtime-looking actor loads to `AKIR`; the
browser plays those source clips directly and waits for the postlude clip
without adding the generic emote blend phases.

The adjacent operation `0x002c` is independently proven as native actor
look-point control. Its handler installs a 24-byte `LKPT` record, copies the
supplied three-float world target exactly, maps the signed selector into the
actor controller, and releases/resets it through negative selector forms.
`tools/evidence/actor-look-point-operation-evidence.json` records the exact
Hato dataflow: selector 15 targets the room-VM vector at `r9 +0x0d4` with a
`1.600000023841858` Y addend, and signed selector -16 later releases it. The
generated browser catalog retains that instruction but does not approximate
the unresolved joint/interpolation behavior with whole-body root rotation.

`extract_actor_look_point_update_operation_evidence.py` verifies all 290
operation-`0x016c` calls as the optimized sibling of that controller. An
active `LKPT` record receives the supplied or controller-default vector,
exact `0x8065`-guarded selector-word synchronization, and an auxiliary-dword
clear. Missing actors/controllers and terminal state one are native no-ops.
An inactive record or controller flag `0x40` delegates to the full
operation-`0x002c` controller and remains an explicit runtime stop.

```bash
npm run extract:actor-look-point-update
```

`extract_actor_mhnd_operation_evidence.py` verifies the exact four-route
operation-`0x0081` handler and the authored subset of its `MHND` controller.
All 796 calls use selector `-1`, zero, one, or two. The reset route installs
state 14 and timing pointer `0x0c288380` in both scheduler records. Timed
channels copy exact runtime source snapshots and native static target rows
into one or both subcontrollers, then derive twenty signed-truncating delta
dwords. All 114 dialogue calls use these recovered paths. The two
duration-one direct-action calls remain explicit stops, and the native
selector `-2`/`-3` routes have no authored calls.

```bash
npm run extract:actor-mhnd
```

`tools/evidence/event-camera-operation-evidence.json` continues the Hato
trace through the native camera subsystem. Operation `0x0009` suboperation
`0x10` multiplies the executable's normalized 15-bit LCG result by its
authored float bound. The prelude uses bound three and passes authored
event-camera number `2950`, `2952`, or
`2954` to operation `0x0011`; that handler installs the exact three-word
request and selects camera mode 6. The generated catalog retains those source
IDs without guessing equivalent browser camera angles while the ECAM
binary/player adapter remains unresolved.

Run the reusable ECAM extractor with:

```bash
npm run extract:d000-event-cameras
```

The D000 source-safe output is
`tools/evidence/d000-event-camera-catalog.json` (178 cameras). Each record
retains its flags and parallel time/value/slope arrays for position XYZ,
target XYZ, optional roll, and optional perspective.

The same extractor also has a `scripted-events` scope. It starts at the SCN3
initial routine and every exact operation-`0x0002` child-coroutine target,
rejects calls in unreachable bytes, then follows exact direct calls and
further child launches. It deliberately does not promote the broad executable
target table into an engine callback registry. `compile_native_event_ir.py`
turns that graph into a lossless block/action IR. Proven operation families receive adapter IDs from
`tools/evidence/native-operation-semantics.json`; unknown operations remain
numeric. The complete reports are ignored because they are hundreds of
megabytes, while their source-safe summaries are:

- `tools/evidence/scripted-event-control-flow-index.json`
- `tools/evidence/native-event-ir.json`

```bash
npm run extract:dialogue-control-flow
npm run extract:dialogue-control-dependencies
npm run extract:dialogue-predicate-routes
npm run extract:dialogue-native-free-conversation
npm run extract:dialogue-actor-resources
npm run extract:dialogue-actor-entry-routes
npm run generate:dialogue-runtime-catalog
npm run build:dialogue-interaction-candidates
npm run extract:scripted-event-control-flow
npm run compile:native-event-ir
npm run build:dialogue-gameplay-effects
npm run build:sound-command-evidence
npm run build:actor-momt-mask-evidence
npm run extract:coroutine-deactivate
npm run extract:operation-0009-numeric
npm run extract:scn3-runtime-interface
npm run extract:resolved-object-vector-lifecycle
npm run extract:global-runtime-word-bit
npm run extract:named-resource-residency
npm run extract:scene-eight-channel-transition
npm run extract:face-record-control
npm run extract:face-record-parameters
npm run extract:global-signed-word-divmod
npm run extract:ccow-mask
npm run extract:refb-value
npm run extract:fixed-global-dword
npm run extract:global-controller
npm run extract:indexed-binary-record
npm run extract:hndl-hndr-vector
npm run extract:hndl-hndr-controller
npm run extract:actor-look-point-update
npm run extract:actor-mhnd
npm run extract:actor-controller-word
npm run extract:actor-field-7c
npm run extract:fixo-reset
npm run extract:global-controller-byte-selection
npm run summarize:dialogue-evidence
npm run extract:d000-hato-flow
```

The all-disc scripted-event control-flow command analyzes independent MAPINFO
programs with six worker processes. Direct invocation can select a different
count with `--workers`; worker completion order never changes generated map
ordering.

`extract_global_controller_operation_evidence.py` verifies operation `0x0116`
selectors zero, two, and three against five protected executable ranges and
every referenced global/helper literal. Selector zero initializes nineteen
exact fields and calls the proven range helper; selector two conditionally
performs the native cleanup for modes two through six and clears five fields;
selector three returns the exact secondary-index status expression. Together
these cover 407 authored calls, including 87 dialogue-region calls. Selectors
`-1` and one remain unresolved because they enter the larger shared state
machine.

`extract_actor_controller_word_operation_evidence.py` verifies all 631
operation-`0x009c` calls and all 351 operation-`0x009d` calls. For `0x009c`, a
resolved actor with a `MOTM` controller receives
argument one's low word at controller offset `+0x7c`; a missing actor is a
native no-op. A resolved actor without that controller follows the exact
current-scene registry unlink helper, retained by the runtime as an explicit
adapter. For `0x009d`, the five authored modes exactly control MOTM flag
`0x4000`, dword `+0x1cc`, and, on reset, words `+0x86`, `+0x90`, and `+0x9a`.
The numeric fields and modes are deliberately not given inferred gameplay
names.

`extract_actor_field_7c_operation_evidence.py` verifies operation `0x0121`'s
402 exact two-argument routes. Six authored modes write their numeric mode to
the resolved actor's dword `+0x7c`, and mode eleven reads it. The remaining 33
zero-, three-, and four-argument calls stay unresolved; the direct actor field
is not conflated with operation `0x009c`'s separate `MOTM` controller word.

`extract_fixo_reset_operation_evidence.py` verifies all 470
operation-`0x001b` calls. The handler resolves the actor's exact `FIXO`
associated record and clears three float words, three dwords, and two words at
their proven offsets. The native routine dereferences the resolved record
without a null guard, so unavailable FIXO state is an explicit interpreter
stop instead of an invented no-op.

`extract_global_controller_byte_selection_evidence.py` verifies operation
`0x0143` selector zero for 476 authored calls, including every dialogue call.
It writes two identical selected bytes, one secondary byte, and clears one
word at exact global addresses. The same helper is used by operation `0x0116`
selector two, so its formerly external active-reset cleanup is now executed by
the shared controller state. Six calls using selectors one, five, and seven
remain unresolved.

`extract_event_control_field_operation_evidence.py` verifies all 727 authored
operation-`0x0031` calls across 59 areas. The executable handler resolves the
current event record and returns one of eight exact unsigned byte/word fields
selected by argument zero. The runtime retains these as numeric event-control
fields and stops when current-event state is unavailable. This evidence also
keeps selector one distinct from D000's separately sourced logical-door
selector instead of joining them by proximity.

`extract_fixo_attachment_operation_evidence.py` verifies 563 complete
five-argument operation-`0x00e6` calls, including all 70 dialogue calls. It
proves the source `FIXO` record's four duplicated three-float ranges, target
actor link, and exact state/control fields selected by target `MOMT` and
numeric control lookup. The runtime requires those exact records, source
vectors, and target-controller inventory. Six zero-argument DSLT sites remain
unresolved instead of receiving guessed operands.

`extract_actor_osag_operation_evidence.py` verifies all 368
operation-`0x0132` calls, including all 69 dialogue calls. It proves the
optional `OSAG` linked-list head and next offsets, the exact node-byte rewrite
`(old & 0x0f) | 0x80`, and the nested actor flag-byte mask `0x10`. Native
missing-structure paths remain no-ops; runtime state that has not established
their availability stops explicitly.

`build_dialogue_gameplay_effects.py` derives a control-flow-preserving effect
catalog from dialogue-bearing functions in the native event IR. It includes
only operations whose low-level semantics are already proven, retains their
exact function/block/call provenance, and distinguishes fully static effects
from templates that still require a native runtime operand. It does not
flatten branches or execute every effect found in a dialogue function.

The complete local catalog is
`.disc-work/dialogue/dialogue-gameplay-effects.json`; its source-safe coverage
summary is `tools/evidence/dialogue-gameplay-effects.json`.
The runtime and persistence boundaries, current coverage, and fail-closed
rules are documented in `docs/research/shenmue1/dialogue-gameplay-effects.md`. The
authoritative consolidated architecture and current-status source map are in
`docs/implementation/scripting/README.md`.

`NativeEventInterpreter` executes this IR only along proven successors. It
supports direct calls, exact frame/scene/result predicates, child launch
arguments, operation-result stores, exact typed coroutine-frame additions,
constant width-preserving coroutine-frame and scene-field writes, masked
scene-field predicates, proven direct-call result propagation, and typed
yield/resume boundaries. Frame expressions require the complete generated
address-definition, load, arithmetic, and store def-use chain. The interpreter
stops before every unknown behavior. The native constructor, runner, and all
64 generated entry thunks classify all 50,521 `r8` calls as signed
division/remainder, two scheduler dispatch forms, secondary dispatch, or
continuation save. The 24,518 continuation saves are typed yields; unresolved
scheduler handlers remain explicit stop boundaries. Resumable scheduler calls
with the complete selector-zero/countdown/result-bit shape compile as
`native-scheduler-countdown`; other handler shapes remain unresolved.

`build_native_event_program_pack.py` keeps the 388 MB complete local IR out of
the browser. Its route manifest declares exact disc/area/entry identities, and
the builder retains every same-MAPINFO direct-call and child-coroutine target
reachable from each entry. It does not prune branches or flatten the graph.
The current bounded D000 pack contains three declared programs totaling 251
functions, 14,177 blocks, and 8,076 actions. It covers the Hato/entry,
telephone-book/persistent-owner, and selector-18 automatic-event closures.
The generated summary inside the pack is authoritative as routes expand.

The route manifest can also declare an exact scripted interaction entry that
is already inside that closure. The builder rejects entries without the
declared actor tag and voice region, then copies the extracted activation data
into the browser pack. `NativeScriptedEventRuntime` uses those declarations
without actor-specific gameplay branches: it evaluates the native
flag/hour/oriented-spatial gate, runs the voice coroutine, sends its yield
through the normal dialogue overlay, and resumes only after presentation
completes. Actor-byte mutations execute against a working copy and commit only
on successful coroutine completion.

```bash
npm run build:native-event-program-pack
```

Operation `0x013e` has a separate hash-pinned evidence extractor:

```bash
npm run extract:operation-013e
```

It verifies the complete handler, install, release, initialization, and slot
clear ranges plus all 530 authored calls. The compiler promotes only the exact
four-argument install and two-argument release shapes. Program-pack metadata
declares the exact static pointer pairs reachable from each bounded program;
the transactional runtime rejects any undeclared pair and keeps the native
70-slot boundary without assigning guessed filenames or gameplay roles.

`build_script_editor_import.mjs` translates that bounded recovered program
pack into `new-yokosuka-script-v1` graph documents and streams them to the Go
PostgreSQL importer. Native function payloads remain attached to graph nodes;
the command does not create an alternate file-backed script library. Imports
are keyed by separate source-artifact and translated-document hashes, making
exact reruns idempotent while retaining changed translations as new reference
versions.

```bash
DATABASE_URL=postgres://... npm run import:scripts
```

`build_script_translation_coverage.mjs` measures canonical scripting coverage
over the exact recovered dialogue-candidate corpus. Reviewed ownership mappings
live as immutable `script_version_native_dialogue_regions` rows on published
PostgreSQL versions and must name exact candidate identities. The builder
refuses to count an owner unless it is currently published, valid Yarn. It
writes the source-safe summary to
`tools/evidence/script-translation-coverage.json` and the row-level local report
to `.disc-work/dialogue/script-translation-coverage.json`.

```bash
npm run audit:script-translation-coverage
```

Override `NEW_YOKOSUKA_DATABASE_URL` only when auditing a different PostgreSQL
repository; the default is the worktree's regular local database on port 55434.

`extract_scn3_runtime_interface_evidence.py` verifies that ABI and the exact
dispatch/continuation pairing. It also inventories the 1,057 secondary
operations and proves selector 5 as a seven-word write to byte offsets 24–48
of one indexed 52-byte interaction record. The 262 calls with complete
arguments are executable; six incomplete selector-5 calls remain unresolved.
Selector-1 subcommands 1 and 12 add 98 exact raw interaction-context writes at
byte offset 56; all other selector-1 forms remain numeric.

`extract_coroutine_deactivate_operation_evidence.py` proves operation
`0x0003` as scheduler event-record flag-bit-zero deactivation.
`extract_operation_0009_numeric_evidence.py` proves every authored numeric
mode in operation `0x0009`, including the executable's binary-angle
sine/cosine algorithm and raw single-precision word boundary.

`extract_sound_command_operation_evidence.py` verifies operation `0x006c` as
an exact three-argument tail call into the shared sound-command dispatcher.
`extract_actor_momt_mask_operation_evidence.py` verifies operation `0x0040`
modes 1 and 2 as exact set/clear mask writes on an actor-associated MOMT
record. Both preserve their remaining numeric bank, command, and mask values.

`extract:dialogue-predicate-routes` symbolically executes both acyclic and
cyclic generated SH-4 event functions and retains compound branch formulas
guarding exact call paths to dialogue. Cyclic joins converge by fixed point
where exact boolean absorption is sufficient; irreducible joins widen to an
explicit opaque term. Its source-safe report is
`tools/evidence/dialogue-predicate-routes.json`; the complete local report is
`.disc-work/dialogue/dialogue-predicate-routes.json`. Unsupported expressions
and state-limit exits remain marked as coverage gaps.

`extract:dialogue-native-free-conversation` verifies the executable's native
operation-`0x0051` free-conversation manager, its authored person-record
loader, selection/update routines, and full conversation state machine. It
also inventories all 7,554 operation calls across 136 Disc 1–3 MAPINFO
variants. The source-safe schema and representative calls are in
`tools/evidence/dialogue-native-free-conversation.json`; the full local call
corpus is `.disc-work/dialogue/native-free-conversation.json`.

`extract:dialogue-actor-resources` recovers the other half of that native
join. The scheduled-actor constructor looks up a `BIN ` resource using the
actor definition's exact four-character identity, stores the returned
payload at runtime actor `+0x9c`, and the free-conversation enumerator accepts
only actors with that field populated. The extractor inventories the exact
`SCNF`/`BIN` children in the byte-verified `HUMANS.AFS`, validates their native
record layout, and joins them to scheduled actor identities without using
display names or proximity. The source-safe inventory is
`tools/evidence/dialogue-actor-resources.json`; complete relative-pointer
records are in
`.disc-work/dialogue/actor-conversation-resources.json`.

The same extractor now decodes the native message table selected by
free-conversation bytecode opcode class `0x20`. Each exact 16-byte entry
retains its EUC-JP source string, full voice ID, four-byte local line code,
and still-unresolved native float. The corpus contains 28,049 entries and
22,397 unique voice IDs. An exact voice-ID join finds 26,878 entries in the
previously extracted subtitle inventory; 1,171 remain explicitly unmatched.
Native selector reachability classifies 13 of those unmatched entries as
unreachable localized guard records. The other 1,158 unmatched entries map to
1,062 unique IDs in 18 complete unlocalized `/prj16sc` or `/prj16sc2`
resources, rather than partial extraction failures. No message violates the
native invariant that its full voice ID ends with its four-byte local code.

`build:dialogue-voice-sources` resolves those full voice IDs against native
STR members across all three disc inventories and hashes every SPSD payload.
It does not infer audio from subtitle text or path prefixes. The compact
coverage report is `tools/evidence/dialogue-voice-sources.json`, while the
complete content-addressed source manifest remains in `.disc-work/dialogue/`.
`build:dialogue-voice-pack` accepts explicit actor codes or voice IDs, decodes
their verified SPSD sources with external `vgmstream-cli`, and creates a
deduplicated AAC browser pack plus a voice-ID URL manifest. It refuses an
unbounded build unless `--all` is passed.

`extract:dialogue-actor-entry-routes` recovers the selector program at static
record pointer `+0x14`, copied to runtime person pointer `+0x40`. It follows
the verified native control flow and emits a graph containing typed
reverse-Polish predicate expressions, signed branches, cycles, and exact
entry-body markers. It deliberately does not scan this region linearly:
entry bodies contain data that would become false selector opcodes outside
their native control-flow boundary. Full graphs are written to
`.disc-work/dialogue/actor-conversation-entry-routes.json`; compact corpus
evidence and AKMI/BOB_ anchors are committed in
`tools/evidence/dialogue-actor-entry-routes.json`.
