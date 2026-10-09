# Storyline gameplay integration

Status: integration design; existing boundaries are distinguished from proposed work
Last reviewed: October 3, 2026

The [implemented play modes](../implementation/play-modes.md) now isolate Story
and Free roam saves, calendars and NPC views. The event-settlement and native/Yarn
integration gaps below remain; mode switching does not itself complete them.

## Purpose

This guide covers player-facing Shenmue I storyline work: entering an area or
using an object should select the right personal event, play an existing
cutscene/dialogue/QTE presentation, settle it reliably, and persist the
resulting flags or phase.

It is intentionally **not** a repository tour. The tree already makes class
names and file locations discoverable. This records the less obvious system
boundaries, incomplete bridges, and mistakes that have previously consumed a
lot of time.

The target is **good-enough playable story progression**, not complete
reimplementation of every MAPINFO instruction. Visible priorities are:

1. correct actors and important props;
2. correct animations and camera;
3. dialogue, voice, sound, and music;
4. reliable triggering, cancellation, and cleanup; and
5. durable personal progression that does not replay or diverge after reload.

Reuse exact extracted data and keep the extraction tools as rebuildable
artifacts. Do not restart a game-wide decompilation campaign merely because an
unrelated native operation remains unresolved.

## The mental model to keep

New Yokosuka is a shared MMO world with personal Shenmue progression. The
desired ownership chain is:

```text
shared-world entry or interaction
  -> server checks this character's personal eligibility
  -> server issues one bounded story-event session
  -> browser stages an existing native/Yarn presentation as a personal overlay
  -> presentation reaches an explicit terminal settlement
  -> server commits the reviewed personal milestone exactly once
  -> browser restores the shared world or enters an authorized destination
```

Each Story player can see NPCs in different places according to their saved
calendar and flags without changing other players' NPCs. Brief scenes belong in
personal presentation overlays. QTEs, fights,
or events that materially alter a room may need a private or party event
instance.

Free roam uses the synchronized public date. Story mode uses a server-saved
personal calendar for lighting, businesses, NPC schedules and native date
predicates. Players in the same zone can still see each other despite seeing
different dates, times and NPCs. Preserve original calendar predicates in that
personal context rather than translating them into public-world dates.

## The largest current architectural gap: two story states

There are two durable progression representations. The server now has an
explicit native-bank transaction bridge; existing routes and browser consumers
still need to adopt it. They do not automatically synchronize.

### Exact native state

The browser's native dialogue snapshot, persisted in
`character_dialogue_state`, contains the original-shaped state used by native
selectors and room programs:

- story banks 2, 3, and 4;
- the 3,900-byte dialogue-progress table;
- dynamic actor identities and random history;
- actor byte state; and
- 256 persistent room-script bits.

Native execution stages these mutations and only saves them after successful
completion. Cancellation restores the last committed snapshot.

### Server/Yarn state

The server's script-event store separately owns:

- open-ended string flags;
- named numeric progress values;
- inventory and yen; and
- its own optimistic revision and event-run leases.

Yarn effects are staged and committed atomically at `complete`. The server's
`native_value("2:832")` and `set_native_value "2:832" 1` now read/write the
actual native snapshot instead of a named flag. Compiler-indexed native-value
dependencies pin the snapshot at event start. Native writes and rewards commit
together, with one native revision increment and a complete `nativeDialogue`
receipt. Concurrent legacy dialogue saves are refused while that lease owns
the snapshot; cancellation, expiry and failure do not settle staged effects.

The shared bank primitive, real Yarn compilation/execution and PostgreSQL
settlement have been tested, including fresh Story state, read-after-write,
repeat visits, preview isolation, duplicate completion, stale saves, rollback
and pre-presentation trigger passing. This is not rendered gameplay evidence.

### They are not aliases

A server key such as
`native.jomo.free_conversation.bank2.bit410` is currently just a string key.
It does not read or write native bank 2 bit 410. Conversely, a real native
bank mutation does not update that server flag. Some official-script tests
seed these strings manually, which can make a route look integrated when
ordinary gameplay cannot produce its prerequisite.

The server now publishes a private `script_event_committed` receipt after each
durable effect transaction, separately from its presentation reply. This
includes a gate's `pass_trigger` effects even if the next candidate fails. It
refreshes only the corresponding personal NPC scheduler, using the saved bank-2
flags and guarding against older revisions or a changed play mode.

The browser flushes prior native saves before requesting an event, suppresses
native saves during server-owned presentation, queues committed native receipts,
then installs the newest receipt after activity cleanup. Cleanup therefore
cannot restore a pre-event snapshot over a committed flag. Character/mode and
local-session fences isolate delayed receipts, saves and cleanup. Lost replies
and stalled pre-event saves time out without authorizing a native fallback;
a late initial reply is cancelled without starting presentation. Cancelled
preparation cannot dispatch a delayed start. Reconnect reloads durable state.
These boundaries have focused tests, including real Yarn and PostgreSQL tests
and same-day personal NPC schedule changes; they are not rendered evidence.

Existing scripts using named `native.*` flags have not been silently converted.
Receipt-driven reward/inventory UI refresh and the source-backed first story
route remain unfinished. Consequently, server-first and native-fallback
versions of the nominally same event can still advance different state and
later select different branches.

**Do not scale storyline authoring before completing this boundary.** The
direction is:

- the server is the durable authority for the MMO personal phase and
  consequential effects;
- exact native bank/index/byte identities remain stored evidence, not replaced
  by guessed friendly names;
- every reviewed milestone has one explicit mapping between MMO phase and the
  native values that native dialogue/programs consume; and
- one event settlement updates the authoritative milestone and its required
  native compatibility state together, or fails without updating either.

Avoid a general two-way synchronizer. It creates ordering conflicts and makes
it unclear which side wins after cancellation or reconnect. Prefer bounded,
reviewed mappings at story-event settlement. Until a route adopts the bridge, disable
the alternate fallback for a translated route rather than allowing two
progression authorities to race.

Legacy native-dialogue saves remain revision-checked client snapshots outside
an owned native event lease. Full server validation of those mutations remains
unfinished; the bank bridge alone does not establish anti-cheat authority.

## Area-entry dispatch already has important semantics

The live browser currently polls a database-backed `automatic` trigger once
per native-area residency, after the destination world and native dialogue
state are ready. The server independently permits one automatic dispatch per
browser-world residency.

Important consequences:

- The trigger schema supports both `enter` and `automatic`, but normal
  gameplay currently sends only `automatic`. `enter` appearing in a test or
  database row does not make it reachable.
- This is a room-entry check, not a continuous arbitrary spatial-volume
  detector. A trigger halfway through a room needs an interaction, a reviewed
  spatial trigger source, or an explicit extension.
- Same-world respawn does not leave/re-enter the native area and therefore
  does not re-arm automatic dispatch.
- A cross-world transition tears down cutscene, dialogue, server-script,
  native-event, resource, and room-controller ownership before loading the
  destination. A multi-world event needs an explicit handoff; it cannot rely
  on those transient runtimes surviving.
- Cutscene-only worlds intentionally do not poll automatic story events.
- The server derives the four-character native area by inverting the trusted
  browser-world map. A missing or ambiguous inverse rejects the request; do
  not trust a client-supplied native area.
- Normal connected transitions publish destination presence before requesting
  the automatic event on the same WebSocket. There is not yet a durable
  destination acknowledgement/retry token.
- Ordinary doors and map boundaries currently specialize in travel, not story
  settlement. Their authorization does not generally consult personal story
  flags. Native room operation `0x0187` can write an area request, but no live
  consumer turns that record into a world transition.
- Character location and story-event completion are separate durable writes.
  An event that ends in a different area needs a designed recovery/idempotency
  policy rather than assuming those writes are atomic.

Fallback ownership is subtle and must remain single-dispatch:

- `no_script`, `unavailable`, `area_unavailable`, or a connection failure
  before a run may have started can fall back to the recovered native gate;
- once a server run may exist, an ambiguous failure must not also launch the
  native route; and
- a published candidate that executes `pass_trigger`/returns declined has
  still owned that dispatch. Do not then run native fallback and duplicate its
  gate effects.

Publishing a broad high-priority `automatic` Yarn trigger can therefore hide
an existing native room event even when the Yarn candidate deliberately
passes. Test the complete candidate chain.

## What is genuinely reusable now

### Server event transaction

The database/Yarn system already provides version pinning, one active run
lease, authoritative predicate evaluation, staged effects, ordered yields,
choices, trace history, cancellation, `pass_trigger`, and atomic commit on
`complete`. Use that rather than creating a second quest-state engine.

Only a small official catalog is presently live: Hato, the JOMO/Goro automatic
telephone event, the D000 telephone-book activity, and three D000 closed-door
interactions. Their existence proves the transaction path; it does not imply
game-wide story coverage.

### Native presentation stack

The shared native stack already owns program interpretation, activity resource
binding, AUTH playback, actors, camera, motion, dialogue, face/hand cues,
audio, music, props, map presentation, and cleanup. A storyline-specific
cutscene renderer would be a regression.

Use one of these, in descending order of preference:

1. a reviewed real room owner/program when its gating and lifecycle are
   executable;
2. an already packaged multi-activity owner route; or
3. an existing synthetic preview wrapper as a declared good-enough
   presentation when the real owner is not worth recovering yet.

The third option is acceptable for the current product target, but its limits
must be explicit. A preview wrapper supplies the visual sequence; the server
story definition must separately own eligibility, durable effects, replay
policy, return location, and any omitted interstitial logic.

Do not call an arbitrary child function merely because it reaches an AUTH.
The D000 telephone book is the canonical warning: its child must run through a
persistent room owner that initializes, polls an event word, dispatches the
child, performs maintenance, and checkpoints. Direct child launch loses that
lifecycle.

### Cutscene-menu assets are not story events

The cutscene selector is a debug/presentation surface. Its programs commonly
bypass native gates, parent controllers, durable state, QTE ownership, and
post-scene transitions. Preview playback deliberately restores native dialogue
state afterward.

Therefore:

- “the cutscene works from the menu” proves presentation reuse, not story
  integration;
- a parsed AUTH or generated entry candidate is not a player-facing trigger;
- catalog/readiness counts must not be reported as playable story counts; and
- the existing menu descriptor may be reused as a bounded presentation ID,
  but never as the authority for prerequisites or completion effects.

The default native dialogue snapshot is already a recovered free-roam,
post-opening baseline. Playing the opening from the menu is not a new-game
progress transaction. A true game-start storyline needs an intentional initial
snapshot/phase rather than mutating the preview behavior.

### Narrative research is not runtime policy

The manually curated story graph is useful chronology, not an executable quest
graph. Likewise, the current researched-flag data is sparse and often proves a
consumer without proving the setter or exclusive human meaning. Preserve the
numeric evidence, confidence, and competing interpretations. Do not compile a
friendly label into a hard prerequisite solely because it sounds plausible.

## The missing live story-scene seam

The browser has no generic server-orchestrated “launch this reviewed cutscene
in live gameplay and return a typed settlement” command. Existing
`start_activity` is deliberately limited to a small closed catalog and is
presentation-only. It waits for Babylon cleanup but cannot report a gameplay
result or authorize a reward.

Add one generic **bounded** story-presentation capability, not an arbitrary
program/function executor. A useful catalog record should identify:

```text
story presentation ID
  -> expected native area/browser world
  -> existing cutscene package and program/entry
  -> presentation mode (overlay or private instance)
  -> allowed terminal states (completed, skipped, cancelled, failed)
  -> cleanup/return policy
  -> evidence and known good-enough omissions
```

Module initialization should verify parity between the server capability
catalog and browser adapters, as the existing presentation catalog does.
Story/Yarn content should reference only the stable presentation ID, never a
raw function address or user-supplied selector.

For a noninteractive cutscene, decide and document whether `skipped` is an
accepted completion. The server has already authorized the exact event and
there is no skill result to falsify, so an idempotent milestone can be settled
under that explicit policy. Do not infer success from a timeout or from the
world merely changing.

## QTEs are a separate result problem

Current AUTH/QTE-looking packages can stage camera and animation without
implementing an interactive story QTE. The missing pieces are:

- gameplay input feeding the native QTE/controller state;
- prompt/window timing and success/failure/timeout branches;
- a typed client-to-server result message tied to the active event token;
- server validation and idempotent settlement; and
- disconnect/retry policy.

The native controller-state runtime can read the original-shaped controller
fields, but ordinary gameplay input is not currently written into those
records. A scene such as Heartbeats Alley can therefore look like a QTE from
its AUTH staging while having no prompt/input/result loop at all.

`activity_result` exists in fixtures, but live world facts do not populate it.
The current event-advance protocol carries only continue/select/cancel. Arcade
QTE score APIs are unrelated and must not become storyline authority.

Do not let “the activity finished presenting” set a QTE-success flag. Define a
small typed outcome such as `success`, `failure`, `timeout`, or a reviewed
bounded score. The server must validate it against the active session and
allowed route. Consequential combat, inventory, money, or shared-world effects
need stronger server/instance authority than a browser completion message.

Implement this **after** one ordinary non-QTE story scene works end to end.

## Active implementation goal

Implement source-backed personal area controllers, starting with the complete
awakening → Hazuki residence initialization → Ine-san's first allowance → saved
continuation. Work builds on the existing Story/Free roam and script-event
systems. This is not complete storyline coverage yet.

The original controller consumes several kinds of input: EVNT regions,
position/facing checks, interactions, native banks, the personal clock, and
earlier controller results. EVNT records alone are not a cutscene-trigger
catalog. Room initialization, event dispatch, waits and completion chaining must
remain part of the generated program rather than becoming individual browser
location checks.

Implementation order and completion criteria:

1. **Repair shared recovery and execution.** Preserve immediate-offset room
   writes, scene-to-frame reads, secondary operation returns and compound
   predicates. Recover the arithmetic/stack dataflow needed by the first room;
   never substitute a guessed constant for an unavailable value.
2. **Generate the first area controller package.** Include its original roots,
   initialization, interaction selection, dispatcher and event owner. Record
   source hashes/offsets and unresolved inputs. Keep packages sharded; do not
   bundle a whole-disc research index into the client.
3. **Bridge authoritative state.** Extend server script predicates/effects to
   address original native banks explicitly, under the existing lease, revision
   and transaction rules. Generate ordinary conditions/effects from recovered
   logic rather than writing one Go handler per story scene. Do not expose an
   arbitrary client-selected native function or accept client-authored rewards.
4. **Retain bounded personal room sessions.** Extend existing room-controller
   ownership and automatic dispatch. Re-evaluate affected dependencies when
   state, spatial membership, interaction or time changes, preserving authored
   timers/order. Avoid full-corpus per-frame polling. Mode switches, travel,
   reconnects and cancellation must fence stale continuations and duplicate
   fallback dispatch.
5. **Complete the opening-to-allowance slice.** Reuse native presentation with a
   live story settlement distinct from the preview sandbox. Settle source-backed
   flags, notebook additions, yen, clock and destination atomically. Explicitly
   define completed/skipped/cancelled/failed behavior. Verify a fresh save, each
   negative gate, failure/retry, duplicate completion, reconnect and the next
   interaction, including a rendered full-stack run.
6. **Expand controller families and measure coverage.** Generate a corpus-wide
   report separating discovered sources, recovered conditions, executable
   routes and verified gameplay. Extend shared primitives for remaining S1
   families and typed QTE/combat outcomes. Investigate equivalent S2 story
   scripts separately; recovered S2 worlds/entrances are not evidence of story
   support. Keep unsupported source boundaries explicit.

### Original first-allowance evidence

Offsets below refer to disc-1 `SCENE/01/JOMO/MAPINFO.BIN`, SHA-256
`4af865fbb62a06e917d6625149f4bcf77fa6a6bba19b08b8433440f96712a2b9`.
They are native-code evidence, not proof of rendered gameplay.

| Original step | Evidence |
| --- | --- |
| Root launches persistent controller and interaction loop | Root `0x88b70`; launches `0x8bd7c` at `0x895f2` and `0x436d8` at `0x8968a` |
| Initialization enables the allowance interaction | Function `0x8b6dc`, byte `scene[29] = 1` at `0x8b886` |
| Eligibility checks state and interaction candidate | `0x41290`, then proximity/facing helper `0x16ea8`; selected interaction mode `7` |
| Input dispatch requests the room event | `0x423d0` mode `7`; dword `scene[0] = 33` at `0x42e34` |
| Persistent owner consumes that request | `scene[0]` copied to frame offset `4` at `0x8bebc`; event `33` calls `0x60fe8` at `0x8ce8e` |
| Event body selects allowance presentation | `01KOZ` resource request at `0x610c6`; activity `35` at `0x611b2` |

The initialization condition at `0x8b852` combines current-scene `1`, computed
frame field `0 == 0`, bank-2 bit `832 == 0`, operation `0x01c7(3,0,2) == 1`, and
bank-2 bit `961 == 1`. Bit `832` is also written by other initialization
branches, so calling it simply “watched allowance” is inaccurate.

The inputs now have verified producers:

- Frame offset `0` is the original **STEP** progress code. The two `0x0184`
  queries at `0x8b798`/`0x8b7b6` return quotient/remainder; the code recombines
  them as `quotient * 10 + remainder` at `0x8b7c4`.
- Executable global `0xc22020c` is a signed word, reset to zero by
  `0xc142908`. Its updater `0xc1429e2` scans the 80 ordered pairs at
  `0xc2780b8`, selects the first set bank-2 bit and stores its paired STEP.
  **No match retains the previous value.** The debug display is literally
  `STEP %2d.%1d`; these are not assigned chapter names. The verified table is
  generated in `nativePredicateValues.generated.js`.
- Parameter byte `2` is written by the JOMO root itself. It reads arrival
  entry via `0x0026` at `0x89090` into room dword `0`; zero entry writes
  `0x01c7(3,1,2,0)` at `0x892de`, nonzero writes `0x01c7(3,1,2,1)` at
  `0x89326`. This room field later becomes the dispatch request, so it is
  not interchangeable with the immutable arrival input.
- `0x0026` returns global `0xc20c3e0`. Executable operation `0x0030` at
  `0xc16b492` queues its third argument through `0xc0f0a86`, controller
  offset `0xd8`. The main update calls `0xc0f0a4e` at `0xc0c98f8` to copy
  that pending value into the global. The same path carries scene and area
  through offsets `0xd4`/`0xd0` into `0xc20c3d8`/`0xc20c3dc`.

These executable findings use SHA-256
`ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c`.
The bounded code ranges, STEP table and arrival-field layout are recorded by
`tools/scripting/extract_dialogue_predicate_values.py`. An entry is an authored
arrival/event selector, not necessarily a door, and still requires the room's
own initialization and predicates.

The OP00 awakening writes bank-2 bit `961 = 1` at `0x20536`, then requests
`JOMO` entry `1` at `0x2054e`. Currently the opening uses sandboxed previews and
`CompleteOpening` only sets `opening_completed`; it does not commit that native
transition. Fix this through the source-backed opening transaction, not by
globally changing preview behavior or seeding an isolated workaround bit.

The free-roam bank-2 preset (`0xec` in byte 0) includes bit `5`, which selects
STEP `11` rather than the allowance's required `0`. New Story contexts now use
the original bank reset instead; stored saves are not rewritten. PostgreSQL
tests cover both directions of mode switching, including a fresh Ryo switching
before any dialogue save. This fixes baseline isolation, not the still-pending
opening effects and room initialization.

OP00's final clock write at `0x2051e` is Dec. 3 **08:55** before its JOMO
transition, whereas the current personal clock starts at 08:50. The dream's
08:50 caption is presentation; it does not establish the post-scene clock.

### Saved room parameters and restore state (`0x01c7`)

This is **global saved state**, not a fresh scratch buffer for every room.
The original executable's save capture at `0xc09cb72` calls `0xc14a910`
with record offset `0x7a4` and parameter offset `0x1b0`. Import at
`0xc09cf96` calls `0xc14aa86` with those same offsets. The latter copies
48 bytes to `0xc220370` and 32 bytes to `0xc2203a3`. The evidence extractor
verifies both caller byte ranges, their pointer/offset literals and the
helpers against the hashed original executable.

Three distinct load-related bytes must not be conflated:

| Address | Source-backed behavior |
| --- | --- |
| `0xc2203a0` | Consumable load indication; `0xc14aabe` decrements it and returns one, or returns zero when already zero |
| `0xc2203a1` | Operation `0x01c7(0)` returns `-1` while this byte is nonzero; consuming the previous byte does not clear it |
| `0xc2203a2` | A separate deferred clock-restore request consumed by `0xc14aa2e` |

`0xc14aaa6` sets the first two bytes to one. `0xc14aab2` clears only those
two bytes: it does **not** clear the record, parameters, or the Boolean dword
written by mode two. The executable image initializes the whole block to
zero, but this does not establish that every in-process new-game reset does
so. Importing saved bytes and marking a load are also separate native steps.

`NativeOperation01c7State` now models explicit cold initialization, importing
both saved sections, marking/consuming/resetting load status, and isolated
snapshots. `NativeRoomScriptRuntime` keeps this object across area changes and
includes it in transaction rollback, including failed transaction setup.
The actor section deliberately remains unavailable until the session owner initializes or
imports it; parameter reads use the persisted personal snapshot. No default JOMO parameter byte is guessed. Mode one's actor-restore
adapter receives the actual 48 record bytes and must explicitly accept them;
missing data or rejected application stops execution.

The 32 parameter bytes now persist in the existing personal native snapshot's
v5 `gameState.sceneParameters` field. Server `native_value("01c7:2")` and
`set_native_value "01c7:2" 1` use the same compiler dependency, pinned-revision,
lease, transaction and receipt path as native bank values. Stored pre-v5
snapshots upgrade once at the decode boundary; malformed v5 snapshots and
old-client writes are rejected. This adds no guessed JOMO-specific initial
value. Mode switching preserves separate parameter buffers for Story and Free
roam. Client room execution resolves the current snapshot owner; a late
rollback restores only the owner it captured, never a newer server receipt or
another character. Preview/sandbox restores include the parameter bytes.

Still outstanding: capture/persist the 48-byte actor/clock section, connect
native fresh/resume load-status ownership, and implement the actor/clock restore
adapters. Merely receiving a network snapshot does not mark a native save load
or fabricate an actor restore record. The actor helper restores actor fields and invokes refresh helpers;
it does not itself restore the clock. Capturing with no primary actor clears
only the output record and leaves the parameter output untouched, so a partial
capture must not be mistaken for a valid new save. This lifecycle support alone
does not make the entire opening controller executable.

Actor operation `0x00f5` now follows the original `STEP` property write:
packed mode zero changes the footstep enable byte; mode one changes the fallback
surface byte. Higher modes and proven absent actor/property records are native
no-ops; unknown records remain explicit stops. This actor property is distinct
from the global story `STEP`. Captured room bytes initialize known actor records,
live audio consumes their changes, and cancellation restores their prior bytes.
Real collision materials still take precedence over the fallback surface.

Exact S1 transitions now carry their original scene/area/entry tuple through
world loading into the room context before composition. All 65 currently
playable S1 routes match their destination world's native area. The new Story
opening supplies `(1,JOMO,1)` as native metadata while retaining the position
returned by the server. Resume and manual travel do not invent an entry zero;
S2 disc metadata is not interpreted as an S1 scene. Operations `0x0026` and
`0x019c` read the exact entry and scene globals.

The executable's clock initializer at `0xc181cbe` sets gate/advance to zero
for scenes 0 and 80, and one for other scenes. The room loader calls it only
when dword `0xc20c3fc` is zero; nonzero preserves prior control bytes. The
source and bounded byte ranges are pinned in
`tools/evidence/native-clock-initialization-evidence.json`. This models control
bytes, not native timer registration, calendar bounds or server time advancement.
The browser session/load owner does not yet supply the loader-control word.

Verification: the scoped, freshly recovered JOMO IR runs from `0x88b70` with
the existing free-conversation state, explicit cold `0x01c7` state, and the
source-backed `(1,JOMO,1)` arrival plus an explicitly supplied loader word zero.
It writes `scene[52] = 0`, executes `0x00f5(AKIR,259)` at `0x88bd0`, and
`0x0149(0)` pauses the native clock control. Room loading now initializes the
original `AMB1` pool: sixteen zeroed 44-byte records (704 bytes), with a separate
inactive pointer. `0x018b` writes the authored record at `0x1c374`; `0x018a`
activates that same pool, preserving fields at offsets 0–28 and clearing only
32–40. Earlier modeling incorrectly treated the opaque command operand 25 as
an allocation size and recreated the records at activation. The shared fix is
backed by 482 writer calls across 35 disc/area pairs and the executable's room
loader, allocator, writer and activation helpers. Transaction rollback restores
the pool. This represents native record/controller state; per-frame ambient
audio evaluation and browser playback are still separate integration work.

The scoped headless JOMO run now also passes `0x0176(1,0)` at `0x88c4a`.
Its zero branch refreshes cloud/rain/snow curves from the original
`SPRITE/WEATHER.BIN` at the staged native clock; its nonzero branch freezes
updates without clearing the last values. The 865 curve words, original
calendar packing, float32 interpolation, and executable proof are recovered by
`tools/worlds/extract_shenmue1_weather.py`. Weather control participates in room
transaction rollback. Story-mode rendering projects these values onto the
existing four weather categories; native continuous particle intensity,
minute-ahead 120-tick smoothing and forecast sprites remain
unimplemented. This is partial presentation integration, not full native
weather fidelity.

With the original opening-tail clock explicitly supplied as
`[86,12,3,3,8,55,0]`, the scoped headless run now passes `0x0175(1)` at `0x88c5a`.
Its helper at `0xc1badbc` constructs a 100-byte `WAIR` owner, using four original
time-keyed environment tables (forty records) and six original sky resources.
The runtime preserves lifecycle, mask controls, packed-color interpolation,
weather freeze ownership and source sky-selection thresholds transactionally.
The auxiliary WIT4 weather curve is now recovered too: two zero-intensity words
in the executable, separate from FCAS. Shared browser rendering projects the
authored direct-light RGB and primary sky texture; native solar rotation, fog,
secondary sky strips and particle/fade timing remain partial presentation gaps.
This replaces the missing controller boundary with source-backed state, not a
no-op. The scoped run also passes `0x0179(38)` at `0x88c92`: its three helpers
write dry volumes to separately owned kind-one `FIXC` precipitation components.
The shared browser rain/snow path now applies the source exclusion predicate,
including original padding, winding and mirrored scene X; native particle and
splash generation remain partial. These fields roll back with a failed room
transaction and survive WAIR release, matching their separate ownership.
The compiler now recovers declared MOTI/HNDM static filename operands from
MAPINFO rather than requiring handwritten string records. The package builder
retains only strings referenced by its selected function closure and rejects
conflicting manual declarations. A catalogued JOMO initialization route uses
the original SCN3 root `0x88b70`; the builder rejects another function mislabeled
as room initialization. Its current source closure has 408 functions, fourteen
static activity-record pairs and three motion filenames: `M_MOBJ.BIN`,
`M_MDOR.BIN`, and `HMOT_OMO.BIN`. The scoped package is generated with current
recovery code and the existing resource registry, without replacing the full
public runtime index from a one-area probe.

That package's headless startup queues both original global motion resources
and reaches an unresolved operation `0x0008` at `0x15852` in shared helper
`0x15788`. This is a genuine unsupported native operation, unlike the former
probe's absent static-string resolver. The initialization route is catalogued,
not automatically enabled as a live startup path. Source closure discovery and
request-queue state are not proof that motion is resident or rendered. The
supplied clock and loader word do not prove live startup or opening settlement.
Focused tests cover saved-section ownership, byte bounds, separate load flags,
atomic import, rejected actor restore, room changes, committed parameter
changes, cancellation and failed transaction setup. These are headless checks,
not rendered opening/allowance verification. The full local scripted-event
inventory now contains 845 calls across 99 disc/area pairs; the former 690-call
frequency assertion was stale. The evidence tool validates each supported
call shape/parameter range and records the input hash and source scope.
The parameter save path also passes real PostgreSQL mode round-trips and
event settlement tests (rewards, duplicate/stale completion, failure rollback,
cancellation and expiry), plus the official Yarn compiler/interpreter's
read-after-write and receipt test. This is persistence/authority evidence;
opening settlement and live room-controller startup are still incomplete.

### Foundation checkpoint

The shared interpreter now applies result storage, typed scene reads, branch
comparisons and yield/resume handling equally to both native operation
dispatchers. Extraction now recovers small immediate-offset scene writes and
direct/indexed scene-to-frame reads. Compound-call predicate extraction correctly
replaces old register constants when reading frame/scene memory; unsupported
loads invalidate the value. Frame inputs use the existing typed frame evaluator.
Balanced native-stack arithmetic now retains saved operation/direct-call returns
through delay slots and subsequent calls. Unknown loads, unbalanced stack
changes and control-flow joins discard that evidence; unavailable returns never
reuse a previous loop iteration's result. Yield/resume retains valid returns.

Regression tests reproduced the missing returns and false constant predicate
before these changes, then passed. Direct disassembly of the hashed JOMO file
also confirms the writes/reads above and the recovered frame input at `0x8b852`.
These are parser/runtime checks, not a completed room package or browser test.
A scoped rebuild of all 408 disc-1 JOMO functions confirms the recovered STEP
arithmetic reaches the compiled initializer. The full generated corpus has not
been rebuilt. Remaining first-slice work includes authoritative STEP/arrival
state, interaction-manager operations, execution of room initialization and
ownership, and server settlement. No live progression should be claimed from
this checkpoint alone.

## Validation that actually proves storyline integration

Do not accept a generated catalog, package smoke audit, or cutscene-menu pass
as the completion signal. For every story route, require:

### Server/state tests

- ineligible candidate passes without visible ownership;
- eligible candidate selects exactly once;
- completion commits the expected milestone exactly once;
- cancellation/failure commits nothing;
- repeat entry follows the documented replay policy; and
- competing trigger priority/fallthrough is deterministic.

PostgreSQL/Yarn integration suites silently skip unless both the test database
URL and Yarn compiler are configured. A plain green Go test run is not proof
that this layer ran.

### Native/presentation tests

- use the real package/assets rather than a fake duration;
- require a terminal `complete`, not merely a yielded continuation;
- fail on nested native stop reasons;
- restore camera, input locks, actor/object ownership, audio, and map state;
- verify that cancellation and a second launch do not leave occupied activity
  slots; and
- treat early return to the selector/world as failure.

### Full-stack browser test

Run the real server, database, imported official scripts, and Vite app. With a
fresh character:

1. seed only the documented prerequisite through a test helper;
2. physically enter the source world;
3. assert one event launch and no duplicate native fallback;
4. wait for its true terminal settlement while failing on console/page/runtime
   errors;
5. query authoritative state;
6. leave and re-enter; and
7. reload/reconnect and verify persistence, replay policy, destination, and the
   next unlocked interaction.

For QTEs, add success, failure, timeout, cancellation, disconnect, and duplicate
result/idempotency cases.

## Things not to do

- Do not resolve every remaining native operation before shipping one story
  phase.
- Do not equate the number of MAPINFO files, AUTH resources, menu entries, or
  generated candidates with playable storyline events.
- Do not copy a cutscene-menu preview into gameplay and call it progression.
- Do not add scene IDs or actor-specific branches inside generic runtime
  classes. Put reviewed differences in catalogs/generated data.
- Do not maintain two writable “equivalent” flag systems without an atomic
  mapping boundary.
- Do not use the public MMO date as a player's story chapter.
- Do not globally despawn or relocate a shared NPC because one player's native
  story schedule did so.
- Do not commit flags when a scene starts, after an arbitrary timer, or after a
  diagnostic stop.
- Do not treat QTE presentation completion as QTE success.
- Do not silently skip unsupported consequential behavior. Either use a
  declared good-enough substitution or fail with a useful boundary.
- Do not delete extraction/evidence tools after generating runtime data; they
  are how wrong assumptions get corrected later.

## Current implementation facts worth checking before changing anything

These are the few anchors worth reading before implementation; everything else
can be followed from imports and tests:

- [Architecture](../implementation/scripting/architecture.md) — current transaction, native-owner, and
  failure contracts.
- [MMO narrative adaptation](shenmue1-narrative-adaptation.md) — the
  personal-versus-shared policy and phase terminology.
- `play/dialogue/NativeDialogueSnapshot.js` — the exact native persistence
  domain.
- `new-yokosuka-server/internal/store/script_events.go` — the separate authoritative Yarn
  transaction domain.
- `play/scripts/ScriptAutomaticEventRuntime.js` and
  `new-yokosuka-server/internal/realtime/script_events.go` — actual entry-dispatch and
  fallback behavior.
- `play/data/server-command-registry.json` and the standalone server's
  `internal/scriptcontent/commands.v1.json` — the shared capability surface
  that is genuinely authorable now.
- `play/cutscenes/NativeCutsceneDirector.js` and
  `play/events/NativeScriptedEventRuntime.js` — the presentation/interpreter
  owners to reuse.
- [D000 telephone book](../implementation/scripting/interactions/d000-phone-book.md) — why an event child
  and its lifecycle owner are not interchangeable.

Generated evidence remains the authority for changing counts. At this review
point, most shipped cutscene programs are menu-preview wrappers, only one exact
native automatic gameplay route is declared, and no live typed story-QTE
result path exists. Recheck those facts rather than copying the numbers into a
new plan.
