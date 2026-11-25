# Story move learning

Story begins with 33 moves. Eight taught techniques and nine readable scrolls
are connected to personal saved progress. Combat Practice still offers the whole
catalog and never teaches Story Ryo. Per-move proficiency growth and existing
expert-animation balancing are unchanged.

## Learning sources

| Technique | Source and earliest availability |
| --- | --- |
| Pit Blow | Fuku-san, dojo, after the first dojo visit; 09:00–19:00 |
| Double Blow | Yamagishi-san, Suzume Park approach, after his black-car clue; 10:00–16:30 |
| Swallow Dive | Gui Zhang, Alpha Trading approach, after first workday payday; 17:30–23:30 |
| Shadow Step | Shozo, harbor evening route, after first payday and the chicken race; 17:30–23:30 |
| Shadow Blade | Shozo, harbor evening route, after second payday and Shadow Step; 17:30–23:30 |
| Cross Charge | Shozo, same practice approach, after fourth payday and Shadow Blade; 17:30–23:30 |
| Tornado Kick | Existing Tom farewell lesson |
| Swallow Flip | Existing Master Chen departure lesson |
| Twin Blades | Scroll pickup in Fuku-san's room |
| Shadow Reaper | Scroll pickup near Iwao's room/passage |
| Stab Armor | Scroll in the hidden basement; take it to Gui Zhang for the original voiced SA1108 translation |
| Rising Flash | Bunkado Antiques, ¥500 |
| Mud Spider, Crawl Cyclone, Twin Swallow Leap | Bunkado Antiques, ¥1,000 each |
| Tiger Storm | Bunkado Antiques, ¥2,000 |
| Arm Break Fire | Bunkado Antiques, ¥3,000 |

Walk into a lesson approach to receive an optional offer. In the house, examine
the scroll in Fuku-san's room or the basket in the rear passage; the basement
scroll still uses an authored approach. Declining or cancelling leaves the
offer available to retry. Lessons use the shared combat
controls and complete on an actual finished move; counters require the partner's
incoming strike. They are nonlethal and have no time limit. Buying or finding a
scroll only grants the item: choose **Read** in Inventory to learn it. The item
remains owned, and a learned scroll cannot be purchased twice.

Optional entry offers use priorities 100–108, below the required Story routes'
200-series band. When several eligible volumes overlap, the shared entry
dispatcher issues one request and holds the approach position while awaiting
the server. Its presentation takes over the movement lock; rejection, timeout
and cancellation release it. The two house scrolls use explicit object picks,
so simply entering Iwao's room no longer interrupts unrelated interactions.

Pit Blow replaces Elbow Slam, Double Blow replaces TwinHandWaves, Swallow Dive
replaces Side Reaper Kick, and Tornado Kick replaces Against Cascade in Story's
move list. Practice retains both variants. The unidentified `nothingSkill`
entry remains sandbox-only.

## Fidelity and approximations

The recovered move definitions provide commands, animations and the 33 starting
entries. Teaching sources, replacements and scroll prices are corroborated by
the firsthand [move guide](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/25383),
[walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404) and
[contemporary guide](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/6804).
These guides are evidence for the adaptation, not original engine source.

The six additional lessons use original actor models and combat animations,
but authored captions, practice spacing and approach volumes. Position anchors
come from the existing dojo spar, Yamagishi/Shozo route endpoints and Alpha
Trading payday area. The house scroll uses original `imk1` in Fuku-san's room;
the passage scroll is selected through original `bkgu` basket, which covers
original `imk3`. The object associations are inferred from placement and the
guide, not recovered native item callbacks. The basement uses an authored
approach. Original drawer/basket opening and hand pickup animations are not
reconstructed; the basket remains closed. Each collected source scroll hides
only for that Story character.
Translation is an acknowledged caption event at Warehouse 8, not a new film.
Later optional lessons remain available after their earliest milestone instead
of reproducing every original missable day/branch window. Shozo's later teaching
is an interactive practice adaptation, not a claim that the original required it.

## Ownership and tooling

- `play/data/story-move-learning.json` is the move/scroll catalog.
- `tools/scripting/story-move-learning.mjs` adapts its entries into ordinary Yarn,
  regions and combat definitions. No parallel quest or combat engine is added.
- Run `build_story_move_learning.mjs`, then `build_story_combat.mjs` and
  `build_story_investigation.mjs` with `NEW_YOKOSUKA_SERVER_DIR` set to the matching
  server checkout. The investigation compiler also needs the original extracted
  discs, as documented in the existing Story authoring workflow.
- The server's generated scroll catalog and migration `015_story_move_scrolls`
  add the nine inventory definitions. Deploying requires that migration and
  importing the updated official scripts; changing client code alone is not enough.
- Lessons and purchases settle through the existing Yarn transaction. Inventory
  reading uses authenticated `POST /api/characters/:id/use-item` with `itemKey`
  and `modeRevision`, validates ownership/Story/translation, and saves the
  corresponding `story.s1.<move>.learned` flag under the character lock. Active
  Story events block reads, and retries do not increment the revision twice.
- No new proficiency algorithm, multiplayer AI, combat RPC or extracted asset
  package is introduced.

Focused verification covers real combat command completion, compiler/event/database
settlement, cancellation, purchases, translation, saved flags, mode fencing and
inventory timeout/retry/stale-response handling. Browser tests separately exercise
the renderer, teacher models, keyboard input and scroll UI; headless tests are not
visual proof of original staging fidelity.

For the real pickup/inventory/server path, the earned-save continuation in
`tests/e2e/first-allowance.spec.js` accepts `NEW_YOKOSUKA_SCROLL_LEARNING_E2E=true`.
Use an earned Story character that has not collected Twin Blades, or select
Shadow Reaper with `NEW_YOKOSUKA_SCROLL_MOVE_ID=shadowReaper`. This checks the
actual pickup choices, Read request, retained item and Story/Free roam round trip
without granting a prerequisite or learning flag through the test fixture.
The November 9 isolated rendered checks use the actual Fuku-room object and
open the actual passage door before using the basket. For each, leave and
cancellation grant nothing; retry, pickup, Read, retained item and the
Story/Free roam round trip pass. The tests reposition near the objects and seed
an earlier notebook clue; they do not prove a fresh full-story route or basket
opening choreography. The earlier October 23 home continuation exercised the
older approach-based implementation.


### Gui Zhang reads Stab Armor

After the first Master Chen meeting, enter Warehouse No. 8 with the untranslated basement scroll. The optional offer is followed by the full 14-line SA1108 exchange when accepted. The Disc 2 MK80 room table at 0x5394–0x542d gives the spoken order across Ryo and Gui Zhang. The English SA1108 archive supplies the original voices, speaker IDs, subtitles and mouth cues. SA1109 is a separate reading of the mysterious poem. The camera and standing poses for this warehouse conversation are adapted.

Declining or cancelling keeps the scroll untranslated. Completing the conversation records the translation, retains the scroll and enables the separate inventory **Read** action. Reading teaches the move. Existing learned and translated scrolls retain their saved status.

A connected browser run with a test character carrying the untranslated scroll covered cancellation, re-entry, all fourteen original voice and subtitle pairs in order, then learning the move from inventory and reloading. The scroll remains in inventory after learning. Earlier campaign prerequisites were supplied in that character’s checkpoint.
