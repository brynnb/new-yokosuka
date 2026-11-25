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
the scroll in Fuku-san's room or the basket in the rear passage. In the basement,
examine the martial arts book, then choose whether to take it. Declining or cancelling leaves the
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
guide, not recovered native item callbacks. The basement uses the original
physical book and its recovered inspection and pickup owner. Original drawer/basket opening and hand pickup animations are not
reconstructed; the basket remains closed. Each collected source scroll hides
only for that Story character.
The two Warehouse No. 8 readings use the original MK80 room, motion bank, camera curves, scroll models and dialogue.
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
- The two warehouse films and the dojo discovery use the existing personal scene staging and Yarn acknowledgement pipeline.

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


### The two Chinese scrolls

After the first Master Chen meeting, return to Warehouse No. 8 carrying one of the scrolls. Gui Zhang reads the basement Stab Armor document or the poem that Ryo finds behind the dojo plaque. When both are eligible, the warehouse offers Stab Armor first. Each accepted reading returns Ryo to the original MFSY entry 1 at the old warehouse district gate.

| Sequence | Original owner on disc | Possession and settlement |
| --- | --- | --- |
| Dojo discovery | Disc 1 JHD0 MAPINFO, frame-dispatch loop at `0x36e4a–0x37726` | The original `GART` plaque conceals `MKCS`. The discovery sets bank 2 bits 548 and 903. Personal Story also grants the one-slot Mysterious Scroll key item. |
| Fierce Tiger poem | Disc 2 MK80, SA1109 scheduler `0x4a0c–0x4e94`, exit `0x2c32–0x2c4a` | Disc 3 MS08 tests possession bit 548 and unread bit 547. Gui Zhang reads the poem, explains its meaning requires the master's instruction, and gives it back. Completion sets 547. |
| Stab Armor | Disc 2 YDB1 possession writes `0xf432` and `0xfa7e`. Disc 2 MK80 SA1108 scheduler `0x37b0–0x3a74`, exit `0x2cc6–0x2cde` | Disc 3 MS08 tests possession bit 969 and unread bit 549. Completion sets 549 and unlocks **Read** for the retained move scroll. The player learns Stab Armor through that inventory action. |

Declining, cancelling and interrupted playback leave the personal save eligible for another attempt. Earlier Story characters who own the inventory item can start the reading even if their pickup predates the native possession write. Conversely, a native possession bit can admit an imported character who has no matching inventory row. Accepting the reading restores that one physical item. The bank-2 selector is in Disc 3 MS08 MAPINFO at `0x2848e–0x28568`.

The dojo's 808-frame discovery uses Ryo's original `AKI_TORU_MAKIMONO_ETC_DOUJOUTANSAKU_FE_0100` performance, the actual stool, plaque and scroll, and ECAM 711–716. Ryo speaks at frames 180 and 390 and takes the scroll in his right hand at frame 350. Personal Story starts the climb when the player examines the plaque, condensing the preceding box carry. The short lift/lower curve approximates the native plaque-specific object clips 7055 and 7056. The initial camera blend for shot 713 continues from the previous shot's final view.

The warehouse films lease the original MK80 room and play the paired `M_MK80` Ryo and Gui Zhang body motions. SA1108 schedules eight original ECAM shots and fourteen English lines. SA1109 schedules thirteen shots and twenty-three lines. Both preserve the original CHRS scroll variants, wrist controls, attachment offsets, visibility changes and English SRF subtitle/mouth cues. The player invitation is authored. Detailed hand-shape changes, incidental sound cues and the original fades remain outside the warehouse adapters.

The basement pickup uses the selectable `BOOK` bound to `MKIS3C3G` in Disc 2 YDB1 MPK00/CHARA.CHRT, record `0x1520`. Its original pose is browser `[-2.803,1.002,7.4078]`. Mode 1 at MAPINFO `0xf95c` plays E1012A299 and A300. Mode 2 at `0xfa4c` sets 969. The pickup inspection camera and menu labels are adapted. A second owner branch named `MAKI` speaks E1012A079/A080 and sets the same bit. Its scene placement remains unresolved.

The two staging generators are `tools/scripting/build_dojo_scroll_staging.mjs` and `tools/scripting/build_warehouse_scroll_staging.mjs`. They verify the disc inputs, write the original runtime assets and regenerate each scene's timeline. Then run `build_story_investigation.mjs` against the paired server checkout. Migration `019_story_mysterious_scroll.sql` defines the key item.

A connected Radeon browser run with an isolated character covered the real plaque click, both discovery lines, decline and cancellation, all twenty-three SA1109 voice/subtitle pairs, MFSY arrival, inventory and reload. The dojo rendered its plaque, stool and Ryo through frame 807. The loose scroll appeared at 170, moved to wrist 18 at 350 and hid at 480. The warehouse rendered the room and both actors through frame 2601. Its folded, open and returned scrolls moved between the original wrists at frames 160, 272, 415, 1661 and 1787, then hid at 2485. A physical basement BOOK check exercised three real picks, both original E1012 lines, decline, cancellation and pickup. Taking it wrote 969, granted one scroll and hid the prop. The restored SA1108 film also passed a separate connected Radeon run through all fourteen lines, cancellation, MFSY return, the inventory **Read** action and saved replay exclusion. For both readings and both pickups, private PostgreSQL and compiled Yarn tests also cover declining, cancelled presentation, native settlement bits, item retention and stale acknowledgements.
