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

There are currently two durable progression systems, and they do not
automatically synchronize.

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

Yarn effects are staged and committed atomically at `complete`.

### They are not aliases

A server key such as
`native.jomo.free_conversation.bank2.bit410` is currently just a string key.
It does not read or write native bank 2 bit 410. Conversely, a real native
bank mutation does not update that server flag. Some official-script tests
seed these strings manually, which can make a route look integrated when
ordinary gameplay cannot produce its prerequisite.

The terminal server state received by the browser is also not merged into the
native snapshot. Consequently, server-first and native-fallback versions of
the nominally same event can advance different state and later select
different branches.

**Do not scale storyline authoring before choosing this boundary.** The
recommended direction is:

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
reviewed mappings at story-event settlement. Until that bridge exists, disable
the alternate fallback for a translated route rather than allowing two
progression authorities to race.

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
bank-2 bit `961 == 1`. Do not assign story names to the numeric record/global
inputs without recovering their writers. Bit `832` is also written by other
initialization branches, so calling it simply “watched allowance” is inaccurate.

The OP00 awakening writes bank-2 bit `961 = 1` at `0x20536`, then requests
`JOMO` entry `1` at `0x2054e`. Currently the opening uses sandboxed previews and
`CompleteOpening` only sets `opening_completed`; it does not commit that native
transition. Fix this through the source-backed opening transaction, not by
globally changing preview behavior or seeding an isolated workaround bit.

### Foundation checkpoint

The shared interpreter now applies result storage, typed scene reads, branch
comparisons and yield/resume handling equally to both native operation
dispatchers. Extraction now recovers small immediate-offset scene writes and
direct/indexed scene-to-frame reads. Compound-call predicate extraction correctly
replaces old register constants when reading frame/scene memory; unsupported
loads invalidate the value. Frame inputs use the existing typed frame evaluator.

Regression tests reproduced the missing returns and false constant predicate
before these changes, then passed. Direct disassembly of the hashed JOMO file
also confirms the writes/reads above and the recovered frame input at `0x8b852`.
These are parser/runtime checks, not a completed room package or browser test.
The full generated corpus has not been rebuilt for these changes. Remaining
first-slice work includes the two `0x0184` results combined into frame offset
`0`, their authoritative input, interaction-manager operations, room ownership,
and server settlement. No live progression should be claimed from this
checkpoint alone.

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
