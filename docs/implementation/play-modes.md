# Story mode and Free roam

The sidebar switches a character between two server-saved contexts. The switch
saves pending dialogue, checkpoints the current position, and reloads the game
session. A one-use browser hint selects the same character again after checking
the authenticated account. It never contains credentials or a client-owned save.

| State | Story mode | Free roam |
| --- | --- | --- |
| Appearance | Ryo | Character's chosen creation avatar; appearance picker available |
| Calendar | Personal, saved; pauses outside the connected story session | Shared public calendar |
| Location and facing | Saved story position | Separate saved exploration position |
| Native dialogue banks/progress and script flags | Personal story context | Separate exploration context |
| Other players | Visible in the same geographical zone | Visible in the same geographical zone |

Inventory, capsule collection, yen, experience and HP still belong to the
character, shared across these modes. This does not introduce replayable story
rewards or a second economy.

## New characters and first story entry

- Ryo starts in Story mode. The opening plays OP02 (Shenhua and hawk), murder,
  Ine-san's mail, and the Lan Di dream/awakening.
- Other avatars start in Free roam. Only OP02 plays, then they enter the normal
  Dobuita spawn at (67.79, 0, 61.92), facing pi radians.
- Entering Story mode for the first time starts the full opening as Ryo.
- Completed openings do not replay when changing modes or reconnecting.
  A load failure/disposal before completion leaves the opening retryable.
  Explicitly skipping a scene counts as completing that presentation.
- Existing characters migrate to Free roam with their old saves intact.

The pre-opening clock is December 3, 1986 at 08:50. Completing the opening
atomically saves OP00's final time (08:55), bank-2 flag 961, and JOMO entry 1
beside Ryo's bed. A retry returns the current save without rewinding progress.
Gameplay connects only after that handoff; sandboxed cutscene previews do not
write these effects. See the [original evidence](../design/storyline-gameplay.md#original-first-allowance-evidence).

New Story contexts now use the original zeroed native banks, before opening and
room initialization. Free roam retains the save-derived preset documented in
`tools/evidence/native-dialogue-free-roam-bootstrap.json`. That record verifies
the bytes of a particular save, not its suitability as the first frame of a
new story: bit 5 selects STEP 11 and skips initial branches. The server chooses
the baseline for the active/target mode and preserves existing saved snapshots.

## Shared world, personal presentation

Story viewers receive their own authoritative clock and NPC schedule stream.
NPC engines share the existing compiled actor programs, but have separate
schedule, avoidance and revision state. Bank-2 changes reselect that viewer's
schedules; timed entrances and script-event calendar/presence checks use the same
personal view. Public NPC updates cannot overwrite it. Player presence and chat
still share the normal world room.

Both clocks run at 15 game seconds per real second. Public Free roam retains
its 23:30–08:30 skip. Story uses a continuous 24-hour calendar so late-night calls,
travel and rescues can cross midnight. Personal snapshots advertise
`dayStartHour: 0` and `dayEndHour: 24`; the existing browser interpolation uses
those bounds rather than assuming the public waking day. Story time advances
while its WebSocket is connected, including
ordinary dialogue, and is checkpointed even when standing still. It pauses on
disconnect or a mode switch. Reviewed sleep/wait events save their named target
through the ordinary Yarn settlement, including the same-date 23:45 rest before
[Nozomi's call](../design/story-nozomi-rescue.md). Original room-controller sleep
routines are not executed. Free roam uses the configured server weather
policy. In S1 Story mode, original room-script weather refresh/freeze controls
can select the recovered cloud/rain/snow curves using the personal native clock.
Until that owner is initialized, server weather remains in use. The browser
projects curve values onto its existing clear/overcast/rain/snow categories;
native intensity, smoothing and forecast sprites are not reproduced. Seasonal
layers retain the approximate two-season rule (November through March is winter).
The recovered session-owned `WAIR` controller also samples forty original
lighting keyframes and chooses original sky resources. Its browser projection
uses authored direct-light RGB and the selected primary sky texture; solar/fog
behavior, secondary strips and native sky fades remain incomplete. It does not
override cutscene lighting or isolated-stage backdrops.
See [weather source and presentation boundaries](world-time-and-variants.md#native-story-weather).

## Persistence and recovery

Server migration `006_personal_play_modes.sql` adds the mode and context saves.
The existing active character/native/Yarn tables stay authoritative. A mode swap
archives them and restores the target context in one transaction. It preserves
monotonically increasing native/script revisions and increments a mode revision
that fences old position/clock writes. Live script leases prevent switching.

The client disables switching during loading, dialogue, previews, modal actions,
arcade play and vehicle driving. It waits for native saves first. If a request's
acknowledgement is lost, it checks the server's revision; an uncertain outcome
reloads rather than continuing to write the old context.

Sidebar cutscene previews remain isolated previews and do not mark an opening
complete or modify the story save.

## Starting notebook

The notebook displays numbered pages instead of placeholder categories. After
the Story opening/awakening completes, pages 1–5 contain the starting phone
numbers and Ryo's notes about Lan Di, the stolen mirror and Meng Cun. The page
order and facts follow [Force Vector's notebook transcription](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/14458);
the English wording and layout are lightly adapted, not a native-file extraction.
Later additions (including Master Chen's number, the allowance and Fuku-san's
clues) are deliberately not granted at the start.

`play/config/notebook.js` supplies these immutable pages from the server-saved
`playMode` and `openingCompleted` fields. No separate notebook save or migration
is necessary for these unconditional starting entries: reconnects and existing
completed Story saves receive the same pages without duplication. Free roam
and unfinished openings have an empty notebook. Changing characters/modes or
logging out clears the previous view. The authored first-allowance event now
unlocks a sixth page through the server-saved `notebook.s1.allowance` flag, with
notes about daily money and visiting Fuku-san. Reconnect restores that flag in
the private character profile. Later authored events unlock reviewed pages
through the same saved flags; notebook display never grants progress itself.

The last viewed page is a browser-only preference, stored as a stable page ID in
`localStorage` under `new-yokosuka.notebook-page.v1:<characterId>:<playMode>`.
Closing/reopening or reloading resumes that page. Different characters and
modes have separate bookmarks; unavailable storage leaves in-session navigation
working. The bookmark never unlocks entries or changes server progress.

## Current limits

Combat Test always exposes the full move list without changing Story saves.
Story fights use the starting repertoire plus committed learned-move flags;
lessons temporarily permit their own taught move. See
[Story move availability](../research/shenmue1/martial-arts-combat.md#story-move-availability)
for the connected lessons and remaining optional-learning/proficiency limits.

The connected authored S1 main-route prototype reaches boarding and sailing.
It is not an exact reconstruction of every original controller, optional event,
animation callback or deadline. The [coverage checklist](../design/story-event-template.md#connected-progression-checklist)
records unverified alternatives and presentation omissions separately from
playable progression. The saved shipboard epilogue is an adaptation, not S2
arrival; [S2 Story remains a feasibility audit](../design/shenmue2-story-feasibility.md).

The native interpreter and server/Yarn events retain distinct representations.
Reviewed events query and settle native compatibility writes atomically with
their other effects where an established consumer needs them. Other authored
milestones use named Story flags; there is no speculative one-to-one mapping
of every original bit. The client applies committed receipts after presentation
cleanup; the server refreshes only that player's NPC schedule. Mode isolation
does not make arbitrary client-submitted native flags server-validated.

Server/Yarn scenes pause the personal clock until their event lease ends;
ordinary native conversations retain their previous clock behavior. The
world-state `paused` field stops browser extrapolation for the HUD, lighting
and schedule predicates. `serverTimeMs` remains wall time, so challenge
deadlines do not freeze. Pause/resume snapshots precede event yields, including
cancellation and terminal failure; normal periodic snapshots continue.

## Verification boundary

The checks below cover the authored model, not completion of retained native
research. Paths beginning `internal/` refer to the separate server repository;
other test paths refer to this client.

| Requirement | Evidence and boundary |
| --- | --- |
| Ryo, opening and personal saved continuation | `tests/NewCharacterOpening.test.js`; server `internal/store/play_modes_integration_test.go` checks mode defaults, atomic 08:55/native-bit/location handoff, retries and ownership. The fresh-opening path in `tests/e2e/first-allowance.spec.js` renders the intro and continues to the allowance. |
| Free roam keeps its avatar/context; Story uses Ryo | `tests/PlayModeSession.test.js`, PostgreSQL mode round trips, and `internal/realtime/play_modes_test.go`. The earned ship-ending browser check also switches through the real Free roam/Story sidebar and restores the ending save. |
| Personal calendar/NPCs without separating other players | Realtime tests assert shared geographical room/presence, enforced Story Ryo, separate public/personal clocks and NPC streams, private settlement refresh and stationary clock persistence. `ServerStoryActorPresentation` applies personal authored visibility; this is not all original scheduling. |
| One authoritative outcome | `internal/store/script_events_integration_test.go` and `internal/scriptevent/*_test.go` exercise staging, ownership/revisions, transaction rollback, acknowledged effects, once-only money/items/notebook and stale callbacks. Presentations cannot grant their own durable rewards. |
| Opening → allowance → dojo | `internal/officialscript/first_allowance_integration_test.go` runs the real compiler/engine/database: cancellation pays nothing, acknowledgement saves exactly ¥500, bank-2 bit832 and notebook, and dojo eligibility follows the earned receipt. Rendered checks cover natural/skip completion and reload. |
| Connected S1 investigation and finale | The [sequence checklist](../design/story-event-template.md#connected-progression-checklist), generated official Yarn content and `tests/e2e/first-allowance.spec.js` continuations cover investigation, mirror search, tickets, five workdays, rescue, final battles, keepsakes and departure. The terminal earned QA save has 180 S1 Story flags, 132 S1 notebook flags, both farewell keepsakes, no S2 flags and no active event run. Counts alone are not the proof; the connected challenges and receipts are checked at their sequence boundaries. |
| Consequential challenges are real outcomes | Personal combat uses the shared client engine and reports a trusted result; QTE, observed forklift delivery/race, navigation and motorcycle checks remain server-simulated. Finishing a film cannot substitute for victory. Failure, timeout and cancellation remain retryable; independent encounters save independent milestones. |
| Lost replies, reload, interruption and cleanup | `tests/ScriptEventController.test.js`, `tests/PlayModeSession.test.js`, native scene transaction/runtime tests, server travel/revision tests and the fifth-day sailor browser check cover late starts, failed preparation, stale responses, dropped committed replies, real socket reconnect and restored controls. Completed saves do not replay rewards. |
| Notebook persistence | `tests/JournalStore.test.js` covers page bookmarks and character/mode scoping. Opening pages are unconditional display content; later pages require saved flags. Inventory and money remain the shared character's actual possessions/balance. |
| Provenance and bounded adaptation | The [event template](../design/story-event-template.md) and chapter guides distinguish original files, walkthrough-backed order, authored staging and omitted detail. S2's [input audit](../design/shenmue2-story-feasibility.md) probes representative original formats and records missing integration rather than claiming playable S2 Story. |

Rendered coverage was built from a fresh opening and sequential continuations
of genuinely earned, backed-up local saves. It is **not one uninterrupted
human playthrough**, nor proof of every alternative branch or long walk. Some
browser checks place the player near the next entrance to bound test time;
they do not award future story outcomes. Tofu presentation, incidental prop/
hand detail, some battle/aircraft staging and optional discoveries remain
explicitly unverified or simplified in the checklist. Exact native scheduling,
weather and all room-controller opcodes are not prerequisites for this model.

Run tests serially through `scripts/testing/run-tests.mjs`. Server integration
checks need `NEW_YOKOSUKA_TEST_DATABASE_URL` pointing at a disposable database
and `NEW_YOKOSUKA_YARN_COMPILER` pointing at the real compiler; missing inputs
skip integration tests and are not equivalent to a full-stack pass. Browser
continuations require their corresponding `NEW_YOKOSUKA_*_E2E` opt-in, original
local assets and the matching Story server. Never seed a later result into the
earned checkpoint merely to make its next event eligible.

Local verification is not release clearance. The generated game assets have
not been published as part of this work; production migrations, import/version
alignment, R2 publication, stale-client behavior and live saves still require
the deployment workflow and explicit deployment authorization. The next
recommended acceptance step is an ordinary-player S1 playthrough against a
matched isolated client/server before considering integration or release.

Use a separate local database when testing both worktrees. Do not point the new
client at an older server: the character state and opening APIs are required.
