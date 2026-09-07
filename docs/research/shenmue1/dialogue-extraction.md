# Native dialogue extraction

Status: detailed extraction reference

Last documentation review: August 1, 2026

For maintained architecture and coverage interpretation, see
[Dialogue and scripting](../../implementation/scripting/README.md).
Generated evidence summaries are authoritative for counts; figures embedded
here describe the extraction checkpoint at which a method was documented.

`tools/scripting/extract_dialogue_inventory.py` inventories the original dialogue data
without converting or renaming it.

The game stores dialogue in `SCENE/<disc>/STREAM/*.AFS`. Each archive contains
voice `.str` members and, when subtitles are present, an `.SRF` member. SRF is
not treated as an unstructured string dump: each record has an exact speaker
block, text block, and authored timing/control block.

Native non-ASCII text is decoded as EUC-JP. The inventory preserves that
verbatim value as `sourceText` and also emits `displayText`, where the native
`＆` line-break marker becomes a newline and `=@` becomes an ellipsis. The
original representation is never discarded.

Run the inventory against locally extracted discs:

```sh
python3 -m tools.scripting.extract_dialogue_inventory \
  --disc-root 1:/path/to/disc1/data/SCENE/01/STREAM \
  --disc-root 2:/path/to/disc2/data/SCENE/02/STREAM \
  --disc-root 3:/path/to/disc3/data/SCENE/03/STREAM
```

The default output is `.disc-work/dialogue/inventory.json`. That directory is
ignored because a full inventory contains copyrighted dialogue. Use
`--without-text` when only structural coverage, hashes, speaker IDs, and exact
voice alignment are required.

A voice file is associated with a subtitle line only when the archive contains
one SRF member and the ordered voice count exactly equals its SRF record count.
The tool deliberately does not infer speaker names, conversation groups,
translations, interaction conditions, animations, or script relationships.
Those require additional native script or executable evidence.

## Exact room-script references

`tools/scripting/extract_dialogue_script_references.py` scans each room's
`MAPINFO.BIN` for exact null-terminated voice IDs that are already known from
the inventory:

```sh
python3 -m tools.scripting.extract_dialogue_script_references \
  --disc-root 1:/path/to/disc1/data/SCENE/01 \
  --disc-root 2:/path/to/disc2/data/SCENE/02 \
  --disc-root 3:/path/to/disc3/data/SCENE/03
```

Its default output is the ignored local file
`.disc-work/dialogue/script-references.json`. A match proves that the room
program names that exact voice resource. It does not yet prove the interaction
condition or branch that selects it; recovering that requires tracing the
surrounding SCN3 code.

## Native dialogue operations

`tools/scripting/extract_dialogue_operations.py` disassembles each room program and
extracts operation `0x006d` calls whose first argument resolves to an exact
known voice ID. It also records whether the next engine dispatch is operation
`0x00b2(0)`, the native global-dialogue-active check:

```sh
python3 -m tools.scripting.extract_dialogue_operations \
  --disc-root 1:/path/to/disc1/data/SCENE/01 \
  --disc-root 2:/path/to/disc2/data/SCENE/02 \
  --disc-root 3:/path/to/disc3/data/SCENE/03
```

The engine evidence for these semantics is:

- operation `0x006d` handler `0x0c16b27e` delegates through
  `0x0c0b41f0` to `0x0c0b4248`; that routine uppercases the supplied ID,
  searches loaded dialogue archives, and allocates one of two dialogue
  channels;
- operation `0x00b2` handler `0x0c16b2ba` calls `0x0c0b4774`; with argument
  zero it checks both global dialogue channels for active playback.

The native conversation consumer also calls `0x0c0b4774` with the currently
bound channel at the authored message deadline. If it is still active,
`0x0c0b448c` releases it. The next line is driven by the constructor's
cumulative presentation clock, not by an audio-ended callback. The reusable
`NativeDialoguePresentationTimeline` implements this behavior without tying
progress to render-frame count.

This remains below the interaction/condition layer. The call site still has to
be connected to its native invocation path and branch predicates before it can
be used as a source-backed click interaction.

The operation report also locates the longest contiguous table of
SCN3-relative executable pointers and records the nearest preceding target for
each dialogue call. This provides a reproducible entry point for control-flow
research. The table is not called a callback registry: static evidence has not
yet proved that role, and the relationship does not establish interaction
ownership or invocation conditions.

## Dialogue-bearing code regions

To retain all native operations surrounding each dialogue start, run:

```sh
python3 -m tools.scripting.extract_dialogue_code_regions \
  --disc-root 1:/path/to/disc1/data/SCENE/01 \
  --disc-root 2:/path/to/disc2/data/SCENE/02 \
  --disc-root 3:/path/to/disc3/data/SCENE/03
```

This writes ignored `.disc-work/dialogue/code-regions.json`. The report groups
numeric native operations between consecutive discovered executable targets,
resolves exact voice IDs, and records literal four-character actor arguments.
Those boundaries are navigation evidence, not claimed decompiler function
boundaries or interaction callbacks. The report also retains exact
AFS/SRF speaker provenance for each voice invocation. Native character-state
reads and writes are decoded there only for operation `0x01af` suboperations
`0x42` and `0x41`. The separately verified byte selectors 14/15, 55/56,
71/72, 73/74, and 75/76 remain neutral `native-game-state-byte-control`
operations in the event IR because their gameplay names and persistence owner
are unknown. Other suboperations remain numeric. Unknown operations remain
unknown. This is the reusable input for recovering conditions, actor actions,
camera instructions, flags, and object events without inventing semantics.

The extractor reads `tools/evidence/native-operation-semantics.json`. That
registry names only operations already proven elsewhere in the repository,
and every entry cites its evidence. Region operations refer to entries by
`semanticId`; adding an unverified label to the registry is not permitted.

Resolve every distinct operation in those regions through the captured
native dispatcher table with:

```sh
python3 -m tools.scripting.extract_dreamcast_operation_handlers \
  /path/to/verified/ram.bin \
  .disc-work/dialogue/code-regions.json \
  --out .disc-work/dialogue/code-region-operation-handlers.json
```

This adds exact handler addresses and code hashes, but not semantic names.

The first playable evidence chain is preserved in
`tools/evidence/d000-hato-dialogue-vertical-slice.json`. In addition to the
voice start and wait, its native code region reads and increments HATO's
per-character dialogue state through operation `0x01af`. The upstream
route is now exact through the persistent flag-bank read, 07:00–18:59 scene
hour, one-based scene selector 6, and spatial-record index 5. No story label
is assigned to the flag or spatial record.

The event IR now retains the compiler's exact operation-result destination
when generated code cleans its argument stack before storing the return.
This recovers Hato's `0x01af` read into coroutine frame dword `+0x00`.
`native_event_dataflow.py` emits a typed frame expression only for the complete
address-definition/load/arithmetic/store chain. Hato's native `+1` therefore
executes as ordinary recovered frame arithmetic before the `0x01af` write.

The browser-sized program builder starts from declared native entries and
closes over exact direct-call and child-coroutine edges. The Hato D000 program
currently contains 79 functions, 1,508 blocks, and 982 actions, including the
Hato voice coroutine. A production-shape interpreter test starts exact voice
resource pointer `0x000b0f48`, yields for `F1030B001`, resumes through the
native dialogue-active result branch, reads HATO's actor byte, executes the
recovered frame increment, and writes the incremented byte. The surrounding
room launch and staging path still retains explicit scheduler and unresolved
operation boundaries.

The first declared interaction is now playable without copying the coroutine
into handwritten gameplay logic. The generated route binds exact function
`0x7fa98` to its extracted HATO dialogue region and retains its upstream
bank-2 flag 100, 07:00–18:59, spatial-record-5, oriented-box, and raw-facing
requirements. `NativeScriptedEventRuntime` runs the interpreter until the
exact voice yield; `NativeScriptedDialogueSession` presents the extracted
voice and subtitle through the existing overlay; completion resumes the
coroutine and commits its actor-byte mutation atomically. Cancellation
discards the working mutation. The unimplemented prelude, postlude, cleanup,
and parent scheduler calls remain explicit and are not claimed as executed.

## Coverage report

The full inventories and operation lists are intentionally ignored because
they contain dialogue text and absolute local source paths. After regenerating
those reports, write the aggregate, source-control-safe coverage artifact with:

```sh
python3 -m tools.scripting.summarize_dialogue_evidence
```

The tracked `tools/evidence/dialogue-coverage.json` contains only counts and
disc/area coverage. It is deterministic and explicitly does not claim that
the script references have been mapped to actors, conditions, cameras, or
animations.

Classify the 1,285 recovered dialogue candidates by their exact normalized
native function structure with:

```sh
python3 -m tools.scripting.classify_dialogue_interaction_families
```

The detailed local report retains every candidate and family assignment at
`.disc-work/dialogue/dialogue-interaction-families.json`. The tracked
`tools/evidence/dialogue-interaction-families.json` contains aggregate counts
and the largest families without localized dialogue text. Voice pointers and
actor tags are replaced by typed placeholders only for the fingerprint; this
lets the same authored routine shape group across lines and actors without
claiming that family membership supplies a missing trigger or actor binding.

Recover literal arguments passed through generated dialogue-launch wrappers
with:

```sh
python3 -m tools.scripting.extract_dialogue_launch_arguments
```

The compiler passes native function arguments on its downward-growing stack.
This extractor uses exact `bsrf` targets, immediate stack cleanup, standard
frame offsets, literal loads, and unchanged caller parameters to propagate
values into operation-`0x0002` launch wrappers. The detailed all-map result is
kept at `.disc-work/dialogue/dialogue-launch-arguments.json`; the tracked
`tools/evidence/dialogue-launch-arguments.json` contains aggregate coverage
only. Multiple callers remain alternatives, and arithmetic or mutable-memory
loads remain runtime. Four-character values are retained as authored launch
arguments but are not labeled as clicked-object or actor ownership until a
native consumer independently proves that meaning.

The first such native consumer is independently reproducible with:

```sh
python3 -m tools.scripting.operations.extract_tagged_telm_control_operation_evidence
```

Operation `0x00f1` resolves argument 1 as a four-character scene-object tag
and then resolves the object's associated `TELM` record before dispatching
one of 18 numeric modes. The D000 telephone wrapper proves `TEL0` flows
through its exact context slot into that target argument. This establishes
the operation's target-object identity without yet claiming that the wrapper
tag is itself the player interaction trigger.

Mode 10 is now bounded further without assigning it an inferred gameplay
name. It clears the resolved `TELM` record's primary link to `-1` and writes
`21` to controller field `+0x013c`. The native controller update routine
copies that field into its state dispatcher, dispatches exactly 22 states,
routes state 21 to `0x0c16f8a8`, and writes the resulting state back to
`+0x013c`. This proves an exact controller-state transition, but does not
yet prove whether that transition means enable, disable, reset,
registration, or another higher-level action.

Current architecture, coverage sources, and active boundaries are maintained
in `docs/implementation/scripting/README.md`.

Compound generated predicates are recovered independently with:

```sh
python3 -m tools.scripting.extract_dialogue_predicate_routes
```

This symbolically executes both acyclic and cyclic MAPINFO scripted-event CFGs
across all three discs. It preserves SH-4 comparison operand order, the T bit,
generated `subc` boolean masks, mask composition, scene-field loads,
engine-operation results, and stack saves across calls. Cyclic joins converge
by fixed point where boolean absorption is exact; irreducible recurrences are
widened to an explicit opaque path-join term instead of guessed. The current
corpus has 538 guarded routes to dialogue descendants, including 197 formulas
with no opaque term. Of 11,998 functions, 7,174 are exact acyclic traversals,
4,765 are fixed-point cyclic traversals, and only 59 hit the explicit state
limit. As a fixed validation anchor, Disc 1 D000 call `0x7ac72` recovers the
complete Hato gate: operation `0x0051(11, 100) == 0`, scene selector `+0x84 ==
6`, and signed game hour `+0xcc` between 7 and 18. Unsupported branch sources
and widened loop joins remain explicitly reported instead of guessed.

Operation `0x0051` is now identified at its real native boundary with:

```sh
npm run extract:dialogue-native-free-conversation
npm run extract:dialogue-actor-resources
```

It is the executable's free-conversation manager, not a generic
persistent-state dispatcher. Subcommand 11 in the Hato predicate still
exactly reads auxiliary state bank 2 at index 100, but that is one route
inside the larger conversation API. The verified handler loads up to twelve
authored room-person records, supports a 24-person dynamic pool, stores
120-byte runtime person records, selects the eligible current person, and
drives the native conversation state machine. The compact evidence covers
7,554 exact calls across 136 Disc 1–3 MAPINFO variants.

Ordinary scheduled-person records are now recovered at the matching native
boundary. During actor initialization the executable turns the actor
definition's four-character identity into a package resource name, requests
that name with type `BIN `, and stores the result at runtime actor `+0x9c`.
The free-conversation enumerator accepts only actors with a non-null `+0x9c`.
The byte-identical Disc 1–3 `HUMANS.AFS` archives contain 262 such `SCNF`
resources for 257 resource actor codes, covering 210 of the 219 scheduled
actor identities. Actor resource name and authored person identity are
preserved separately: `JONO` and `MTRI` both deliberately contain `YOPA`
person records. This prevents a tempting but false one-to-one name
normalization.

Those records also contain the native free-conversation message tables.
Executable opcode class `0x20` selects entries at `table + index * 0x10`;
the state machine resolves entry `+0` as source text and `+4` as the full
voice ID, passes `+8` as the four-byte local line code, and reads `+0xc` as a
float whose purpose is not yet asserted. All 262 tables validate. They
contain 28,049 entries, 22,397 unique voice IDs, and between 2 and 422 entries
per actor resource. Source text decodes exactly as EUC-JP. Exact voice-ID
joining reaches 26,878 entries in the dialogue subtitle inventory; the 1,171
unmatched entries are retained rather than substituted.

The report also joins required positive selector equalities to the generalized
operation-`0x0181` result routing and serialized spatial catalog. It currently
proves two D000 routes use authored record 5; the second remains opaque for
other reasons and is not promoted to runtime-ready.

The ordinary actor-interaction registration boundary is recovered with:

```sh
python3 -m tools.scripting.extract_dialogue_interaction_registration
```

This structurally identifies the generated setup routine shared by 54
MAPINFO programs, resolves each routine's exact caller, and recovers all four
SCN3-relative static inputs plus their room-scene field bindings. All 54
registrations resolve without a gap. The setup always initializes ten internal
slots and reads the first static input through operation `0x009a` at
`internalSlot * 13` dword indices. A distinct caller argument varies between
1, 2, 3, 5, 10, and 15 across rooms; it is retained as an unresolved control
value rather than mislabeled as the slot count. The other static inputs are
retained at exact addresses but are not asserted to have the same record
schema until their downstream consumer is recovered.

The native executable independently proves operation `0x01ae(0)` is a global
interaction-availability gate: it returns `-1` only if a fixed sequence of
runtime eligibility checks all pass, otherwise zero. It does not identify or
return the selected actor. Actor selection therefore belongs to the
room-owned registered state consumed after this gate, not to `0x01ae` itself.

Operation `0x0042` has a separate reproducible low-level extractor:

```sh
python3 -m tools.scripting.operations.extract_actor_momt_flag_operation_evidence
```

It verifies the executable handler, the actor-associated `MOMT` lookup, the
bit-zero mutation at record `+0x14`, and Hato cleanup's exact `AKIR` operand.
It does not assign an unproven gameplay name to that flag.

The shared numeric camera-state selector is independently reproducible with:

```sh
python3 -m tools.scripting.operations.extract_camera_state_mode_operation_evidence
```

This proves operation `0x000e` forwards its first argument unchanged to the
same camera-state selector used by the recovered event-camera request. Numeric
mode meanings remain unnamed unless separately proven.

Operation `0x001d`'s native three-vector behavior is reproducible with:

```sh
python3 -m tools.scripting.operations.extract_resolved_object_vector_operation_evidence
```

The report retains its exact source/operation flag masks and Hato postlude's
`AKIR` plus `r9 +0x00ec` dataflow. It deliberately does not invent coordinate-
space names for the direct and associated-object vector paths.

Operation `0x002d` modes zero, one, two, and eight are independently
reproducible with:

```sh
python3 -m tools.scripting.operations.extract_primary_runtime_state_operation_evidence
```

The report verifies all four native dispatcher targets, the exact shared state
writes, the mode-one transition callback, the mode-two and mode-eight boolean
predicates, Hato's prelude/cleanup calls, and the complete 2,150-call authored
inventory. Other dispatcher modes remain numeric and no unproven
lock/cinematic names are assigned.

Operation `0x00ac`'s direct byte write is independently reproducible with:

```sh
python3 -m tools.scripting.operations.extract_global_byte_state_operation_evidence
```

The extractor verifies the handler, setter, destination address, neighboring
consumer code, and Hato's value. It keeps the owning subsystem unnamed.

Operation `0x004c`'s native actor-associated record family is reproducible
with:

```sh
python3 -m tools.scripting.operations.extract_actor_lnwk_operation_evidence
```

The report verifies the operation thunk, LW command dispatcher and all five
native targets, actor resolution, and the associated `LNWK` record lookup.
`LNWK` remains the native tag rather than an invented expanded gameplay name.

Operation `0x004f` mode 6's bounded integer random result is reproducible
with:

```sh
python3 -m tools.scripting.operations.extract_bounded_random_integer_operation_evidence
```

The report verifies the complete native handler, shared random source, result
writer, and all 246 mode-6 calls in the all-disc event IR. Modes 0 through 5
remain comparison/conversion operations and are not assigned the random
semantic.

## Voice decoding

Native `.str` members use the SPSD container and Yamaha AICA ADPCM. The
project does not reinterpret that codec. Build or install
[vgmstream](https://github.com/vgmstream/vgmstream), then use the exact
inventory relationship to extract a line:

```sh
python3 -m tools.scripting.extract_dialogue_voice F1030B001 \
  --disc 1 \
  --output /tmp/F1030B001.wav \
  --vgmstream-cli /path/to/vgmstream-cli
```

The extractor rejects ambiguous IDs and non-SPSD payloads. An optional
`--provenance-output` records the archive, SRF member, record index, speaker
ID, and timing hash used for the extraction.

The complete actor-message voice join and native-payload audit is
reproducible with:

```sh
npm run build:dialogue-voice-sources
```

It looks up all 22,397 full voice IDs authored in the actor `SCNF` message
tables directly in the Disc 1–3 AFS member directories and hashes the native
SPSD payloads. It retains SRF subtitle/timing metadata only where the existing
ordered alignment proves that join. The audit currently finds 21,322 source
voices and 1,075 authored IDs absent from the available localized voice
archives. Native selector reachability proves that 13 of those absent IDs are
unreachable leading records in otherwise localized guard resources. The
remaining 1,062 IDs belong to 18 complete `/prj16sc` or `/prj16sc2` resources
with no localized subtitle or voice match anywhere in the all-disc inventory.
They are retained as unlocalized source records rather than counted as
actionable extraction failures. All 7,433 repeated source occurrences are safe
to compare by content: no same-ID byte-different disc variant exists. Content
addressing reduces the matched native corpus from 425,893,120 source bytes to
336,453,472 bytes. The compact report is
`tools/evidence/dialogue-voice-sources.json`; the per-line manifest is local
under `.disc-work/dialogue/actor-dialogue-voice-sources.json`.

Browser audio is deliberately generated in bounded packs rather than checked
in wholesale:

```sh
python3 -m tools.scripting.build_dialogue_voice_pack \
  --actor HATO \
  --output-dir /tmp/hato-voice/audio \
  --manifest-output /tmp/hato-voice/manifest.json \
  --base-url /audio/dialogue \
  --bitrate 32 \
  --vgmstream-cli /path/to/vgmstream-cli
```

`--actor` and `--voice-id` may repeat. Building the complete corpus requires
the explicit `--all` switch. Each source is re-hashed before decoding, then
encoded as mono 16 kHz AAC-LC in an MPEG-4 container. The default 32 kbps
target is intentionally optimized for the original low-fidelity spoken audio.
Output filenames use the voice ID so the browser can begin a line without
first downloading the complete manifest. The versioned deployment prefix
makes those URLs immutable. `--filename-mode content-hash` remains available
for bounded archival packs. The pack manifest preserves the voice-ID-to-URL,
source hash, and actor ownership mapping.

The full pack can be built and uploaded outside Git with:

```sh
python3 -m tools.scripting.build_dialogue_voice_pack \
  --all \
  --output-dir .disc-work/dialogue/voice-pack-v1/audio \
  --manifest-output .disc-work/dialogue/voice-pack-v1/manifest.json \
  --base-url https://YOUR-R2-DOMAIN/dialogue/voices/v1 \
  --bitrate 32 \
  --sample-rate 16000 \
  --filename-mode voice-id \
  --jobs 8 \
  --vgmstream-cli /path/to/vgmstream-cli

python3 -m tools.upload_dialogue_voice_pack \
  --audio-dir .disc-work/dialogue/voice-pack-v1/audio \
  --manifest .disc-work/dialogue/voice-pack-v1/manifest.json \
  --bucket newyokosuka \
  --prefix dialogue/voices/v1 \
  --env-file /path/to/private-r2.env
```

If bucket-scoped S3 credentials are not available, run the checked-in local
upload bridge with Wrangler's authenticated remote R2 binding:

```sh
npx wrangler dev \
  --config tools/r2-dialogue-upload-worker/wrangler.jsonc \
  --ip 127.0.0.1 \
  --port 8799

python3 -m tools.upload_dialogue_voice_pack \
  --audio-dir .disc-work/dialogue/voice-pack-v1/audio \
  --manifest .disc-work/dialogue/voice-pack-v1/manifest.json \
  --prefix dialogue/voices/v1 \
  --worker-url http://127.0.0.1:8799 \
  --overwrite
```

The bridge binds only to localhost and accepts only the
`dialogue/voices/` key family. It is a development upload path and is never
deployed as a public Worker. `--overwrite` avoids a redundant HEAD request on
the first complete upload. Omit it when resuming an interrupted upload so
objects with matching size and HTTP metadata are skipped.

Voice objects receive a one-year immutable cache policy. The manifest receives
a short cache policy so it can be corrected without renaming the prefix. The
uploader retries transient failures and does not publish the manifest until
every audio object in that run succeeds.
Generated audio and the private credential file must remain outside Git.

The verified local decoder used during recovery was official
`vgmstream-cli r2117` (Linux nightly archive SHA-256
`2f98c77f756079f63fbd119939067f1ed461d77e70993bc4cc372736d859c84a`;
binary SHA-256
`2b05458f470ac6e051848e08cbd6d31a074e1808a648e2c6007418ad4242fc58`).
The decoder is an external build dependency and is not committed.

## Actor resource messages and selector entry graphs

The scheduled-actor constructor resolves a `BIN ` child named from the actor
definition and installs it at actor runtime `+0x9c`. The free-conversation
enumerator yields exactly actors with that pointer. Across the byte-identical
Disc 1/2/3 `HUMANS.AFS`, this recovers 262 actor `SCNF` resources for 257
resource actor codes.

`extract_dialogue_actor_resources.py` decodes every native 16-byte message
entry selected by low opcode class `0x20`:

- `+0x00`: relative EUC-JP source-text pointer;
- `+0x04`: relative full voice-ID pointer;
- `+0x08`: four-byte local line code;
- `+0x0c`: finite native float, intentionally not named yet.

The corpus has 28,049 entries and 22,397 unique voice IDs. Exactly 26,878
entries join the independent subtitle/voice inventory by full voice ID.
Unmatched lines and source-path-prefix mismatches remain explicit.

Static pointer `+0x14`, copied to runtime `+0x40`, is a selector bytecode
stream rather than a flat entry list. Run:

```bash
npm run extract:dialogue-actor-entry-routes
```

The extractor reproduces native selector `0x0c15b3f8` and expression
evaluator `0x0c15b10a`. It bounds the selector stream at the message-table
pointer from static `+0x18`, then builds a graph keyed by stream offset and
the last canonical expression result. The graph preserves:

- typed RPN operands and exact native operator numbers;
- conditional and unconditional signed relative branches;
- cycles and converging paths without expanding path-condition combinations;
- high-nibble `0x10` markers and their exact returned entry bodies;
- native null returns, including the common `0xff` sentinel.

All 262 resources decode without an out-of-bounds edge or truncated
expression. The corpus contains 48,434 graph states, 51,906 edges, 4,327
reachable entry markers, 9,937 marker/expression-state variants, and 254
unique canonical predicate expressions. Native evaluator `0x0c15b10a`
proves ordered operations 9–12 as greater-than, greater-than-or-equal,
less-than, and less-than-or-equal using the lower stack value as the left
operand.

This is only the entry selector. The returned bodies must next be decoded
with the separate main conversation interpreter before a marker can be joined
to its exact message-table selections and presentation commands.

For browser use, run:

```bash
npm run generate:dialogue-selector-data
```

This deduplicates the five byte-identical archive repeats and emits the exact
bounded selector/body streams for all 257 unique actor resources. The payload
is 510,152 bytes before base64/build compression, rather than the 32 MB
forensic control-flow report. `NativeDialogueSelector.js` executes the native
instruction classes directly, evaluates predicates through the strict
three-state predicate runtime, and returns the exact marker/body offsets. If
a required story bank or actor-runtime value is unavailable, selection stops
as unresolved instead of choosing another entry.

The same generator writes one lazy browser message module per actor rather
than one game-wide dialogue bundle. These 257 modules retain all 28,049 exact
message records, native voice IDs/floats, source strings, and independently
joined display subtitles. `NativeDialogueBody.js` is a resumable interpreter:
it returns the next exact message group, native external event, lifecycle
transition, or unresolved state plus its continuation. Random blocks require
an explicit chooser, progress markers require explicit progress state, and
dynamic `+0x5c` continuations remain unresolved when unavailable. This avoids
flattening mutually exclusive branches or preloading every actor's messages.

The class-`0xC0` runtime writes are no longer skipped. The verified native
mid-opcode handler maps selectors 1/2 to manager bytes `+0x10/+0x11`,
selectors 3–6 to person bytes `+0x0b` through `+0x0e`, and selector 7 to a
sign-extended person dword at `+0x10`; other selectors perform no write. Only
selectors 2 and 7 occur in the recovered corpus. Their four exact
target/value combinations and counts are retained in the body evidence, and
the browser interpreter records those manager/person fields in its resumable
state.

## Conversation progress and yielded bytecode

The main conversation interpreter is resumable. It deliberately yields while
text, animation, presentation, or input is active, then continues from native
runtime state. Run:

```bash
npm run extract:dialogue-progress-state
```

The game keeps 325 twelve-byte progress records at `0x0c222f40`, indexed by
runtime person halfword `+0x18`. The first four halfwords hold observed
selected-entry, continuation, boundary, and latest/resume offsets relative to
the actor's routing base at runtime `+0x40`. The final dword is a little-endian
float initialized from the executable's `0x41100000` (`9.0`) literal and
compared as a per-record metric threshold during native person selection.

This resolves an important apparent ambiguity in opcode `F2`. The handler
first yields with current pointer `opcode + 1` and state 5. The later
state-completion update advances that pointer by three, producing an effective
structural continuation at `opcode + 4`. It is therefore neither a
one-byte instruction nor an assumed four-byte fallthrough. The evidence also
records the one-shot continuation written by class `0x80`, the signed 24-bit
target written by `F5`, and the explicitly dynamic `F9` resume boundary.

Body extraction must carry these progress fields and runtime continuation
pointers as symbolic state. Any path requiring an externally populated
deferred pointer remains unresolved rather than being replaced with linear
scanning.

`NativeDialogueProgressState.js` implements the same 325 × 12-byte layout for
the browser runtime. It stores all four routing halfwords relative to the
actor's routing base, initializes the final threshold float to `9.0`, retains
its raw bits, and supports byte-exact serialization. A changed selected entry
clears continuation, boundary, and latest/resume state exactly as the native
selection update does without overwriting that threshold.

The same runtime class executes state-5 completion. It takes the ordinary
three-byte deferred advance unless runtime flag `+0x1e` has bit 0 set and bit
6 clear. In that guarded case it reads the record-`+0x02` routing-relative
big-endian signed-24 displacement, retains its operand end as runtime `+0x5c`,
updates current pointer `+0x58`, sets bit 7 for a nonzero displacement, and
clears bit 0. Zero displacement explicitly clears `+0x5c`.

The executable also contains the exact identity-to-progress-index table at
`0x0c278d08`. Its 301 four-byte entries provide 277 unique named actor
identities and 24 null holes at fixed indices `0`–`300`. The native allocator
uses the remaining 24 progress records, indices `301`–`324`, as a separate
runtime pool for identities absent from the fixed table. That pool starts
with cursor `23` and 24 identity words set to `0xffffffff`. Existing dynamic
identities reuse their slot; a new identity increments and wraps the cursor
before replacing one slot. Fixed lookup result zero is treated as unresolved,
so `AKIR` follows the dynamic path in this allocator despite physically
occupying fixed table slot zero. `NativeDialogueProgressIndexAllocator`
reproduces these rules and serializes the dynamic identities and cursor. Run
`npm run generate:dialogue-progress-index-data` after refreshing the evidence;
the browser then resolves fixed actors through the generated table. Unknown
identities deliberately return no fixed index rather than inheriting native
lookup result `0`, which is Ryo's `AKIR` record and only becomes meaningful
after the native dynamic allocator has run.

Run `npm run generate:dialogue-actor-runtime-data` to join every exact
HUMANS.AFS actor conversation resource to that progress system. The generated
runtime catalog has all 257 unique resources: 240 use a fixed native record
and 17 explicitly require the dynamic pool. The join uses the authored person
identity inside each SCNF record, not its archive resource name. This preserves
the native `JONO -> YOPA` and `MTRI -> YOPA` aliases instead of allocating
three independent conversation histories. `NativeDialogueActor` exposes the
descriptor and resolves its progress record through the exact allocator.

The body interpreter now executes both progress-aware instruction families.
Class `0x90` writes the following routing-relative offset into record `+0x00`
and clears runtime continuation `+0x64`. Class `0x10` applies the native
record `+0x00/+0x02/+0x04/+0x06` ordering, clears record `+0x02`, and yields
in state 5 when it redirects through the saved continuation. If no progress
context is supplied, either instruction remains explicitly unresolved.

## Actor conversation body graphs

Run:

```bash
npm run extract:dialogue-actor-body-routes
```

The extractor verifies all four native opcode handlers, the outer dispatch
loop, the start-pointer selector, and the separate nested message constructor.
It then begins at all 4,327 selector-returned bodies and carries the one-shot
runtime `+0x60` continuation through the graph. Shared routines outside a
marker's encoded span remain valid, but no edge may leave the actor's bounded
routing stream.

Low class `0x20` is not treated as an isolated subtitle. It starts the nested
constructor, which follows its own branches and gathers all selected message
indexes until an opcode is returned to the outer interpreter. This recovers
10,672 message groups and 26,215 distinct resource/message-index joins. BOB's
single conversation body independently resolves all ten authored message
entries in their nested branches.

Decompiler and instruction-level recovery of the complete nested constructor
at `0x0c15b5a8` proves that a group containing multiple message indexes is an
ordered presentation program, not a candidate pool. Each class-`0x20` record
adds a message command while the constructor also accumulates speaker routing,
text/voice timing, and presentation flags. The constructor returns only when
it reaches an outer-control boundary. A browser implementation must therefore
present the resolved records in stream order; selecting only the first record
or choosing one record randomly discards authored conversation turns.

Random choice occurs only at explicit `E0` blocks. The native constructor
multiplies its random float by the encoded block count, floors the result, and
uses three persistent history slots. For the first three `E0` operations of a
new construction it compares the new choice with the corresponding previous
slot. A repeat moves to the preceding choice, wrapping choice zero to the final
choice, then overwrites that slot. `NativeDialogueRandomState` reproduces this
exact three-slot anti-repeat behavior and serializes the persistent slots while
leaving the per-construction cursor transient.

`NativeDialogueSession` is the first reusable runtime composition boundary. It
joins an exact actor resource to its fixed or dynamic progress record, runs the
native selector with explicit predicate inputs, initializes the selected body,
executes state/progress writes, follows explicit `E0` branches, and lazily
resolves every ordered message record. Native events and unresolved
continuations remain explicit yields. The session does not yet invent handling
for those event opcodes or a generic proximity-to-actor launch rule.

The command records emitted at `0x0c222c00` are sixteen bytes. Message commands
store cumulative presentation time at `+0x00`, the message record at `+0x04`,
the resolved speaking actor at `+0x08`, and the resolved counterpart at
`+0x0c`. The constructor derives those actors from the first byte of the
message's native local code: `A` indexes participant-table slot zero, `B` slot
one, and so on. This is more authoritative than a subtitle dump's generic
speaker label. `NativeDialoguePresentation` now exposes
`nativeParticipantCode` separately, so BOB's `B001` is routed to `BOB_` even
though its subtitle inventory label is `XXXX`.

For a nonzero message-record float, the constructor adds the exact
`0x3f000000` half-second pad. The browser exposes that result as
`nativeDurationSeconds`. A zero float instead invokes a piecewise calculation
over the original EUC-JP source byte length: subtract six framing bytes, use
multipliers 10, 5, 4, or 3 at total byte-length boundaries 12, 18, and 24,
then divide by 30. The extractor now carries the exact source byte length into
the 1,150 zero-float generated records, so the browser executes this path
without estimating from JavaScript Unicode string length.

The browser now preserves the constructor's complete ordered presentation
program rather than discarding non-message commands while collecting line
indexes. Class `0x30` commands advance the native clock by exactly one
thirtieth of a second. Class `0x60` and the `FC` command are retained at zero
duration. Commands `0x014..0x01d` and `0x078..0x081` propagate native flag two
to the following message; `F6`, `F7`, and `F8` propagate flag four. Raw command
words, source offsets, flags, runtime writes, and progress markers remain in
the session result. Their gameplay names remain intentionally unset until
their consumers are proven.

The report retains 494 dynamic boundaries. Of these, 471 require a runtime
continuation from `+0x5c` inside a nested message program, while 23 permit a
progress-table redirect at a class `0x10` marker. They are evidence gaps, not
decode failures or permission to scan adjacent bytes.

## Predicate value sources

Run:

```bash
npm run extract:dialogue-predicate-values
```

The exact value resolver maps expression types 2, 3, and 4 to the native
free-conversation state banks exposed by operation `0x0051` suboperations
11–16. Their proven capacities are 1,024 bits, 64 bits, and 32 bytes. The
engine stores them at `0x0c223ef8`, `0x0c223ef0`, and `0x0c223f78`.
`0x0c159290` clears every byte when starting fresh. Native save export/import
copies bank 2 to/from save offset `+0x130` (128 bytes), bank 3 at `+0x128`
(8 bytes), and bank 4 at `+0x230` (32 bytes). The browser runtime mirrors
these exact layouts in `NativeDialogueState`; individual flag meanings remain
unlabeled until script or executable evidence proves them.

The outer conversation interpreter itself mutates bank 2: low opcode class
`0x60` sets its encoded bit and class `0x70` clears it through the same native
writer at `0x0c159076`. `NativeDialogueBody` therefore requires an explicit
bank writer for either opcode and stops unresolved if none is supplied. It
does not skip story progression merely to reach the next subtitle.
Type 1 is a literal; the `0x40/0xfff` encoding is the special literal `-1`.

Runtime-component modes 0–5 read the native calendar at `0x0c225228`:
year since 1900, month, day of month, weekday, hour, and minute. The calendar
increment routine proves the field ranges, while the setter recomputes byte 3
with the Gregorian leap-year formula. Weekday values are Sunday `0` through
Saturday `6`. The seventh byte is a sub-minute tick and has no predicate mode.
Mode 6 reads persistent-value selector 2 at save-state offset `+0x18`. Native
operations `0x005f` and `0x0060` expose the same selector to scripts. The
capsule-toy payment path reads selector 2, subtracts exactly 100, and writes it
back; vending affordability and `MONEY_LOCK` independently identify it as the
yen balance.

Type 5 uses encoded value zero for the current conversation actor. A nonzero
value indexes the same verified 301-entry identity table at `0x0c278d08` used
by native dialogue progress. The engine resolves that four-character identity
against resident scheduled actors and returns actor runtime field `+0x90`.
Scheduled-actor descriptor operation `0x0f` is the exact producer: handler
`0x0c119622` copies its dword payload into that field. The runtime, server
protocol, and dialogue predicate adapter preserve the authored integer; they
do not invent names for its numeric meanings.

Type 6 indexes a 13-record table embedded at `0x0c2791c0`.
Each 20-byte record contains a four-byte map identity, XYZ center, and squared
radius. The predicate requires the current map to match and tests strict
X/Z distance against the radius; the stored middle coordinate is not compared.
Ten records cover D000 and three cover MFSY, and all thirteen indexes occur in
the actor predicate corpus.

The native evaluator also proves ordered comparison direction. Opcodes 9–12
are `>`, `>=`, `<`, and `<=`, respectively, with the lower stack item as the
left operand. Across the 254 unique predicate ASTs, state-bank-2 values
dominate; no per-actor predicate meaning is inferred from that frequency.

`generate_native_dialogue_predicate_data.py` reduces this evidence to a
browser module, and `NativeDialoguePredicate.js` evaluates the exact AST
families with three-state results. Calendar, yen, and spatial inputs can
resolve directly. Missing state-bank or actor-runtime inputs produce an
explicit unresolved result; they never silently become zero or select a
fallback conversation.

## Live emulator validation of operation `0x000a`

`tools/emulator/validate_spatial_bounds_query_emulator.py` observes naturally executed
handler, result-writer, and return boundaries through Flycast's GDB stub. The
debugger installs software breakpoints at the cached P1 execution addresses
and maps Flycast's reported P0 PCs back to those exact breakpoints. Stepping
requires removing the P1 breakpoint, single-stepping, and reinstalling it.

An isolated Disc 1 state was driven with ordinary controller input into two
authored JHD0 rectangles. One live call returned zero outside its normalized
X/Z bounds and left its result slot clear. A second returned one inside its
bounds and changed its result slot from zero to `0xffffffff`. No RAM was
written and no handler was invoked artificially. Exact provenance, float32
arguments, object positions, results, and capture hashes are committed in
`tools/evidence/live-spatial-bounds-emulator-evidence.json`. This validates
the zero-translation false and true paths; the optional translation-object
path remains explicitly unvalidated.

## Resumable scheduler and coroutine-frame execution

The control-flow extractor recovers the generated `r8+0x2c` dispatch ABI only
when selector `r5`, word count `r7`, the `r13` argument vector passed through
`r6`, and the post-call result test are all exact. Selector zero with one
constant word and the `0x00010000` result-bit test compiles to
`native-scheduler-countdown`, matching executable handler `0x0c16b47c`.
The browser follows the recovered branch and yields only at the generated
`r8+0x3c` continuation transfer. Unknown scheduler selectors fail closed.

Constant width-preserving writes into the current `r14` coroutine frame and
`r9` scene state, masked scene-byte comparisons, exact direct-call result
targets, and proven masked callee returns are separate typed IR forms. This
preserves authored local initialization, branch state, and call results
without attaching inferred labels to numeric offsets.

## Browser execution of participant FACE commands

`NativeDialogueSceneStaging` now connects recovered presentation commands to
the stable scheduled-actor instance selected for conversation. Commands
`0x14`–`0x1d` install the indexed SCNF FACE target and activate it; commands
`0x78`–`0x81` update the target without activating an inactive route. Native
scene X is negated through the same established Dreamcast-to-browser transform
used by scheduled actors, while Y and Z are preserved.

`ScheduledActorRuntime` applies an active FACE target after ordinary
authoritative placement, then releases it when the interaction ends. The
production-path regression executes CMAL's real selector, body program,
presentation timeline, and two authored `0x14` commands through this boundary.

## Live and browser execution of participant motion-point control

The much more frequent `0x32` participant command is no longer only a routed
but discarded command. Static code at `0x0c16175c` proves that an enabled
participant is resolved to its actor object, prior target and AKIR control are
reset, and a motion-point request is submitted at:

```text
[participant.x - 0.001, participant.y, participant.z]
```

with native up axis `[0, 1, 0]`. The selected participant and control flag are
stored in their corresponding active-table slot, and the enabled flag is
consumed before the handler exits.

`tools/emulator/validate_dialogue_participant_control_emulator.py` independently
followed a naturally initiated Dobuita conversation from handler entry through
the request and handler epilogue. The live participant was `HREO` in slot one;
its target delta was `[-0.00099945068359375, 0, 0]`, its position was
unchanged, and the slot-one enabled flag transitioned from one to zero. The
isolated Flycast/disc/state/capture hashes and exact registers and RAM values
are retained in
`tools/evidence/live-dialogue-participant-control-emulator-evidence.json`.
There were no guest writes or artificial handler calls.

`NativeDialogueSceneStaging` now forwards the exact motion-point offset only
when the routed participant FOURCC matches the stable scene actor selected by
the player. Native X is negated into browser coordinates, so the recovered
offset becomes `[0.001, 0, 0]`. `ScheduledActorRuntime` reapplies that relative
target after authoritative schedule placement and clears it with the rest of
the dialogue staging. It assigns no guessed animation name, duration, easing
curve, or alias fallback.

## What “story flags” actually are

The simple mental model is correct: scripts test stored values, and eligible
branches run. The native representation is broader than Boolean flags:

| State | Native shape | Typical use |
| --- | --- | --- |
| Story banks | Bits and bytes in banks 2, 3, and 4 | Long-lived story and conversation conditions |
| Dialogue progress | 325 fixed 12-byte records plus 24 dynamic identities | Selected entry, continuation, repeat prevention |
| Actor state | Sparse bytes and live actor/controller records | Per-person progress, motion, facing, look, availability |
| Scene state | Fields, object records, layer flags, transitions, resources | Current room and event lifetime |
| Global controller state | Event words, status fields, control bits | Persistent room-owned dispatch |
| Calendar/economy | Date, hour, yen and other numeric values | Eligibility and branches |
| Spatial state | Actor positions and exact authored X/Z bounds | Trigger and route conditions |

The recovered story banks are:

| Bank | Storage |
| --- | ---: |
| 2 | 128 bytes / 1,024 bits |
| 3 | 8 bytes / 64 bits |
| 4 | 32 bytes, accessed as bytes or bits according to the native operation |

Numeric identities are preserved until their meaning is independently proved.
The runtime does not rename an unknown byte “met Charlie” merely because a
nearby line makes that interpretation plausible.

The dialogue progress table is exactly 3,900 bytes:

```text
325 records x 12 bytes

selected entry offset       uint16
continuation offset         uint16
authored boundary offset    uint16
latest resume offset        uint16
auxiliary metric            float32 bits
```

The 24-entry dynamic identity ring stores original four-byte actor identities,
not display names. Random-selection history retains three optional byte values
to reproduce native anti-repeat behavior.
