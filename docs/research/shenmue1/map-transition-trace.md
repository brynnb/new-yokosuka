# Shenmue map-transition trace

This document owns the native transition evidence and extraction workflow. See
[World loading and transitions](../../implementation/world-loading-and-transitions.md)
for the current `/play` registry, handoff lifecycle, and persistence behavior.

## Native transition request

The Dreamcast runtime uses a scene-context request containing an area ID,
scene/disc ID, entry ID, mode, and trigger bit. In the captured JOMO context:

| Address | Meaning |
| --- | --- |
| `0x8c3c522c` | request trigger |
| `0x8c3c5230` | four-byte area ID |
| `0x8c3c5234` | scene/disc ID |
| `0x8c3c5238` | destination entry ID |
| `0x8c3c523c` | request mode |

SCN3 engine operation `0x0030` is handled at `0x0c16b492`. It forwards the
three script arguments plus a derived mode to `0x0c0f0a86`. That routine
stores all four fields and sets bit 0 of the request trigger.

The addresses above are not a process-wide fixed global. The writer loads the
current scene owner through `0x0c217488`, calls `0x0c09766a` to resolve the
owner's context pointer at offset `+0x3c`, and writes the request at context
offsets `+0xcc` through `+0xdc`. The JOMO/Dobuita capture resolved that context
to `0x8c3c5160`; settled Disc 2 MFSY/MKSG captures resolved it to
`0x8c3c6320`. A direct-warp tool must follow that pointer chain each time
instead of retaining `0x8c3c522c` after a room load.

This closes the native meaning of operation `0x0030`:

```text
operation 0x0030(scene, four-byte area ID, entry)
```

## Hazuki interior front door

Flycast slot 1 placed Ryo inside the Hazuki Residence facing the main front
door. A synchronized recording loaded the state, pressed Dreamcast A, and
sampled the request record for 420 frames.

At recording frame 346 the request changed atomically:

```text
before:  trigger=0 area=JOMO scene=1 entry=0 mode=7
request: trigger=1 area=JHD0 scene=1 entry=2 mode=7
```

The engine cleared the trigger at frame 355. A later full-RAM capture retained
`JHD0, 1, 2, 7`, proving that `JHD0` was the completed destination rather
than an intermediate request.

The runtime tuple exactly matches the JOMO `MAPINFO.BIN` dispatch call:

```text
file offset 0x4434a
operation 0x0030
arguments 1, "JHD0", 2
```

Therefore the normal front-door transition is:

```text
JOMO (Hazuki Residence interior)
  -> JHD0, scene 1, entry 2 (Hazuki Residence exterior)
```

`BETD` is not the normal exterior destination. It is a separate Hazuki
exterior/Yamanose variant associated with the bad-ending scene.

Machine-readable evidence is in
`tools/evidence/jomo-front-door-map-transition.json`.

## Offline all-disc catalog

`tools/worlds/extract_map_transition_catalog.py` applies the proven operation
signature to every extracted `MAPINFO.BIN`. It classifies a call as exact only
when all three arguments are constants and the middle argument is a printable
four-character area ID. Calls with any runtime-selected argument remain
explicitly classified as dynamic.

The all-three-disc catalog currently contains:

| Result | Count |
| --- | ---: |
| MAPINFO files analyzed | 136 |
| MAPINFO parse failures | 0 |
| Maps with native transition calls | 117 |
| Transition calls | 233 |
| Exact calls | 213 |
| Dynamic calls | 20 |
| Literal calls recovered through local helpers | 131 |
| Unique exact source/destination/entry edges | 292 |

Regenerate it from selectively extracted disc files with:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 \
  tools/worlds/extract_map_transition_catalog.py \
  .disc-work/mapinfo \
  --out tools/evidence/map-transition-catalog.json
```

SCN3 header `+0x0c` ends only the primary program. Callback functions remain
executable until the static-data boundary at header `+0x10`; scanning only
the primary range silently loses door-return and event callbacks. The full
call evidence and deduplicated edge list are in
`tools/evidence/map-transition-catalog.json`. The captured JOMO front-door
call is linked directly from its catalog record, providing a runtime-validated
control case for the offline extraction.

Operation `0x019c` returns the current scene/disc number. Interior exit
callbacks use that value when calling the local transition helper, so their
door exits can be separated exactly from unrelated literal story/recovery
routes in the same room.

## Browser binding

The `/play` runtime binds JOMO object `dor0`
(`S1_JOMO_DR15_016.MT5`) to the captured front-door transition. Clicking that
door locks player movement, plays the door's reconstructed opening to
completion, and only then loads the browser's Hazuki Residence Grounds world
as native destination `JHD0`, scene 1, entry 2. The reusable binding registry is
`src/MapTransitions.js`.

The settled post-load RAM image resolves entry 2 to Ryo's native root
position `(-2.99000025, 1.14160156, 1.09000003)` and raw Y heading `2354`,
or `12.930908°`. Applying the established browser reflection produces X/Z
`(2.99000025, 1.09000003)` and yaw `-12.930908°`. Browser Y is deliberately
resolved from the walkable terrain because the native root Y is the animated
character root rather than the browser controller's feet height. The exact
addresses and root-matrix cross-check are recorded in
`tools/evidence/jhd0-entry-2-spawn.json`.

The browser grounds reconstruction now renders JHD0 geometry and the 32 live
placed instances recovered from the settled entry-2 RAM capture. An earlier
compatibility implementation combined BETD geometry with BETD's six static
records; that bad-ending variant did not represent the requested JHD0 runtime
world and visibly misplaced exterior objects.

### Old Warehouse District

MKSG contains exact literal dispatches to `MS08` entry 0 and `MFSY` entry 1:

```text
MKSG -> MS08, scene 2, entry 0  (call 0x24402)
MKSG -> MFSY, scene 2, entry 1  (call 0x247d6)
```

Saved-state RAM resolves the destination actor transforms without visual
estimation. MS08 entry 0 becomes browser position `(26.5, 0, -2.3)` and yaw
`50.0043°`; MFSY entry 1 becomes `(118, 0, -12)` and yaw `90°`.

The browser associates MKSG `dor3` with Old Warehouse No. 8 and `dor8` with
the compound exit. These two physical-door associations are map-topology
results, not captured clicks, and are labeled accordingly in
`tools/evidence/mksg-warehouse-door-transitions.json`. The other eight MKSG
door instances report that the warehouse is locked instead of opening as
generic doors.

MS08's `MAPINFO.BIN` has a native `DOOR` record at file offset `0x2b0bc`,
placing `S2_MS08_DR02_021.MT5` at browser position `(27.06, 0, -1.8)` with a
`90°` yaw. MS08 has no local literal operation-`0x0030` exit: the original
story sequence owns departure. `/play` therefore provides an explicitly
browser-authored reverse edge from that door to the exterior side of `dor3`.

The destination catalog proves transition tuples, but it does not generally
prove which clickable object selects each tuple. Keep that evidence boundary
explicit for later door bindings.

### Typed interior door controllers and CHRT model binding

The SCN3 static region contains a typed serialized door-controller record:

```text
+0x00  SCN3-relative object-name pointer
+0x04  native record field
+0x08  first sequential controller word (low 16 bits 0x02ab)
+0x0c  second sequential controller word
+0x10  type 2
+0x14  zero
+0x18  scale xyz
+0x24  position xyz
+0x30  fixed-angle field
```

`tools/worlds/extract_map_transition_objects.py` recovers 86 such records across all
three discs and joins 70 to exact same-MAPINFO destinations. It never uses
spatial proximity. `tools/worlds/build_browser_map_transitions.py` then joins the 12
free-roam Dobuita interiors to exact D000 Entry placements.

## Exact EVNT record formats and callback boundary

The all-map EVNT parser now streams mixed record payloads. Kind 5 is the
six-float origin/two-edge parallelogram described below. Kind 6 is:

```text
u32 flag
u32 kind = 6
u32 vertexCount
vertexCount * { f32 x, f32 y }
u32 0xffffffff
```

This decodes all 149 records in the 136 extracted MAPINFO files: 116 kind 5
and 33 kind 6, with zero opaque payload maps. Geometry alone does not make a
record a warp. A separate extractor scans every extended SCN3 executable
region for the static operation-`0x0001` callback-table installation and
validates each function pointer. Only D000, JD00, and JU00 install such
tables across the three discs (nine MAPINFO files and 36 callbacks). JOMO has
24 class-4 records per disc but no callback table, proving that its records
are geometry-only for the currently recovered event mechanism.

Door models are selected from native resource metadata. In particular,
`DYKZ/MPK00.PKF::CHARA.CHRT` serializes:

```text
DefImage(Object "DOR2", Image "DR02_024.MT5")
```

That exact binding resolves DYKZ's otherwise ambiguous `DR02_020` versus
`DR02_024` pair. The production audit loads all 12 selected MT5 files and
verifies the proven moving render node 12. `/play` places and picks those real
meshes; no estimated doorway cylinder or box is introduced. The remaining
unknown is the native Door Box extent, not the visual door or its route.

## Extraction boundary

Literal operation-`0x0030` calls can be enumerated from each `MAPINFO.BIN`
without activating the transition in the emulator. JOMO contains eleven such
calls, including the exact front-door tuple above.

Not every map exposes literal arguments:

- D000 has an operation-`0x0030` call whose three arguments are selected at
  runtime.
- BETD has no local operation-`0x0030` call.

Those cases require control-flow tracing through shared scripts, region
triggers, or cutscene dispatch. One runtime capture per distinct dispatch
family should identify the native path; recording every individual exit is
not required.

### Dobuita shared door dispatcher

D000's single dynamic operation-`0x0030` site at file offset `0x7f256` is
fed by a shared coroutine at `0x7ee88`. The room's logical door selector is
stored in the caller frame at `+48`. Direct storefront cases compare that
selector and call the coroutine with:

```text
mode, entry, four-byte area ID, scene
```

The selector's input boundary is exact, but its supplier is not yet decoded.
The generated routine receives a caller/resume argument at stack `+60`,
copies it to local frame `+48` at file offsets `0x7840c..0x78412`, and starts
the equality dispatch from that local.

The routine is in D000's broad generated-coroutine target table, but it is
not a public SCN3 export. The live SCN3 runtime at `0x0c49f5e0` identifies the
actual public table through fields `+0x0c/+0x10`: it has exactly six entries
at MAPINFO file offset `0xb11cc`. Independently scanning backward from the
token boundary finds a separate maximal 858-entry suffix of unique
token-relative targets; every target begins with the generated `mov.l
r14,@-r13; sts.l pr,@-r13` prologue. The dispatcher target `0x7707c` is
zero-based generated-target index `570`, stored at MAPINFO file offset
`0xb2ee0`, and resolves to routine file offset `0x783b4`. Both loaded RAM
tables are byte-identical to MAPINFO. This narrows the remaining trace to the
indirect scheduler that consumes generated target 570 and supplies its resumed
logical-door selector.

`tools/worlds/extract_d000_door_callback_table_evidence.py` regenerates the exact
public-export boundary, generated-target boundary/index, loaded addresses, and
source hashes in
`tools/evidence/d000-door-callback-table-evidence.json`.

The nearby operation `0x0031(1)` call at `0x783ea` is a separate control
query, not the selector. Captured operation-table entry `0x0c29aaa4` resolves
it to handler `0x0c16b4c8`, whose argument `1` reads a 16-bit field at current
event/coroutine record `+8`. Across 216 D000 RAM captures that field contains
only `0`, `0x400`, or `0x1000`, while the logical doors use selectors 1..45.
The full operation field layout, pointer chain, corpus census, and distinct
selector dataflow are machine-checked in
`tools/evidence/d000-door-dispatch-input-evidence.json`.

Opening hours, story locks, denial dialogue, and disabled doors must therefore
be recovered by tracing the native caller/registration table that supplies
the resumed argument and its availability rules. They are not inferred from
operation `0x0031`, geometry, or MAP-layer visibility.

The coroutine forwards the final three values to operation `0x0030`. This
recovers 18 selector-to-interior edges without activating each door:

| Selector | Destination |
| ---: | --- |
| 25 | scene 1, `DKTY`, entry 0 |
| 27 | scene 1, `DSKI`, entry 0 |
| 29 | scene 1, `DTKY`, entry 0 |
| 30 | scene 1, `DCHA`, entry 0 |
| 31 | scene 1, `TATQ`, entry 0 |
| 32 | scene 1, `DBYO`, entry 0 |
| 33 | scene 1, `DJAZ`, entry 0 |
| 34 | scene 1, `DSBA`, entry 0 |
| 36 | scene 1, `DMAJ`, entry 0 |
| 37 | scene 1, `DPIZ`, entry 0 |
| 38 | scene 1, `DRME`, entry 0 |
| 39 | scene 1, `DSLI`, entry 0 |
| 40 | scene 1, `DRHT`, entry 0 |
| 41 | scene 1, `DSUS`, entry 0 |
| 42 | scene 1, `DURN`, entry 0 |
| 43 | scene 1, `DYKZ`, entry 0 |
| 44 | scene 1, `DKPA`, entry 0 |
| 45 | scene 1, `DSLT`, entry 0 |

`tools/worlds/extract_d000_door_transitions.py` regenerates
`tools/evidence/d000-door-transitions.json` and joins these selectors to the
65-door geometry table. The remaining 47 selectors are not assumed to be
closed or non-transition doors: they pass through additional story, time, or
minigame control flow and remain unresolved until those branches are traced.

## Sakuragaoka walk-over transitions

JD00's operation-`0x0030` call at file offset `0x5a1d6` initially appears
dynamic because it reads its three arguments from the current stack frame.
Following its callers resolves the normal road transition without activating
it in Flycast:

```text
JD00 caller 0x5b92a
  -> shared helper 0x5a06c
  -> operation 0x0030 at 0x5a1d6
  -> scene 1, D000, entry 1
```

The caller supplies entry `1` in `r5`, area `D000` in `r6`, and scene `1` in
`r7`. After the helper prologue those values are at `@(20,r14)`,
`@(16,r14)`, and `@(12,r14)` respectively. The helper loads them in the exact
scene/area/entry order already proven by the JOMO runtime trace.

D000 entry 1 was independently captured at native
`(13.23, 1.1416015625, 98.86)` with yaw `0`, which converts to browser
`(-13.23, 0, 98.86)` with yaw `0`. This is the north Dobuita entry from the
Sakuragaoka road. A destination near browser `(3, 2.6, 133)` is therefore not
the native entry spawn.

JD00 also has a caller at `0x5ba16` for the other Dobuita road, which uses
D000 entry `11`. The destination entry table at file offset `0xd3770` supplies
native `(34.27, 5.3124, 101.2)`, converted to browser
`(-34.27, 0, 101.2)`. The third selector branch at `0x5b83e` reaches JU00
entry `0`.

The operation does not receive a source coordinate. The byte read at
SCN3-static offset `+0x2de` selects the three callers above. Operation
`0x01ae` at `0x5b7d4` is only a readiness gate with constant argument zero;
it does not produce that byte.

The selector is written by three callback functions. Their table starts at
`0x80e18`:

| EVNT ID | Callback | Selector | Destination |
| ---: | ---: | ---: | --- |
| 1 | `0x59b9c` | 3 | `JU00`, entry 0 |
| 2 | `0x59bf8` | 1 | `D000`, entry 1 |
| 3 | `0x59c54` | 2 | `D000`, entry 11 |

The corresponding source definitions are the only three `EVNT` records under
`COLS/COLI 0000` whose flag class is `0x0004`. All three have collision kind
5. The native kind-5 test at `0x0c08dac0` interprets its six floats as an
origin and two edge vectors forming a parallelogram:

| ID | Record | Flag | Browser origin | Browser edge A | Browser edge B |
| ---: | ---: | ---: | --- | --- | --- |
| 1 | `0x8c5a8` | `0x00040001` | `(19.13063, 40.21637)` | `(0, 5.73413)` | `(2.97425, 0)` |
| 2 | `0x8c560` | `0x00040002` | `(-34.05767, -1.01364)` | `(0, 8.67)` | `(-3.94967, 0)` |
| 3 | `0x8c53c` | `0x00040003` | `(-35.66395, 41.57658)` | `(-2.02277, 4.03022)` | `(-1.80824, -0.87347)` |

The conversion is not inferred from the browser mouths. `MEVW` update
`0x0c0f1608` copies the tracked object's position without an offset through
`0x0c0aaf10`, then calls the `EVNT` point query at `0x0c0b29dc`. That query
uses `(native X, -native Z)`. Combining this with the established browser
reflection gives `(browser X, browser Z) = (-event X, -event Z)`.

This leaves a real validation discrepancy: the approximate reported Yamanose
coordinate `(13, 1, 42)` is 6.13063 units short of the decoded ID-1
parallelogram. The native query has no radius or forward offset that can
justify shifting it. A native crossing capture is still needed to reconcile
that report; browser-tested coordinates must not replace the source record.

`tools/emulator/request_boundary_transition_recording.sh` starts a read-only recorder
in the instrumented Flycast session. It does not load a state, press input, or
write RAM. While a person walks through an exit it logs the captured AKIR
X/Z fields, live `MEVW` event ID, selector byte, field-manager pointer, and
resident EVNT pointer to `captures/boundary/jd00-boundary-*.csv`. It also
requests a synchronized RAM/frame capture whenever the event ID or selector
changes.

The browser consumes the consolidated native transition manifest and tests the
decoded parallelograms, including segment crossings that pass through a narrow
volume between frames. Loading inside a volume arms it without immediately
warping. Regenerate and verify the source evidence with:

```bash
python3 -m tools.worlds.extract_jd00_boundary_transitions
```

Full static, runtime-residency, selector, shape, and destination provenance is
in `tools/evidence/jd00-d000-boundary-transition.json`.

## World Reconstruction and Map Transitions

The current `/play` architecture, world catalog, load/unload transaction,
placement and collision composition, transition behavior, persistence boundary,
and Shenmue II integration requirements are documented in
[World loading and transitions](../../implementation/world-loading-and-transitions.md). The
material below is retained as a research and evidence summary; it is not the
source of truth for the live browser world inventory.

The whole-disc coverage join at
`tools/evidence/map-transition-coverage.json` currently contains 292 exact
source/destination/entry edges from all 136 extracted MAPINFO programs. Of
those, 208 have exact native entry placement and 123 have at least one exact
physical-source binding through a native EVNT volume, typed door controller,
or D000 selector case. The remaining 169 are explicitly destination-only
until their physical dispatcher is recovered; proximity is never used to
turn an outgoing call into a clickable door.

The stricter player-facing classification in
`tools/evidence/player-portal-inventory.json` now accounts for every edge:
106 have both an exact physical trigger and an exact free-roam destination
placement, 17 have a physical trigger but lead to a scripted destination with
no player Entry, 102 have an exact placed destination but no proven physical
source, and 67 have neither a physical source nor free-roam placement. This
is the implementation boundary for “every warp”: only the first class is a
proven clickable/walk-over player portal. The other classes remain transition
evidence and are not converted into invented doors.

### D000 logical-door dispatch

Dobuita does not contain a separate literal operation `0x0030` call for every
store door. Its logical door selector is held at caller-frame offset `+48`
and is dispatched through a shared coroutine at MAPINFO file offset
`0x7ee88`; that coroutine forwards `scene`, four-byte `area`, and `entry` to
operation `0x0030` at `0x7f256`.

The direct equality branches prove 18 storefront transitions offline. The
helper's native argument order is `(mode, entry, area, scene)`; it reorders
the last three values into operation `0x0030(scene, area, entry)`. Therefore
these storefronts enter their scene-1 interiors at entry 0, not scene 0 at
entry 1. They
are extracted by `tools/worlds/extract_d000_door_transitions.py` and joined to the
exact visible door records through the existing 65-selector logical-door
table. Conditional selectors are retained as unresolved rather than being
assigned destinations from geometry or names.

The selector input boundary is exact, but its native supplier is not yet
decoded. The coroutine receives a caller/resume argument at stack `+60`,
copies it to frame `+48`, and then enters the door tree. Its adjacent
operation `0x0031(1)` call is a separate event/coroutine control query:
handler `0x0c16b4c8` reads a 16-bit field at record `+8`, and 216 D000 RAM
captures contain only status-like `0`, `0x400`, and `0x1000` values there,
not logical selectors 1..45. All eight queryable fields, the pointer chain,
the corpus census, and the separate selector dataflow are preserved in
`tools/evidence/d000-door-dispatch-input-evidence.json`.

Consequently, the door destination routine is not yet proven to be the
store-hours gate. The native caller/registration table which supplies the
selector, and its availability rules, must be traced before reproducing
closed signs/doors; proximity to a MAP layer is not evidence of the rule.

The browser catalog now includes both games. The canonical world-loading guide
and generated area reference own the current inventory and explain why browser
IDs, native areas, asset prefixes, and collision areas are separate concepts.
Historical extraction counts below describe their cited source corpus, not the
current number of playable worlds.

Confirmed transition route:

```text
JOMO interior <-> JHD0 grounds <-> JU00 Yamanose -> JD00 Sakuragaoka -> D000 Dobuita
```

Yamanose does not connect directly to Dobuita. JD00 is selectable in `/play`.
Sakuragaoka's three walk-over routes now use JD00's three active
`COLS/COLI 0000/EVNT` kind-5 parallelograms rather than browser-positioned
cylinders. EVNT IDs 2, 3, and 1 select `D000` entry `1`, `D000` entry `11`,
and `JU00` entry `0` respectively through their SCN3 callback table.
The all-disc inventory in `tools/evidence/map-warp-inventory.json` joins the
same native volume/callback mechanism across D000, JD00, and JU00. It resolves
all 24 transition-class volumes without browser-position inference. Two MFSY
event-1 records on Discs 2 and 3 remain explicitly unclassified callbacks and
are not mislabeled as transitions.
The underlying EVNT decoder also streams mixed payloads and exactly decodes
kind 6 as a vertex count followed by arbitrary `(x,y)` float vertices and a
`0xffffffff` terminator. Across all 136 MAPINFO files this yields 149 exact
records: 116 kind-5 parallelograms and 33 kind-6 polygons, with no opaque EVNT
payloads. An independent all-map callback-table scan proves that only D000,
JD00, and JU00 install operation-`0x0001` tables (nine disc/map instances,
36 callbacks). JOMO has 72 all-disc class-4 polygons but installs no such
callback table, so those records remain exact geometry-only evidence rather
than being guessed as transitions.
The independently captured D000 entry-1 destination is browser
`(-13.23, 0, 98.86)` at yaw `0`. The approximate Yamanose browser report at
`(13, 1, 42)` does not lie inside the decoded ID-1 region; this remains
explicitly pending a native crossing capture rather than being used to shift
the source geometry. The implemented door bindings are:

| Source | Tag/model | Destination |
|--------|-----------|-------------|
| JOMO | `dor0`, `DR15_016` | JHD0 entry 2 |
| JHD0 house | `dor0` | JOMO entry 0 |
| JHD0 gate | `dor1`, `DR29_000` | JU00 entry 1 |
| JU00 gate | `dor0`, static door 18, `DR29_000` | JHD0 entry 1 |
| MKSG warehouse | `dor3`, runtime door 3, `DR02_021` | MS08 entry 0 |
| MKSG compound exit | `dor8`, runtime door 8, `DR02_021` | MFSY entry 1 |
| MS08 entrance | `dor0`, `DR02_021` | MKSG exterior side of `dor3` |

The JU00 gate tag is `dor0`; `dor18` was an erroneous tag inferred from its
static-record index. Transitions freeze movement, play the door operation, and
load the destination only after the operation finishes. Run/autorun, no-clip,
camera perspective, and third-person zoom state survive both door transitions
and sidebar map changes.

Dobuita's 12 native free-roam storefront interiors now also have exact reverse
routes. `tools/worlds/extract_map_transition_objects.py` recovers their typed SCN3
door-controller roots; operation `0x019c` distinguishes the current-scene
return callback from unrelated story transitions; and
`tools/worlds/extract_map_entry_points.py` supplies each exact D000 return position
and facing. The generator uses `MPK00.PKF::CHARA.CHRT` `DefImage` metadata when
available to bind controller tags to models. This proves, for example,
`DYKZ:DOR2 -> DR02_024.MT5` without choosing between similarly named assets by
appearance. All 12 models pass the production loader audit and contain the
native moving node 12. Their actual MT5 geometry is clickable in `/play`;
native Door Box dimensions remain an explicit research item rather than being
approximated.

Across all three discs, the extended SCN3 scan now covers 136 MAPINFO files,
213 exact transition calls, 20 dynamic calls, 131 exact local-helper calls,
292 unique exact edges, 86 typed door-controller records, and 70 exact
controller-to-destination associations. SCN3 header `+0x0c` is only the end of
the primary program: callbacks continue until the static-data boundary at
`+0x10`, which is essential for recovering these exits.

Entry positions/headings are captured separately from the door's own transform.
See [the map transition trace](map-transition-trace.md).

### Harbor and warehouse placement capture

A late-game VMU save was loaded on Disc 1, saved in Dobuita, and continued
under Disc 2. The native scene-request writer then loaded both MFSY and MKSG
without requiring manual travel. Synchronized RAM captures recovered exact
tagged `TASK` transforms and matched each live HMDL back to its source MT5 by
runtime pointer and full-buffer byte agreement.

MFSY combines 22 non-player live props with all 27 records in its
`MAPINFO.BIN` static-door table, producing
`play/data/mfsy-runtime-placements.json`. MKSG contributes nine stationary
props and ten live node-12 door instances in
`play/data/mksg-runtime-placements.json`. MKSG has no equivalent static-door
table: its doors were joined directly from each runtime HMDL instance to the
97.8%-matching `S2_MKSG_DR02_021.MT5` source model. A stealth-start save
independently exposed five scheduled guards and six attached light actors.
Those actors are deliberately excluded from the static manifest because their
positions change with the stealth state; freezing one capture would be
incorrect.

MKSG's native script contains exact transitions to `MS08` entry 0 and `MFSY`
entry 1. Destination RAM captures resolve their browser spawns to
`(26.5, 0, -2.3)` at `50.0043°` and `(118, 0, -12)` at `90°`, respectively.
The physical `dor3`/`dor8` associations come from the district's authored map
topology and remain labeled separately from those exact dispatch/spawn facts.
All other MKSG warehouse doors now remain locked instead of opening without a
destination.

MS08's MAPINFO supplies an exact entrance-door transform at browser coordinate
`(27.06, 0, -1.8)`. The original room leaves through story control rather than
a local literal map-transition operation, so the browser reverse edge to
MKSG is an intentional reconstruction. Full provenance is in
`tools/evidence/mksg-warehouse-door-transitions.json`.

A real Disc 3 forklift-race save supplied a settled MA00 population. The
browser now uses the captured five-forklift grid, Mark transform, ten active
static fixtures, and the exact native competitor route. Actors and alternate
open-door states are deliberately separate from static scenery. The race
reconstruction adds a three-second countdown, ordered checkpoints, three
laps, a timer, and a persistent local best time. Course provenance is recorded
in `tools/evidence/ma00-forklift-race-course.json`.

JD00 was also loaded through the native Disc 1 scene-request writer. Its
settled population added `TBOX`, `BTEL`, `VM_0`, `VMG0`, `GCH1`, `GCH2`, and
`DAMY` to the 55 MAPINFO doors. The player task and unmodeled dynamic actors
were excluded. `tools/worlds/audit_world_object_completeness.js` now verifies static
placement for every `/play` world; Dobuita's remaining audit warning concerns
unknown interaction semantics, not missing transforms.

Regenerate the reviewed manifests from the captured evidence with:

```bash
node tools/worlds/build_harbor_placement_manifests.js
```

---
