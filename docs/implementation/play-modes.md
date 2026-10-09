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

The current personal clock starts December 3, 1986 at 08:50, at JOMO entry 1
beside Ryo's bed. The recovered OP00 program's final clock write is 08:55;
settling that arrival and its native effects is still part of the pending
[story-controller integration](../design/storyline-gameplay.md#original-first-allowance-evidence).

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

The existing waking-day clock runs at 25 game seconds per real second and skips
23:30–08:30. Story time advances while its WebSocket is connected, including
ordinary dialogue, and is checkpointed even when standing still. It pauses on
disconnect or a mode switch. Original sleep routines and event-driven time jumps
are not newly implemented here. Free roam uses the configured server weather
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
the private character profile. Further entries still need reviewed event/flag
mappings; notebook display never grants progress itself.

The last viewed page is a browser-only preference, stored as a stable page ID in
`localStorage` under `new-yokosuka.notebook-page.v1:<characterId>:<playMode>`.
Closing/reopening or reloading resumes that page. Different characters and
modes have separate bookmarks; unavailable storage leaves in-session navigation
working. The bookmark never unlocks entries or changes server progress.

## Current limits

This is the mode/persistence foundation, not complete playable story coverage.
The native interpreter and the server/Yarn event engine still have distinct
state representations. Server events can now query and settle original native
banks atomically with rewards. The client applies committed native receipts
after presentation cleanup, and the server refreshes only that player's NPC
schedules. Existing named-flag routes still need to adopt the bridge;
the authored first-allowance prototype now refreshes the balance and earned
notebook page from durable receipts. It uses a small hallway volume, the
original `01KOZ` presentation and server-owned one-time effects without booting
the native room controller. Server/Yarn scenes pause the personal clock until
their event lease ends; ordinary native conversations retain their previous
clock behavior. See the [event specification](../design/story-event-template.md).
Mode isolation does not
make arbitrary client-submitted native flags server-validated. Notebook entries
beyond the opening, unimplemented quest triggers, original sleep/deadline behavior and
event-driven calendar changes remain tracked in
[storyline gameplay integration](../design/storyline-gameplay.md).

Use a separate local database when testing both worktrees. Do not point the new
client at an older server: the character state and opening APIs are required.
