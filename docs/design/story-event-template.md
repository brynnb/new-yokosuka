# Story event template

Story events combine readable, authored progression with original game assets.
Walkthroughs and gameplay footage establish the important sequence; decoded
characters, motion, dialogue, voices and cameras supply the presentation.
The server decides eligibility and saves the outcome. Playing the original
Dreamcast room controller is not a prerequisite.

The template is a content specification, not a new executable format.
Implement events through the existing server/Yarn system and shared scene
player, rather than introducing another quest engine or renderer.

## Reusable template

Give each event a stable ID, a readable name, and its game and play mode. Copy
these fields for each event; write `none` when a field does not apply.

| Field | What to specify |
| --- | --- |
| Location | Zone, room and the part of that space used by the event. |
| Prerequisites | Required progress, items, character, personal date or time. |
| Trigger | Crossing an area, approaching someone, interacting, or completing another event. |
| Player setup | Starting position and facing, alignment, and controls to lock. |
| Characters | Who appears, their positions, motions and personal visibility changes. |
| Props | Important objects, attachments, pickups and handovers. |
| Action sequence | Ordered actions and any branches or choices. |
| Dialogue | Speaker, subtitle and voice references; choices and their outcomes. |
| Timing | Start/end cues, waits and the events that advance the sequence. |
| Camera shots | Framing, targets, zoom, transitions and shot-change cues. |
| Weather and lighting | Broad weather, season and lighting settings, or preserve the current environment. |
| Audio | Music, important effects and ambient sound; when they start and stop. |
| Interactive challenge | None, QTE, fight or minigame; prompts, input windows and result branches. |
| Completion effects | Flags, notebook entries, rewards, personal clock and NPC changes. |
| Exit behavior | Final zone, position, facing, restored camera and controls. |
| Skip, failure and replay | Accepted endings, retry behavior, saved continuation and repeat policy. |

Tie timing to voice lines, animation markers and completed actions wherever
possible. A whole-scene timeout is a failure, not evidence of completion.
QTEs need explicit input windows and outcomes; a finished animation is not a
successful QTE.

Label original-data facts, walkthrough-backed facts and adaptation choices
separately. An unresolved coordinate or clip ID stays unassigned until a quick
placement or asset check; it is not a reason to reconstruct unrelated engine
systems. Approximate lighting, camera framing, gestures and effects explicitly.
Keep consequential outcomes and story order reliable.

## Ine-san first allowance

Event ID: `s1.jomo.first-allowance`.
Play mode: personal Story mode, as Ryo. The personal-story worktree implements
this as a local prototype using the server's official Yarn import
`jomo-first-allowance` and the shared `first-allowance` scene package.

Rendered tests cover natural completion, X-skip, the earned notebook page and
reload without replay or another payment. The source presentation retains the
original camera, body motion and eleven voice lines. The shared package binding
now supplies Ryo's YKC and Ine-san's INE detailed faces with their original SRF
speech cues. On October 22, natural completion and saved continuation passed
in a hardware-rendered browser; both actors' model-local face vertices and
mouth controls changed over the scene. The fresh-character run also skipped
all four opening packages, walked through the real bedroom door, completed the
allowance naturally and reloaded its saved continuation. The separate allowance
skip passed. On November 8, a fresh isolated-server run played all four opening
films at natural speed, walked through the bedroom door, completed the allowance
and verified the payment, notebook and saved reload. Sampled frames show the
principal opening cast and Ine-san's envelope handover; they do not establish
complete shot-by-shot, animation or audio fidelity.
The October 23 follow-up restores the original allowance envelope and handover.
Rendered native shots show Ine-san offering the textured envelope, Ryo holding
it after release, and its disappearance at the authored end cue. Presentation
cancellation during the handover and natural completion restore the prior
avatar, position, camera and controls without changing progress. Separate
connected tests pass the actual allowance trigger, one ¥500 payment, notebook
and reload without replay/payment for both natural completion and X-skip.
Those bounded tests use the real opening-completion API; the fresh-bedroom
walk above was verified separately on October 22, not rerun for this prop fix.

The October 22 source audit located the original `KOZU` handover in JOMO's
`0x634ec` callback (MAPINFO SHA-256
`4af865fbb62a06e917d6625149f4bcf77fa6a6bba19b08b8433440f96712a2b9`).
Call `0x6395a` attaches it to `INE_`, right-hand control `18`; `0x63a2e`
detaches it back to the original AUTH world-motion track. The October 23
follow-up found its original static definition in
`COMMON01.PKF`'s `CHARA.CHRT`: character offset `0x5b34`, image property
`0x5bc4`, `FUTHI10G` → `FUTS5OKG.CHRM` (1,956 bytes in `COMMON01.PKS`, SHA-256
`2b6031cbd7c81f5eddb56035155bedd072d565d550922083de601e5820af5951`).
The definition also declares `RefBoard` and shares the model with `KFUT`.
The CHRT hash
is `8853f1c13eb220aaeff0075380eccd1278e06484a147773ca43e69c0b459a1ab`.
Do not substitute the nearby `MALS530G`: the same table binds it to `TEGA`,
not `KOZU`. The callback uses a signed 16-bit clock at frame offset `62`;
the shared extractor now recognizes its immediate-indexed load rather than
requiring a scene-specific frame override. The source-derived cues are:

| Frame | Envelope presentation |
| --- | --- |
| 0 | Hidden before the offer |
| 775 | Shown and attached to Ine-san's right-hand controller |
| 1035 | Released to AUTH's world motion for Ryo's receipt |
| 1630 | Hidden as Ryo puts it away |
| 1696 | Terminal attachment cleanup |

The package includes the original detailed hands, five static hand-pose cues,
both wrist adjustments and two final body-hand cues. The shared bounded-vector
compiler now recovers `0x63734` over frames 951–1000: the original left wrist
adds `[0,47,94]` per native tick. It also restores the preceding left-wrist
constant, previously withheld to avoid publishing a partial frozen lane.
A hardware-rendered complete/cancel recheck passed with both speaking faces,
all eleven recordings and the envelope transfer; frame 1000 was visually
reviewed. This presentation recheck does not supersede the connected payment
checks above. The `RefBoard` behavior and full finger/expression fidelity are
not certified by these checks. Only the envelope's referenced
textures are exported (9 KiB), not the full 1.6 MiB shared character pack.

On November 7, the original AUTH `dor0` track was matched by its first-frame
position to the existing `dor7` bedroom-door placement: both use browser
coordinates `(-16.302, 0, 1.833)`. This is not the unrelated exploration `dor0`
entrance door. The normal scene-object lease now borrows the actual bedroom
door and restores its prior visibility and transform after completion or
cancellation. Hardware-rendered cancel/replay and full-scene checks show the
door opening as Ryo emerges and verify restoration. A separate isolated-server
run reaches the allowance from the hallway, plays the scene naturally, and
checks one payment, notebook and reload; it completes the opening via API.
The precise finger/knob contact and native `RefBoard` remain unverified.

The original event occurs after Ryo first leaves his bedroom. Ine-san gives him
¥500, explains the daily allowance and directs him to Fuku-san at the dojo.
The scene plays once; later daily allowance collection is a separate event.
See [Shotgunnova's walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404)
and [Crazyreyn's walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/28233).

### Event definition

The table below is the intended adaptation. Original asset and flag identities
are documented separately under [Original data](#original-data).

| Field | Event definition |
| --- | --- |
| Location | Shenmue I, Hazuki residence interior (`JOMO`), hallway outside Ryo's bedroom. |
| Prerequisites | Story mode; opening completed; this character's first-allowance milestone not completed; no other activity owns the player. No extra weather or exact-minute requirement. Use the saved personal calendar rather than the public clock. |
| Trigger | Cross the bedroom doorway into the hallway after the opening. The prototype uses a small authored activation area on the hall side of the existing bedroom door (`dor7`), not a door-click trigger. Its bounds are stored in the shared story-region catalog and tested with rendered hallway entry. |
| Player setup | Use the current Story-mode Ryo. Lock gameplay movement and interactions; align him to a nearby safe hall position facing Ine-san. Pause the personal clock for the scene and resume it afterward. |
| Characters | Ryo (`AKIR`) and Ine-san (`INE_`). Stage only this player's actors; suppress their overlapping ambient copies locally. Fuku-san is mentioned, not added to this scene. Restore normal personal NPC presentation afterward. |
| Props | Depict the money handover with available original props and clips. A simple handover gesture is an acceptable declared approximation; no banknote physics is required. |
| Action sequence | Align the actors, exchange the greeting/rest concern, present the allowance handover, explain future collection, mention Fuku-san, then settle and restore gameplay. |
| Dialogue | Prefer the original `01KOZ` subtitles and voices. The beats above describe the conversation, not replacement dialogue or invented voice IDs. No branching choice is needed. |
| Timing | Advance dialogue and shots using the actual line/clip cues. Complete the handover action before finishing the scene. Do not grant money when an arbitrary timer expires. |
| Camera shots | Reuse decoded scene cameras if readily usable. Otherwise author a medium two-shot, speaker-facing shots and a brief handover view. These replacement shots are approximations; exact transforms and clip cues need a staging check. |
| Weather and lighting | Preserve the personal season/weather outside and ordinary house lighting. No forced rain, snow, sun angle or exact particle timing. The fresh opening's morning calendar supplies the initial mood; do not reset the date on a delayed trigger. |
| Audio | Use the original voices and available scene effects. Keep ordinary interior ambience; duck conflicting background audio during speech and restore it on exit. Do not invent an original music ID. |
| Interactive challenge | None. This is a conversation/cutscene, not a QTE, fight or minigame. |
| Completion effects | Atomically mark the one-time milestone, grant ¥500, add the two notebook notes below, apply the reviewed native compatibility write, and record this personal date as already paid. No inventory item, date jump or immediate second daily payment. |
| Exit behavior | Remain in `JOMO` at the safe final hall position. Restore the player's previous camera mode and controls after cleanup. The next objective is speaking to Fuku-san at the dojo; do not teleport the player there. |
| Skip, failure and replay | An explicit skip after the server authorizes the scene counts as completion and settles the same effects once. Cancellation, preparation failure and timeout settle nothing and allow retry. Reconnect reads the server receipt: a committed scene stays completed even if its reply was lost. A completed scene does not automatically replay. |

The one-time milestone uses the existing personal script-state store; its name
is a proposed content identifier, not a new save system. The server must deduplicate
the event settlement so retries cannot pay twice. Future daily collection should
use the personal story date and the same payment record, separately from this
opening conversation.

### Notebook additions

Append one stable page after the opening pages, with two lightly adapted notes:

- Ine-san leaves ¥500 on the shoe cabinet each day.
- Visit Fuku-san at the dojo.

The page is unlocked only by the durable completion receipt and is not appended
again on reconnect or replay. Force Vector's
[notebook transcription](https://www.neoseeker.com/shenmue/faqs/45817-notebook.html)
places these facts immediately after the starting notes.

### Original data

The [first-allowance evidence](storyline-gameplay.md#original-first-allowance-evidence)
identifies the original event owner `0x60fe8`, its `01KOZ` resource request at
`0x610c6`, and activity `35` at `0x611b2` in Disc 1 JOMO `MAPINFO.BIN`.
The [Japanization guide](https://shenmuesubs.sourceforge.net/howto/shenmue1/addons/S1_JPG_083.pdf)
also identifies `01KOZ` as the first-allowance dialogue archive.
These are source identities, not a claim that a playable allowance package
already exists.

That owner writes native bank 2 bit `832 = 1` at `0x61002`. Apply the reviewed
write with successful server settlement, rather than before presentation as
the original owner does. This timing change makes cancellation safe. Other
original initialization branches also write bit 832, so it must not replace the
new event's one-time milestone or be described as an exclusive allowance flag.

Opening completion owns native bit `2:961` and the bedroom arrival; do not grant
those prerequisites as a side effect of starting the allowance. Temporary room
fields, native STEP arithmetic and interaction-manager registration are not
eligibility requirements for this authored event.

### Gameplay acceptance

A fresh Ryo can finish or skip the opening, leave the bedroom, receive this
scene once, gain exactly ¥500 and read the new notebook page. Staying in the
bedroom does not trigger it. Reloading preserves completion, returning through
the doorway does not pay again, and a failed/cancelled preparation remains
retryable without changing money or notes. Free roam and other players remain
unaffected. The final camera, controls and NPC restoration require a rendered
gameplay check, not only a state test.

The focused rendered checks use a real isolated server/database and restored
local assets: set `NEW_YOKOSUKA_STORY_E2E=true` and run
`tests/e2e/first-allowance.spec.js` against that development URL. The two bounded
allowance variants mark the opening completed through the real API and reset
to the hallway to isolate natural completion and skip behavior.

The `fresh opening` variant instead creates a new Story-mode Ryo, loads all four
intro scenes and uses the normal X-skip for each. Set
`NEW_YOKOSUKA_NATURAL_OPENING_E2E=true` to run only that fresh variant with all
four films playing at natural speed and periodic rendered captures instead.
Both modes check that the server has
not recorded completion early, rejects an early gameplay connection, verifies
the actual bedside arrival and saved 08:55 handoff, then walks
through the bedroom doorway with normal input/collision and no hallway reset.
It waits for natural allowance completion, checks the one-time payment and
notebook page, and reloads to verify the saved avatar, position, controls and
absence of replay/payment. The test clicks the rendered door if it is closed;
an already-open door retains its pose. Source-program initialization, complete
shot-by-shot audiovisual fidelity and mid-event network loss are separate
checks, not claims made by this test. Do not run it against production.

The connected dojo and kitten extensions require the corresponding official
scripts to be published in the isolated test database. Use the server's
documented `cmd/script-import -builtin` workflow with `jhd0-first-dojo` and
`ju00-first-kitten`; loading the allowance script alone is insufficient. A
`no_script` response to an automatic room-entry check may instead be the
expected native-fallback signal, not an entry-trigger failure.

## Subsequent daily allowance

The [contemporary GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
(printed p. 11) places Ine-san's ¥500 daily allowance on the foyer shoe
cabinet. The original JOMO placement `KFUT` uses the same `FUTS5OKG` envelope
model as the first allowance handover. An authored walking region near that
cabinet now offers the daily payment after the first handover. The existing
`story.s1.allowance.last-paid-day` receipt and the personal Story calendar
prevent a second payment on the first day or after reload. The date and ¥500
settle atomically after the unvoiced line is acknowledged; cancellation pays
nothing. Missed days do not accumulate. Older saves without a day receipt can
collect once and then receive the same ordinary protection.

An isolated, hardware-rendered run with only the first allowance and its
same-day receipt seeded walked into the foyer, checked no first-day payment,
waited for tomorrow, cancelled and retried, reloaded, checked no duplicate and
collected again the following day. The database contained two ¥500 ledger
entries. Test positioning shortened the approach; movement through the region
used normal controls. The walking volume and caption are authored; an actual
hand pickup animation and exact native behavior after Ryo starts harbor work
remain unverified. This adaptation currently continues the allowance during
employment rather than inventing a cutoff. It does not change Free roam.

## Iwao's farewell letter

The original JOMO placement `TEGA` / `MALS530G` is the letter on Iwao's desk.
The native JOMO dialogue region at function `0x8421c` lists `01LETB006`, then
`01LETB001`–`01LETB005`; these are Iwao's original six English recordings and
subtitles from hash-checked `01LET.AFS`. Examine the letter to hear them in
that order. Completion records a personal read flag, but does not grant an
inventory item or advance the main story; cancelling records nothing, and the
letter can be reread. The proximity, dialogue overlay and durable receipt are
authored adaptations; original close-up/paper/hand choreography and the exact
native availability cutoff remain unresolved. The six extracted voice files
must be published before any future deployment of this branch.

An isolated rendered browser check with the initial allowance seeded picked
the real desk letter, heard the first original line, cancelled, retried,
completed and reread it, then reloaded and read it again. It checked the saved
flag, unchanged inventory and money, and restored controls. A separate real
Yarn check verifies all six voice IDs and their order. The test repositions
near the desk and is not a full natural walk from the opening.

The separate 01MEM visit plays after Xia translates Zhu’s letter. Return to the
Hazuki home before the Master Chen phone call to show Fuku the memo. The
[home conversation notes](story-fuku-home-conversations.md) cover this film
and the evening visit after Jimmy.

## Fuku-san: the first dojo visit

Event ID: `s1.jhd0.first-dojo`; official Yarn import: `jhd0-first-dojo`.
This is the next connected encounter, not the later Pit Blow lesson (`E1017`)
or the Chinese-cartel conversation (`01KAK`).

| Field | Event definition |
| --- | --- |
| Location / trigger | Enter the authored dojo entrance/floor volume in Hazuki grounds (`JHD0`). The server validates its accepted player position independently. |
| Prerequisites | Personal Story mode, completed opening and first allowance, no completed first-dojo milestone. No extra date/weather restriction. |
| Player / actors | Ryo and Fuku-san, using the existing MSKA actor ownership, personal staging and cleanup. Movement is locked by the shared event presenter. |
| Sequence | Eleven original `SA1116` dialogue lines: ask about Lan Di, the mirror and the men in black. Then the original `MSKA/SEQDATA2.AUTH` ending: Ryo resolves to avenge his father. |
| Timing / cameras | Lead-in lines use decoded voice lengths plus a 0.3-second pause. Hold MSKA's initial actor poses, turn them inward, and use an authored two-person camera; then run its original timeline unchanged. The lead-in staging is an approximation, not recovered original conversation animation or camera direction. |
| Audio / weather | Original SA1116 and A0125 voices/subtitles; original MSKA effects and BGM202. Extending that music over the lead-in is an adaptation. Preserve the personal environment; no forced weather or calendar jump. |
| Props / challenge | None. No QTE or combat; this is not the optional sparring lesson. |
| Effects | Atomically set `story.s1.first-dojo.completed` and `notebook.s1.men-in-black`. Add the next investigation page; do not grant currency, items or a made-up native flag. |
| Exit / failure | Return the borrowed avatar to its entry position in Hazuki grounds, with camera and controls restored. Explicit X-skip completes the presentation; failure/cancellation leaves the event retryable. Repeat entry cannot settle twice. |

### Provenance and limitations

The [Notebook Guide](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/14458)
places the men-in-black objective after entering the dojo following Ine-san's
allowance. The [Japanization Guide](https://shenmuesubs.sourceforge.net/howto/shenmue1/addons/S1_JPG_083.pdf)
identifies SA1116 as Ryo asking Fuku-san about the attackers and A0125 as his
resolve to avenge Iwao. The original JHD0 owner `0x3aec8` supplies the eleven-line
order and selects the MSKA ending. Source hashes remain in
`tools/evidence/mska-native-lifecycle.json` and the generated audio manifest.

`tools/cutscenes/build_first_dojo_assets.mjs` reads the original AFS subtitles
and speech, decodes the eleven voices, measures their durations and registers
them for runtime asset recovery/publication. It does not execute or translate
the room controller. `AuthoredActivityLeadIn` feeds
that bounded staging into the same scene presentation/ownership system used
by the original ending. The original MSKA selector preview remains unchanged.

The October 23 recheck caught eleven absent, unregistered SA1116 recordings:
the dialogue metadata and ending film could run despite the silent lead-in.
The canonical builder restored the original recordings; the all-package audit
now checks both local files and runtime registration. These new local assets
still require publication before a deployment.

The connected local browser check starts after the opening-complete API,
earns the allowance, reloads, walks into the dojo, cancels without granting a
clue, re-enters, completes naturally, and verifies the seventh notebook page
and another reload without replay. Camera, movement and actor ownership return
cleanly, including the entry position. Separate full presentation playback
records all eleven SA1116 and five A0125 voices actually playing, with YKC/FUK
mouth vertices changing during speech. Reviewed captures cover the lead-in,
ending shots and detailed faces; a cancellation also restores state without
progress changes. Poses in the lead-in are held rather than recreating the
original conversation gestures. Audio fidelity was not assessed by listening.

On November 8, a fresh connected run skipped the four opening films, earned and
reloaded the allowance, clicked the actual JOMO front door into JHD0, then
placed Ryo just outside the dojo trigger. Normal movement entered the scene;
cancellation, retry, natural completion, notebook and reload passed. This tests
the real door and trigger, not the full walking route between them.

A later isolated hardware-rendered run starts from a seeded allowance checkpoint
and a test-only placement beside the house door. It clicks that real door and
then uses normal forward movement and camera steering around the courtyard and
up the west-facing dojo stairs, without another position reset. The natural
dojo trigger, full unskipped conversation, saved men-in-black notebook page,
restored first-person camera and controls, actor-lease cleanup, and reload
without replay all pass. The documented original JHD0 code-10 stair boundaries
identify the traversed flight. This proves the courtyard route, not a fresh
opening or the complete walk through the residence interior.

A subsequent full-catalog run exposed a dispatch conflict that isolated
single-script fixtures missed: the first dojo entry and optional Pit Blow both
used `enter/JHD0` priority 100. The server intentionally rejects that tie before
Yarn evaluates either script's prerequisites or bounds. The canonical optional
learning band now uses priorities 50–58, below the older priority-100 main
entries as well as the newer routes. Combined-catalog validation and
`TestFirstDojoDispatchWithOptionalMoveLesson` pass with the real Yarn compiler
and isolated PostgreSQL: first-dojo cancellation does not settle, natural
acknowledgement saves the notebook, and the completed dojo subsequently yields
to the eligible lesson without granting a move on decline. Ambiguous-trigger
protection remains intact. The continuing fresh character that earned the
opening and allowance has now entered and completed this dojo scene naturally;
the broader fresh route is still in progress. The fix is recorded in client
`6e36c0b5` and server `5a50a96`.

The notebook page is a lightly adapted investigation prompt. Exact native
notebook flags are not implemented. Do not describe the first conversation as
fully animation-faithful.

### Attempting to leave before the dojo

Disc 1's original `SA1082.AFS` (SHA-256
`adce9e48ca715829f6e26b6a0668ae623741487098a60ceb03d20d83283b0d2a`)
contains Ryo's lines about asking Fuku-san;
the [Japanization Guide](https://shenmuesubs.sourceforge.net/howto/shenmue1/addons/S1_JPG_083.pdf)
identifies the archive as the attempt to leave before talking to him. When a
Story character who earned the first allowance clicks the physical residence
gate before completing the dojo visit, the gate now stays shut and a short
notice displays and plays the original `SA1082A005` line. Completing the visit releases
the gate; later saved black-car progress also supersedes this condition. Free
roam, uninitialized/older saves without the allowance milestone, and other
doors are unaffected. This rule is personal and client-side, and the explicit
travel menu remains an escape hatch rather than a hard multiplayer lock.

An isolated hardware-rendered browser check earned the allowance, clicked the
real gate and saw the reminder, cancelled and retried the dojo scene, waited
for its natural ending, verified the saved notebook and reload, then clicked
the gate again and reached Yamanose with controls restored. Nearby test-only
placement bypassed walking between the door and dojo. A separate focused
hardware-rendered check with a seeded isolated character observed the voice
start and finish, unmuted at the current dialogue volume; it did not establish
listening-level fidelity or repeat the full earned progression. Replacement,
world travel, failed playback and disposal release the short voice. Exact
native selection between the five SA1082 lines and the original full-dialogue
staging remain unresolved.

`tools/audio/build_story_travel_voices.mjs` verifies the pinned archive, checks
the source subtitles against the displayed line, decodes with `VGMSTREAM_CLI`
and registers the ignored audio file in the immutable runtime asset catalog.
For this build, the reviewed [vgmstream decoder at commit `6802153425`](https://github.com/vgmstream/vgmstream/tree/6802153425adde134e49394fc653455166d7d2f2)
produced sample-identical PCM to a previously decoded SA1116 reference. The
new gate recording has not been published to R2 and must be included in any
future deployment.

### Connected progression checklist

This is a grouped integration record, not a complete event inventory or a
blanket presentation sign-off. Use the [master event list](../reference/shenmue1-story-event-master.generated.md)
for individual events, optional branches, lessons, recurring interactions and
unresolved coverage. In particular, the allowance progression receipt below
does not establish working mouth animation or envelope presentation.

#### Same-character continuation — November 13, 2026 campaign

The [accepted continuation manifest](../../tools/evidence/earned-story-continuation-20261113.json)
indexes 71 passing selected phases on character 5 after its fresh opening and
first allowance. These are staged browser continuations, including retained
failed attempts that had already saved legitimate progress. Prerequisite flags,
items and outcomes were not reseeded. Travel shortcuts and supported skips are
disclosed per phase; the groups below are evidence ranges, not a new event census.

| Evidence group | Selected phases | Accepted attempts | Scope |
| --- | --- | --- | --- |
| Early investigation | 15: POST_ALLOWANCE → PHONE | POST_ALLOWANCE:early-r5-01 → PHONE:harbor-r2-03 | Dojo and witnesses through the Chinese letter and phone lead; retained partial settlements remain part of the record. |
| First harbor visit | 6: EARNED_BUS → CHEN | EARNED_BUS:harbor-r2-04 → CHEN:harbor-r3-03 | Earned directory and physical bus approach, arrival, warehouse access, stealth and the first Chen meeting. |
| Mirror search | 9: FAMILY → MIRROR_RETURN | FAMILY:family-r2-01 → MIRROR_RETURN:route-r5-01 | Family clue, handguard, dojo puzzle, genuine axe/mirror acquisition and return meeting. |
| Ticket and Chai | 6: HOME_TICKET → JIMMY_CHASE | HOME_TICKET:route-r5-02 → JIMMY_CHASE:route-r7-02 | Travel funds and ticket chain, selected Chai victory, then Jimmy's chase and interrogation. |
| Harbor employment | 19: HARBOR_HIRING → CHEN_WARNING | HARBOR_HIRING:route-r7-03 → CHEN_WARNING:route-r17-02 | Hiring, training, five workdays and warning; the biker route includes an effect-free Swallow Dive decline. Fourth-afternoon continuation combines the previously earned Goro ending with four actual deliveries, once-only wages and Mark/reload checks; earlier pickup/drop causes remain unresolved. Only selected saved race/photo/chase branches; no optional move-learning acceptance. |
| Nozomi rescue | 5: NOZOMI_CALL → NOZOMI_HOME | NOZOMI_CALL:route-r17-03 → NOZOMI_HOME:route-r22-02 | Call; earned transport scenes preserved on resume; physical timed ride plus no-replay checkpoint; warehouse rescue and natural ride home. |
| Final day and departure | 11: FINAL_DAY_MORNING → SHIP_DEPARTURE | FINAL_DAY_MORNING:route-r22-03 → SHIP_DEPARTURE:route-r26-06 | Final day, the selected lessons and battles, introduction letter and amulet, then the authored ship endpoint. |

The accepted HARBOR_BIKERS attempt `route-r13-01` (497.31 s) declines only the eligible Swallow Dive offer through its normal UI,
with resources unchanged and no move learned. The required chase, both fight
stages and interrogation settle with retained cancellation/retry and reload
evidence. Its tested helper was committed afterward as `3ec1e018`. Earlier
r11/r12 failures remain in the record; optional move learning receives no new
acceptance.

FOURTH_AFTERNOON passes in `route-r16-01` (223.06 s; Story test 217.044 s;
client `baefd385`). It preserves Goro's ending earned in failed `route-r13-04`,
then accepts the exact inside-region/starting handoff, four actual deliveries,
carry-height contract checks and once-only 2,400 yen wages, ending at 19,836 yen.
HP remains 100 and all eight inventory rows stay unchanged; Mark completes
naturally and the saved result survives reload. Failed `route-r14-01` retains
its handoff failure; failed `route-r15-01` retains two accepted crates and the
third-drop failure. The original pickup miss and r15 drop causes remain
unproven: the added carry check fulfills a known contract, not a diagnosis.
Goro's dialogue used 19 Space presses (18 for introductions and one failure
acknowledgement); two full nine-input QTEs precede the naturally completed final ending. Those introductions and
Tsuyoshi's warning (six quick Space presses) do not establish uninterrupted
voice playback.

FIFTH_AFTERNOON passes in `route-r17-01` (280.71 s; client `ab70b583`)
with five physical deliveries. Centered unloads are observed upright, with
released support and inactive tine collisions before withdrawal; authoritative
receipts remain required. The retained `route-r16-04` failure shows an accepted
server endpoint lying sideways and outside the drop bounds; the tipping
mechanism itself is not established. Once-only wages add 3,000 yen to reach
22,836 yen, and the warning-letter cancellation/retry and saved reload pass
with HP 100 and all eight inventory rows unchanged.

NOZOMI_TRANSPORT passes in `route-r18-01` (20.93 s; Story test 17.176 s),
preserving Saijo's referral, Naoyuki's borrowing permission and both notebooks
already earned in failed `route-r17-04`. That failed attempt retains two
cancellations, two reloads and eleven Space advances of Saijo's dialogue;
Naoyuki's successful retry completes naturally without Space or KeyX. The
BGM200 response assertion was beyond the failed boundary and did not execute.
Saijo's advances do not establish uninterrupted voice playback, and these
attempts make no new audibility claim. The accepted continuation replays
neither transport scene: two ordinary ride-offer declines surround one reload,
with full flags, inventory, yen, HP, world and mode preserved, no ride receipt
granted, and the borrowed notebook/no-replay checks satisfied. It uses no
Space, KeyX, sceneSkip, controller cancellation or walking input. Client
`29722a6c` was committed after that actual acceptance.

NOZOMI_RIDE physically settles in failed `route-r19-01` after one KeyX driving cancellation,
one reload, the normal return to Naoyuki, a real reapproach and retry, saving
its ride receipt and `mfsy`. The KeyX input cancelled driving gameplay. That attempt
still fails at the legitimate next warehouse offer; the earlier `route-r18-02`
bounds failure is retained too. The separate `route-r20-01` passes in 22.48 s
(Story test 18.545 s), preserving the earned ride without repeating it. Two
ordinary warehouse-offer declines surround one reload; complete flags and all
eight inventory rows, 22,836 yen and HP 100/100 remain unchanged. Server
`13a1594` was already active during the physical ride and checkpoint
continuation; client `807834b7` was committed after the latter passed. These
checkpoint checks do not add movie-skip, audio, warehouse-rescue or later-scene
acceptance. Both original failed attempts keep their failed results, and no
receipt reset or outcome reseeding was used.

NOZOMI_WAREHOUSE passes in `route-r22-01` (20.36 s; Story test 13.596 s),
preserving the independently earned outside/inside victory receipts, warehouse
admission, rescue and Terry notebook from failed `route-r21-01`. In r21, the
first directional-input attempt at each battle defeated six then seven
opponents. Two cancellations (the first outside fight and first hostage intro)
and five reloads were exercised; the retry introduction, deal and coda settled
naturally with no Space or KeyX. BGM084's unpaused, advancing media element and
positive volume, plus four HTTP 206 responses, were verified; these checks do
not establish audibility. R21 still failed at the legitimate next home offer,
and its final reload was not reached. The earlier `route-r20-02` knockout also
remains failed. R22 supplies the missing checkpoint proof: two normal home-offer
declines surround one reload, with complete flags, inventory, yen and HP
preserved, idle/unlocked controls, no rescue starts and no active combat. It
replays neither fight nor film. Client `25fc3f0c` was committed after r22 passed.
These staged checks make no home, measured-walking or full-route acceptance
claim; both earlier attempts retain their failed results.

NOZOMI_HOME verifies December 16 arrival at 05:56 and immediate wake at
07:30–07:31. A later connected test began the ride on December 31 and arrived on January 1 at 05:56, then woke at 07:30. A separate December 31 evening bedside run also woke on January 1. That run reproduced a skirt spike with the original model and paired motions. A later retail capture recovered the garment vertices throughout the ride. At shot 4, frame 180, the browser’s longest skirt triangle edge now matches the captured 0.208 m. The [native cloth evidence](../../tools/evidence/nbik-nozomi-cloth.json) records the comparison.

The separate opening baseline naturally completes all four films and the first
allowance, including notebook and saved reload. That original whole test later
failed at the dojo; its opening evidence is not relabelled as a passing whole test.

Final acceptance is `SHIP_DEPARTURE:route-r26-06`: Story mode, `s1-voyage`, departure and
notebook receipts, and one retained introduction letter and Nozomi amulet.
HP, yen and inventory remain unchanged across departure. Actual forward input
moves both actor and collider more than 0.2 m from the earned deck spawn.
Reload and an actual Free roam/Story round trip retain the endpoint without
replaying a cutscene. The terminal snapshot is `earned-ship-departure-route-r26-06/character-state.json`
(SHA-256 `f650b83a4e1e75ec63dec222337e88c4a16d0af21b6b25691c0e6d36400c7c70`); its logs, screenshots and source versions
are indexed in the manifest.

This new continuity evidence does not cover Chai's saved loss/home recovery,
optional scroll acquisition, credits, unused alternatives or every optional
encounter. The selected Chicken Race victory, apart photo and Smith chase do
not certify all saved outcomes. FAMILY's original immediate zero movement remains
unresolved despite a successful measured resume. Xia's sampled frames still do
not demonstrate the visible letter transfer. Family-crest table/visibility,
door/audio approximations and the existing combat, race, stealth, motorcycle,
QTE, camera, face, hand and scenery limits remain. Earlier seeded and separate
variant evidence is retained, and no inventory status is promoted by this update.

#### Shared server fixes exercised by this campaign

Pending script starts are tied to the connection that requested them. The
server adopts a returned active run under the hub lock only while that client
is registered, owns the character and remains open. If ownership has ended,
it cancels that exact run with a fresh bounded context, preserving replacement
sessions and previously committed receipts.

The [script-start lifecycle evidence](../../tools/evidence/story-script-start-disconnect-20261114.json)
records server commit 2877113 and race-enabled regressions for Unregister,
a closed client still registered, and the distinct-session replacement
interval, plus connected-start and calendar-transition checks. The older
orphaned lease expired naturally before the later ordinary browser
continuation. HARBOR_BIKERS route-r13-01 then passed, including an effect-free
Swallow Dive decline. Its tested helper was committed afterward as 3ec1e018.
The browser evidence covers normal continuation; forced-disconnect behavior is covered by focused server
regressions, and the optional move was not learned.

The earned route also exposed candidate selection between the motorcycle
ride and return-home scene, which share native NBIK but use separate worlds.
The server now reports catalogued sibling-world bounds as known false, while
unknown authoritative bounds still fail closed. Focused bounds and real-Yarn
tests passed. The same saved character completed the physical ride in failed
route-r19-01, then passed the separate preservation/reload continuation
route-r20-01 without repeating it. The [authored-world bounds evidence](../../tools/evidence/story-world-bounds-fix-20261114.json)
retains both original failed attempts, the compiler setup skip, fixture
correction and repository-ordering test boundary. Server 13a1594 was active
during both rendered attempts; client helper 807834b7 was committed after the
accepted continuation.

#### Historical and independent grouped checks

| Sequence | Current state |
| --- | --- |
| Opening → bedside → first allowance → saved continuation | Connected fresh-Story runs verified both explicit intro skips and natural intro playback, natural allowance completion, one-time payment and reload. Sampled visuals do not certify every shot or audio cue. |
| First dojo visit → men-in-black notebook objective | Connected browser/full-stack progression and notebook verified; server gate/cancellation/settlement tested. Authored two-person lead-in rendered; held poses remain an approximation. |
| Yamanose kitten / first black-car lead | Connected fish run uses an explicit introduction skip; connected tofu run completes the full introduction and branch naturally, saves only the shared clue and reloads without replay. All three clips complete in the separate presentation check, with reviewed hand/food captures. Exact full prop/finger fidelity remains unverified. |
| Sumiya / Yamagishi → Nozomi → Tom | Connected browser clicks, original voices with changing rendered mouth buffers, saved clues and restored controls verified for all four. Yamagishi/Nozomi use their exact detailed faces; Sumiya/Tom use original embedded mouth targets. Real server/compiler tests cover cancellation/retry, personal eligibility, NPC presence, Yamagishi hours and cross-character isolation. Conversation-specific gestures and original camera timing remain approximations. |
| Three Blades → Liu family → Liu Senior's sailors lead | Connected browser continuation verified through Ajiichi, daytime referrals, Liu Barber and Liu Senior. The nighttime cook/Yong/Wu referral is now also rendered and connected; all referrals converge on the same Liu clue. |
| Nighttime sailors → Heartbeats alley | Personal waiting, Saijo's voiced lead and failure/retry/success verified in the browser. Client-timed prompts stage a source-based first counter and an approximate second exchange; original recovery branches and detailed impact audio remain unfinished. |
| Heartbeats interior → Charlie notebook lead | Connected real-door/browser check verifies voiced lead-in, failed QTE/retry, successful B,A,B,A inputs, clue settlement, restored Ryo/camera/controls and no replay on re-entry. Rendered cast uses held standing poses; attack choreography is not implemented. |
| Charlie inquiries: Ono → jacket shops; optional Kinuyo → Nagai office → shopkeepers | Seven connected, rendered original-voiced talks and notebook leads verified after the bar-earned checkpoint, including personal daytime waiting, unlocked controls and reload. |
| Arcade-area ambush → tattoo-parlour lead | Connected rendered introduction/trap, real five-opponent fight, loss/retry, original interrogation and saved notebook verified. Server/compiler/PostgreSQL tests cover calendar/region gates, cancellation, timeout, pre-clue rollback and personal settlement. Combat balance and interrogation staging are adapted. |
| Find the tattoo parlor → same-night artist visit | Connected Saijo/Kurita original-voiced clues and real upstairs door entry verified. Rendered two-person visit, cancellation/re-entry, saved tomorrow clue and reload verified; same-day/hour/presence gates and atomic visit-date settlement tested through the real compiler/database. Camera, held poses and omitted grab gesture are adaptations. |
| Charlie's parlor QTE → cartel appointment | Connected real browser check verifies original animated introduction/aftermath, keyboard skipping, wrong direction/retry, Left/A success, cancellation after winning, saved notebook and reload. Server/compiler/database tests cover calendar/presence gates and atomic appointment-day settlement. The playable QTE still uses authored standing staging; curtain opening and callback expression/gaze controls remain incomplete. |
| Nozomi after the parlor | Connected optional same-day encounter: original YBHN cast/cameras visibly verified, cancellation/re-entry, natural ending, notebook and reload without replay pass in the real browser. Not a prerequisite for the letter. |
| Next-day dojo spar → Ine-san invitation → Chinese letter | Connected browser check verifies real timed practice, original Fuku/Ine scenes, visible envelope handoff, cancellation/re-entry, natural letter ending, notebook and saved reload. Server/compiler/database tests prove practice authority and atomic once-only possession. Meditation and forced wake-up travel are omitted adaptations. |
| Fuku-san at the gate | Connected rendered walk-in, cancellation/re-entry, original voices/body/camera, natural ending and saved reload verified. Requires the saved Chinese letter and actual possession; no duplicate handoff. Shared prop-frame repair and presentation verification are described below. |
| Gao Wen rescue / translator referral | Connected browser check verifies original-voiced cast, real three-opponent loss/retry/win, failed A-QTE attempt/retry, original kick/ball/hostage presentation, grandmother referral, notebook, restored controls and saved reload. Compiler/database gates, cancellation, stale input and personal isolation pass. Roadside staging/ball trajectory/basic AI are explicit adaptations. |
| Xia Xiu Yu / Chinese-letter translation | Connected real-door entry, original TOKI actors/voices/cameras, cancellation/re-entry, natural ending, two notebook pages, restored arrival/camera/controls and saved reload verified. Compiler/database possession/presence/hours, stale acknowledgement, repeat and personal-isolation checks pass. Letter attachment/fold data is reused; complete hand/finger fidelity is not claimed. |
| Telephone passwords / Warehouse No. 8 lead | Both real-phone clicks, original initial voice playback, wrong answer/leave, cancellation after the first correct answer, retry, saved warehouse notebook, restored controls, reload and no native fallback verified in the browser. All four reciprocal pair orientations, proximity, stale replies, shared once-only settlement and personal isolation pass compiler/database tests. Receiver/dial choreography remains approximate. |
| Telephone directory / Amihama | Real TBK1 use, original successful 01TEL camera/body/voices, visibly textured open book, cancellation/re-entry, natural completion, saved Amihama page, restored book/player/controls, reload and repeat decline verified. The later continuation on the same fresh character earns the directory after opening through phone, using the travel menu from home to Dobuita then physical street/counter walking. Compiler/database proximity, stale acknowledgement, once-only settlement, personal isolation and legacy candidate-chain checks pass. Book hand binding/swap timing are explicit adaptations. |
| Bus / first harbor arrival | Protected real-GPU continuations verify normal walking from the tobacco counter around original collision boundaries to the bus, real picking, stay/cancel/retry, natural boarding, atomic harbor/pending save, arrival-film cancellation/reload/retry, natural original YBUSFLY D ending and completed reload. The later run uses the same fresh character 5 after opening through phone was earned, then earns the directory and covers the actual 2.14-metre first CMAL leg and the bus approach. HP/yen/inventory and control/actor cleanup pass. Earlier isolated predecessors were seeded; the fresh continuation uses the travel menu from home to Dobuita, and earlier helpers may shorten approaches or skip scenes. Whole-route completion is not claimed. Timetable, fare, original variant choice, one worker motion binding and the exploration spawn remain adapted or omitted. |
| Goro's first harbor encounter | Connected approach, original voiced cast, cancellation/re-entry, wrong input/retry, actual Left/A/B success, original winning motion, directions/notebook, controls and saved reload verified. Real compiler/database tests cover earned arrival gate, accepted bounds, stale input, cancellation after winning, once-only effects and personal isolation. Placement/cameras/held challenge poses are authored. |
| New Warehouse No. 8, rear-window and Goro entrances | The refusal and climb retain their original guard audio, decline/retry and climbing motion. The window opens onto the upper floor. Goro lets Ryo enter at ground level and walk upstairs. Both entrances allow optional inspections of two original envelopes and use the same upstairs listening point, ten voices, six source cameras and exit to MFSY/5. Cancellation keeps the earned entrance available. Crate physics, approach speed and dialogue pacing are adapted. |
| Old Warehouse District daytime gate / nighttime entry | Optional original voiced guard, cancellation/re-entry, waiting in the same area until 19:00, failed Right QTE/retry, original head-bump/catch motion, saved original inside-district arrival, ground support, the automatic ready-stealth handoff and reload verified. Compiler/database tests prove personal-hour boundaries, cancelled successful input without travel, exact atomic arrival and no fabricated stealth/Chen success. The room supplies the one-second prompt, falling prop, wrist attachment and both outcomes. The camera and harbor gate staging are authored. |
| Old Warehouse District guard avoidance | Connected original-geometry movement, patrols, cover and actual door use; rendered cancellation/reload, capture/next-morning recovery, re-entry, success and saved MS08 arrival verified. Real compiler/database tests cover interrupted input, real detection, atomic recovery and character isolation. Routes, vision/balance and framing are authored, not recovered guard AI. |
| Master Chen's first meeting | Connected four-segment original presentation, plate confirmation and atomic notebook/next-morning home return verified. Real compiler/database checks cover prerequisites, decline, cancellation at every segment and stale acknowledgements. Rendered approach, decline, live cancellation, natural completion, original Chen/Gui Zhang/body/camera presentation, saved home return and reload pass. |
| Family lead to the antique shop | Connected optional original-voiced Ine-san hint and original SORA/INEK sequence. Compiler/database cancellation and atomic-clue checks pass. Rendered hint/approach, live cancellation/retry, natural completion, saved clue, restored movement and reload without replay pass. |
| Bunkado sword handguard | Connected original TUBA handover with authoritative once-only possession and notebook settlement. Original detailed hands, source-timed grips and the correct mantel clock are now restored. Rendered real-door cancellation/re-entry, natural completion, owned inventory, controls and reload without duplicate grants pass. Box-lid motion, two native hand-motion requests and dynamic gaze remain incomplete. |
| Gui Zhang's street encounter | Connected original introduction, client-timed nonlethal fight, bodyguard explanation and rooftop Chai shot. Rendered cancellation/re-entry, physical combat inputs, natural ending, notebook and reload pass. Approach bounds, AI/balance and music-start timing are authored. |
| Return-home handguard / family crest | Connected original voiced Fuku referral, physical altar-room door/approach and embedded Ine-san presentation. The upgraded family film has a real Radeon GPU recheck from seeded prerequisites: original detailed hands, source-timed grips/visibility and the distinct textured JOMO prop are visibly confirmed through natural playback. Referral/film cancellation, retry after reload, notebook settlement, retained handguard and restored controls pass. A separate protected GPU run also verifies explicit skip, saved completion, retained inventory, restored controls and reload. Fuku staging, initial prop visibility and the bounded tabletop pose remain adaptations. |
| Iwao's key / dojo sword case | Connected real drawer/case picking, explicit leave/pickup choices, live cancellation/retry, saved inventory/notebook and reload without duplicate grants pass in the browser. Compiler/database proximity, key prerequisite, stale acknowledgement and character isolation checks pass. Captions/cameras are authored; detailed lid/hand choreography remains omitted. |
| Dojo scrolls / hidden-wall switches | Connected real-object clicks, explicit leave/fit choices, live cancellation/retry, independent server settlement, saved scroll/wall presentation and reload pass. Original recess/opened-wall geometry is visibly checked. Scroll rolling, handguard/sword placement and wall translation are authored approximations. |
| Basement entry / return | Connected walking approach, explicit leave/descend choice, live cancellation/retry, saved YDB1 arrival, normal movement into the room, cancelled return/retry, exact dojo return, repeat descent and saved reload pass. Original room/furniture geometry is visible. Arrival/cameras/prompts are authored; climbing animation and lighting interactions remain omitted. |
| Phoenix Mirror search | Connected floor clue, shelf movement, genuine axe pickup, wall opening and once-only mirror/notebook settlement. Compiled Yarn/PostgreSQL and rendered click/cancel/retry/natural ending/reload checks pass. Placement/camera/grips and mechanical reveals are authored; light-source interactions and optional discoveries remain incomplete. |
| Return to Master Chen / recover mirror from Chai | Connected rendered Fuku referral, repeat bus, real password call/gate/door, original MS8A cast/body/cameras, wrong Left-QTE input/retry/success, natural ending and saved reload pass. Original hands and callback grips now replace manual attachments; all eight clips and the final conversation's three speaking faces have a rendered recheck. Native gaze, debris and held QTE staging remain incomplete/adapted. |
| Home update / mirror dream / Ryo's savings / family travel advice | Connected rendered continuations verify original Fuku update, dream/bank cancellation and natural completion, visible bankbook, once-only savings/next-morning arrival, real bedroom door entry, advice cancellation/retry, original kitchen ending and saved reload. Compiler/PostgreSQL and focused client checks pass. Held advice gestures, exact callback detail and home music remain adaptations/omissions. |
| Agency fares / flyers / Fuku's contribution | Connected rendered continuations verify real shop doors, original Global/Asia cast and cameras, leave/cancel/retry, natural endings, actual Fuku bedroom entry, original flyer/piggy-bank presentation, one ¥39,634 payment, independent flyers, restored controls and saved reload. Compiler/PostgreSQL and focused client checks cover settlement, hours, stale receipts and personal isolation. Prop-role bindings, detailed breaking debris and cinematic door motion remain adaptations/omissions; inventory flyer art is not added. See [ticket journey](story-ticket-journey.md#agency-quotes-and-fukus-contribution). |
| Boat lead / agency referral / payment / delayed inquiry | Connected rendered Nozomi talk, original Global referral, physical Asia door entry, decline/cancel/retry, cash/tray/flyer presentation, one ¥69,000 debit, saved four-hour wait, Jimmy's original promise and reload pass. Compiler/PostgreSQL checks include insufficient funds, stale acknowledgements and the 239/240-minute boundary. Original Asia CHRS prop identities replace prior inferred quote bindings; a shared rendered-tested ownership lease prevents duplicate ambient/cinematic actors. Finger detail, two absent original voice references and permanent post-scene population changes remain limitations. See [ticket journey](story-ticket-journey.md#boat-fare-payment-and-delayed-inquiry). |
| Snow dream → Jimmy's next-day call | Connected rendered/full-stack check verifies sleep decline/cancel/retry, natural KKYC ending, saved next-morning bedside arrival, normal doorway movement, original A0169 cancellation/retry/natural ending, the arcade appointment notebook, restored controls and reload without replay. The phone receiver is rendered; snowfall and lighting are approximations. See [ticket journey](story-ticket-journey.md#the-snow-dream-and-jimmys-morning-call). |
| Chai at You Arcade | Connected rendered/full-stack checks independently verify real arcade-door entry, original introduction cancellation/retry, genuine client-simulated win and knockout, distinct original endings, notebook, restored controls and reload without replay. Victory stays at the arcade that day; defeat saves next-morning home recovery. Real Yarn/simulation checks cover early gates, timeout/retry, ending cancellation, stale inputs and no effects before acknowledgement. Generic combat, fixed cabinet and condensed offscreen recovery are explicit adaptations. See [ticket journey](story-ticket-journey.md#chai-at-you-arcade). |
| Jimmy chase / interrogation | Connected authored thirteen-input chase with original opening/capture/escape/interrogation. Rendered/full-stack decline, cancellation, wrong-input retry, all correct inputs, saved office return, interrogation cancellation/reload and notebook persistence pass. Moving road/camera beats and an original vehicle choice are adaptations; animated door props remain unmapped. |
| Harbor hiring: Goro → next-day Goro/Mai → Yada → Mark | Connected browser/full-stack appointment dates, physical approaches, cancellation/retry, office presentation, hiring notebook and reload pass. Original cast, voices, motion and cameras are reused; private Alpha office scenery is scene-owned. No training or wages awarded by the films. See [harbor work](story-harbor-work.md). |
| Forklift training | Connected browser/full-stack decline, cancellation/retry, three physical lift/carry/drop deliveries, saved notebook/day/17:00 finish, restored controls and reload pass. Reuses ordinary driving/cargo physics; no wages. The outdoor pad, three-crate quota and fifteen-minute limit are explicit adaptations. See [harbor work](story-harbor-work.md#forklift-practice). |
| Evening chicken race / protect Shozo | Seeded rendered/full-stack decline, original introduction cancellation/natural ending, continued prompts after misses, cancelled outcomes, and win/draw/loss original-voiced staged conversations pass. Separate saved notebook outcomes survive reload. Original cast, bikes, riding motion, voices and intro camera are reused; the moving route, outcome thresholds, staging and rider contact remain adaptations. See [harbor work](story-harbor-work.md#evening-chicken-race). |
| First workday: morning forklift race | Connected rendered/full-stack boarding, cancellation/retry, three real driven laps/thirty-nine server-observed gates, acknowledged ending, saved notebook/date/harbor return and separate reload pass. Reuses the ordinary course, physics and HUD. Forgiving hours/limit and no opponent ranking/prizes are explicit adaptations. No wages or paid-shift completion. See [harbor work](story-harbor-work.md#first-working-morning-verified-race-and-saved-harbor-return). |
| First workday: morning cargo → Mark's noon rescue | Connected rendered/full-stack five physical deliveries, cancellation/retry, acknowledged noon/notebook, reload, original Mark confrontation cancellation/natural ending, real three-opponent victory, original aftermath and saved clue/reload pass. No wages or afternoon completion. Outdoor dispatch pad, fixed five-crate batch, basic combat and anonymous third model donor are declared adaptations; ambient bystander choreography and bento identity remain limited. See [harbor work](story-harbor-work.md#first-morning-cargo-batch). |
| First workday: afternoon cargo → attack → payday → Goro | Connected rendered/full-stack five more physical deliveries, real three-opponent win, 17:00 finish, original salary-motion cancellation/retry, exactly one ¥3,000 grant, Goro cancellation without undoing pay, natural original warning, saved chapter/notebook and reload without duplicate pay/replay pass. Shared original assets and authority are reused. Dispatch pad, fixed quota, adapted attack cast and no theft/extra-crate raise are declared adaptations; exact hand/note contact is not claimed. See [harbor work](story-harbor-work.md#first-afternoon-and-payday-verified-connected-continuation). |
| Return-home dream → second morning's race | Connected rendered/full-stack decline, dream cancellation/retry/natural ending, saved next-day harbor arrival, boarding/race cancellation/retry, all three physical laps/thirty-nine observed gates, separate day-two notebook/date/09:00/harbor settlement and reload without replay pass. Money/inventory stay unchanged. Reuses original KKYA and existing race/sleep/travel systems; dream association and commute timing are declared adaptations. See [harbor work](story-harbor-work.md#return-home-dream-and-second-working-morning). |
| Second workday: cargo/lunch → two-wave ambush → payday | Connected earned-save rendered/full-stack four/four physical deliveries, original HIRUAUTH lunch, actual five/four fights with full second-wave health, saved Warehouse No. 17 clue/17:00, salary cancellation/retry, once-only ¥2,400 and reload pass. Shared waiting-fighter spacing and two concurrent attackers balance larger crowds without removing opponents or faking outcomes. Lunch framing is partly obscured by the exploration fence; exact native warehouse staging/extra-crate raises remain omitted. See [harbor work](story-harbor-work.md#second-workday-cargo-lunch-two-wave-ambush-and-payday). |
| Warehouse No. 17: Mark's brother | Connected earned-save rendered/full-stack original BOKOMARK confrontation, actual five-opponent fight, both endings, intro/explanation cancellation, reload/retry and atomic notebook/chapter/day settlement pass; currency/inventory unchanged, controls restored and completed reload does not replay. Source-qualified package models, authored DEB1/DEB2 associations and explicit intro audio holes remain documented. See [harbor work](story-harbor-work.md#warehouse-no-17-mark-rescue). |
| Third workday: sleep → race → cargo/lunch → Nozomi/Eri photographs → payroll | Connected earned-save rendered/full-stack sleep decline/cancel/reload, separately earned real race, four/four physical deliveries, original lunch, photo choice/cancellation/natural ending, once-only ¥2,400, restored controls and saved reload pass. No evening win or whole-day completion is awarded. Dispatch-pad route, existing lunch-fence occlusion, photo prop-role pairing, omitted flash planes and absent inventory-photo art remain declared limitations. See [harbor work](story-harbor-work.md#third-workday-sleep-cargo-and-nozomis-photographs). |
| Third evening: biker chase → five thugs → Charlie → Lan Di clue | Connected earned-save browser check verifies decline, cancelled movement, wrong-input retry, all twelve real inputs, saved arrival/reload, both actual fights, cancelled original interrogation, retained chase/retry, natural ending and saved notebook/day/reload. Money/inventory are unchanged. Route/camera, single visible rider, explicit five-thug donor roster, held prompts and shared combat balance remain adaptations. See [harbor work](story-harbor-work.md#third-evening-bikers-and-charlie). |
| Lan Di dream → fourth morning: race → cargo/lunch | Connected earned-save rendered checks verify sleep decline/cancellation/natural ending with original KKYF/BGM201, next personal morning/harbor arrival, a new actual three-lap/39-gate race, four fresh physical deliveries, original lunch, saved noon/notebook and reload. Currency/inventory are unchanged; no later clue, wages or whole-day flag is awarded. Bedtime/commute, dispatch-pad route and reused lunch-film selection remain adaptations. See [harbor work](story-harbor-work.md#third-night-lan-di-dream-and-fourth-working-morning). |
| Fourth-day coworker warning | Original Tsuyoshi voices in an authored private lunch-hour conversation; separate acknowledged notebook settlement, cancellation/retry and saved reload. Standing encounter condenses patrol/repeated inquiries; no later result or payment. See [harbor work](story-harbor-work.md#fourth-day-coworker-warning). |
| Fourth afternoon: Goro → cargo → payroll → Long Zha | Connected earned-save continuation verifies decline/cancel, wrong-input retry, all nine real QTE inputs, original paired motions/threats ending, four physical deliveries, once-only ¥2,400, original Mark explanation, saved chapter/notebook and reload. Casting, staging and shared-cloth corrections are documented in [harbor work](story-harbor-work.md#fourth-afternoon-goros-trap-and-long-zha); no native controller or original per-input camera reconstruction is claimed. |
| Fifth morning: sleep → race → cargo/lunch → Goro/Mai | Connected earned-save browser checks verify ordinary sleep decline/cancel/acknowledgement, next-day arrival, a new actual three-lap/39-gate race, five physical deliveries, original lunch, cancelled/retried original Goro/Mai announcement, saved notebook and reload. Money/inventory remain unchanged; no afternoon credit, wages or whole-day completion. See [harbor work](story-harbor-work.md#fifth-working-morning-and-goromais-announcement) for source identities and condensed-route limitations. |
| Fifth-afternoon sailor chase | Both road/sailor choices and accepted inputs are covered by real-compiler checks. Rendered checks verify original introduction cancellation, wrong-input retry, Tony's timed route/cancelled original interrogation, Smith's timed route/natural ending, saved Terry clue/arrival, reload and completed re-entry without replay. Arrival fencing, a deliberately lost receipt followed by real socket reconnect, and concurrent database snapshot reads are also verified. See [harbor work](story-harbor-work.md#fifth-afternoon-sailor-chase). |
| Fifth-afternoon cargo and wages | Connected earned-save browser check verifies five NEW physical deliveries, acknowledged quota/minimum17:00, original salary motions, cancellation/retry, once-only ¥3,000, notebook and reload. The original red-striped Warehouse8-to18 return route remains condensed to the tested dispatch pad with ordinary crates; no letter, Chen outcome or completed day is granted. See [harbor work](story-harbor-work.md#fifth-afternoon-cargo-payday-and-warning-letter). |
| Gui Zhang's warning letter | Connected earned-save rendered check verifies the original Alpha room/actors, cancellation/re-entry, natural ending, successful BGM119 response, notebook and reload without replay or another payment. Compiler/presentation checks cover original AUTH/bank18,13 voices,21 effects and eligibility. Paper-in-hand callback detail remains limited; it cannot complete Chen's follow-up. |
| Post-letter visit to Master Chen | Connected earned-save browser check verifies visit decline/re-entry, real saved travel, original Chen/Gui Zhang scene, cancellation and warehouse reload/retry, natural ending, atomic fifth-day/notebook/date settlement and completed reload without replay. Money/inventory remain unchanged. Shared original bodies and identical warehouse geometry are reused; explicit commute choice, arrival volume and crate association are documented adaptations. See [harbor work](story-harbor-work.md#post-letter-master-chen-visit). Optional fourth-evening inquiries remain omitted. |
| Nozomi's late-night call | Connected earned-save browser check verifies optional rest decline/cancel, same-date23:45 wake/reload, real bedroom door/walking, original Ine-san/Ryo/telephone scene, cancellation/reload/retry, natural ending, actual BGM063 response, notebook and completed reload without replay. Continuous personal time fixes the prior nine-hour waking-day normalization; public Free roam remains unchanged. No rescue, transport or fight result is awarded. See [Nozomi's rescue](story-nozomi-rescue.md). |
| Nozomi transport inquiry / borrowing | Connected earned-save browser check verifies real Bar Yokosuka door/NPC use, original Saijo inquiry cancel/retry and saved referral/reload, actual Ito-house approach/leave, original Naoyuki film cancellation/reload/retry/natural ending, BGM200 response and saved notebook/permission without replay. Visible original bike/helmet and shared RFB_L body; incidental props/callbacks remain documented. No driving, arrival or rescue outcome is granted. See [transport](story-nozomi-rescue.md#finding-transport-and-borrowing-the-motorcycle). |
| Nozomi motorcycle ride | Connected earned-save browser check verifies original road/rider/bike, real keyboard controls, cancellation and road reload, return to Naoyuki, physical gate re-entry, all 13 server-owned gates, saved harbor arrival, released controls and completed reload. Compiler/engine checks cover the two-minute deadline, interruption, fresh-token retry and no rescue/reward effects. Original road geometry is reused; start/end, simplified handling, held riding pose and omitted traffic are declared adaptations. See [timed ride](story-nozomi-rescue.md#timed-motorcycle-ride). |
| Nozomi warehouse battles / hostage deal | Connected original-asset six/seven-opponent battles save independent server-recorded client victories. Earned-save rendered checks verify real keyboard wins, original warehouse admission, cancelled conversation/reload retaining both wins, original C/D/E natural ending, actual BGM084 playback, notebook settlement, restored controls and completed reload without replay. The final scene check resumes genuinely earned battles. Roster/formation, basic combat/balance and body associations are declared adaptations; two unavailable voices are not substituted. See [warehouse rescue](story-nozomi-rescue.md#warehouse-battles-and-terrys-deal). |
| Nozomi ride home / dawn / rest | Connected earned-save browser check verifies leave/cancel/reload, all 23 natural original shots, actual CD audio playback, immediate 05:56 bedside arrival, separate stay-awake/sleep choice, independent 07:30 save, unchanged economy, restored controls and completed reload without replay. Explicit program skip also checked separately. Original file-order playlist, music cue, harbor layers and condensed sleeping are declared adaptations. The rider skirt now uses the original recorded garment vertices. See [ride home and rest](story-nozomi-rescue.md#ride-home-and-rest). |
| Final-morning meditation / Tom invitation / dismissal | Connected earned-save browser continuation verifies dojo approach, decline/cancel/reload/natural meditation, same-date10:15 harbor arrival, independently cancelled/retried/naturally completed original Tom invitation and Yada dismissal, immediate Alpha arrival, notebook pages, unchanged economy and completed reload with controls restored. A separate renderer-only audit shows original Tom/Ryo/cart without altering flags. Late saves keep their date/time. Dark dojo lighting, ghost compositing and room-door callbacks remain explicit presentation limits. See [final day](story-final-day.md). |
| Tom training / farewell | Connected earned-save browser continuation verifies real11:30 wait, original lesson alternatives, visible practice, actual winning input, wrong/expired retries, cancelled practice/reload, independent mastery, cancelled/retried/naturally completed farewell, same-date22:00, notebook and unchanged economy. Completed reload restores controls without replay and keeps ambient Tom absent only in that player's Story view. Shared policy tests cover other players, Free roam and the distinct `TOMH` actor. One unavailable farewell voice, condensed training and detailed prop callbacks remain explicit limits. See [Tom's lesson and farewell](story-final-day.md#toms-lesson-and-farewell). |
| Plane / evening spar / pipe counter | Connected earned-save browser checks verify original plane farewell/cancel/reload, MFBT arrival, original introduction, actual nonlethal keyboard practice, separately saved spar, cancelled/wrong/expired/retried Right counter, original retreat/encirclement cancellation and natural ending, actual BGM013/BGM084, restored controls and completed reload. A further connected pass verifies wide framing with three actors/pipe visible and no exploration practice HUD in Story. Source animation, held roots, camera and hand binding remain documented adaptations; aircraft visibility and exact collapse staging remain review items. These saves award no70-man victory. See [night confrontation](story-final-day.md#night-confrontation). |
|70-man battle | Connected earned-save rendered check verifies decline, actual partial combat/cancellation/reload, fresh retry, ten groups/three bosses, real keyboard fight, circling/health recovery, BGM120, independent acknowledged victory and saved reload without replay. Simulation/compiler tests require all70 actual KOs and cover timeout, stale input, cancelled endings and no future outcomes. Original assets use a bounded pool; boss shots, AI/balance and the unvoiced ending remain adaptations. See [seventy-man battle](story-final-day.md#seventy-man-battle). |
| Terry / post-battle home and rest | Connected earned-save browser continuation verifies the original approach, held prompt, wrong/expired input, fresh retry, actual A response, cancelled/retried/naturally completed interrogation and notebook save. Separate original pier cancellation/cleanup/reload/natural ending, BGM106, next 05:21 home, stay-awake/reload, 08:30 rest and final reload restore gameplay without replay or extra rewards. Compiler checks cover exact independent outcomes and non-rewinding targets. Source-camera reframing, held-root spacing and hand/pipe detail remain adaptations. See [Terry and the last night](story-final-day.md#terry-and-the-last-night). |
| Family farewell / harbor arrival | Connected earned-save rendered continuations verify decline/reload, original Fuku-san/Ryo/Ine-san shots and temporary scenery, cancellation restoring the bedroom, retry, natural ending, BGM107 playback, independent farewell/notebook/harbor save and completed reload without replay. Date and economy stay unchanged. No named gift or cash amount is invented; detailed grips, bag deformation and the condensed commute remain adaptations. See [family departure](story-final-day.md#family-departure). |
| Departure dock / Swallow Flip | Connected earned-save rendered continuation verifies independent dock admission/reload, original Chen/Gui Zhang/Ryo presentation, cancellation/retry, natural demonstration, wrong/expired input, actual Down/J/Enter success, cancelled exit and separate acknowledged mastery/notebook. Date/economy stay unchanged and completed reload restores controls without replay. Sequential back/punch, held input framing, bag contact and native spar timing remain declared adaptations. See [Swallow Flip](story-final-day.md#swallow-flip). |
| Final Chai / last attack | Connected earned-save rendered continuation verifies original ambush, partial combat/cancel/reload, actual knockout, cancelled questioning without victory, a fresh win and natural questioning, independently saved waterfront arrival, cancelled/wrong/expired counter retries, actual Down/A/A/B, cancelled winning film, natural winning retry and completed reload. Original cast, held counter, harbor water and late falling pose are rendered. Basic AI/balance, held camera and native contact/splash limits are explicit. No letter or ship outcome is awarded. See [Final Chai](story-final-day.md#final-chai). |
| Chen's introduction letter | Connected earned-save rendered continuation verifies original conversation/cancel/retry/natural ending, actual BGM067, exactly one inventory letter and independent notebook/milestone, visible inventory and completed reload without replay. Existing possessions, money and date stay unchanged. Envelope hand callbacks and a dedicated icon are not claimed. See [Chen's introduction letter](story-final-day.md#chens-introduction-letter). |
| Nozomi's amulet memory | Connected earned-save rendered continuation verifies original Nozomi/shrine, decline/cancel/reload/retry, full natural farewell, BGM070, one saved amulet and notebook, visible inventory and completed reload without replay. Prior letters, money and date remain unchanged; cancellation and completion remove the temporary shrine. Recollection at the quay is an explicit staging adaptation; the hand-object mesh and dedicated icon remain absent. See [Nozomi's amulet memory](story-final-day.md#nozomis-amulet-memory). |
| Ship departure | Connected earned-save hardware-browser continuation verifies original boarding, selected original sailing shots, continuous BGM095, decline/cancel/reload/retry, natural ending, independently saved finale/notebook/actual shipboard arrival, grounded movement, completed reload without replay and a real Free roam/Story round trip. Prior keepsakes, money and personal date remain unchanged; no S2 outcome is inserted. The frozen ship-local epilogue and selected shots are explicit adaptations; detailed wings/wake/native ending callbacks remain omitted. See [boarding and sailing](story-final-day.md#boarding-and-sailing). |
| Shenmue II reuse and missing-input audit | Completed source/runtime feasibility audit, not S2 implementation. All-disc models, worlds and music are available; sampled scene containers/cameras partially reuse existing readers, but S2 sequence/motion bindings, voices, personal NPC content and save handoff still need work. See [the audit](shenmue2-story-feasibility.md). |

Individual previews and recovered program inventories do not promote rows to
playable or verified. Run `NEW_YOKOSUKA_DOJO_E2E=true` with the fresh-opening
browser test to extend it through the dojo; that older bounded check resets
near its entrance. The separate `NEW_YOKOSUKA_DOJO_WALK_E2E=true` resume check
uses an isolated character with the allowance milestone and walks the whole
grounds route from the house door, as described above.

## Megumi and the kitten: first black-car lead

Event ID: `s1.ju00.first-kitten`; official Yarn import: `ju00-first-kitten`.

| Field | Event definition |
| --- | --- |
| Location / trigger | Approach the Yamanose shrine (`JU00`). The authored volume surrounds the original CATA1 entry position; server-accepted presence supplies the bounds check. |
| Prerequisites | Personal Story mode, opening and first dojo complete; first kitten encounter not complete. No forced weather, date change or exact-minute gate in this adaptation. |
| Actors / props | Reuse CATA1's Ryo, Megumi, kitten, box, fish/tofu, motion, attachments and cameras. No new actor or prop renderer. |
| Sequence / challenge | Play `SEQDATA0.AUTH`, then hold an adapted final-shot tableau while Yarn shows the food choice. Dried fish selects `SEQDATA1.AUTH`; tofu selects `SEQDATA2.AUTH`. These are alternative endings, not a three-clip sequence. No QTE or fight. |
| Timing / audio | Original AUTH cues, `01CAT1` voices and BGM051. The Story transaction retains the same BGM051 playback through the food choice and selected ending; the choice tableau is an approximation, not a recovered original interstitial gesture. |
| Effects | Both branches save `story.s1.first-kitten.completed` and `notebook.s1.black-car`. Only fish saves `notebook.s1.yamagishi-witness`. No currency/item reward, food deduction or guessed native flag. The scene's offered food is not player inventory in this adaptation. |
| Exit / retry | Stay in Yamanose, restore gameplay camera/avatar/controls. Explicit clip skip advances to the choice or settlement, never chooses food for the player. Cancel/failure commits no partial clue and allows another approach. Completed encounter does not replay. |

### Sources and remaining scope

The original voice cues establish the branch distinction: `SEQDATA1` contains
`01CAT1B019`–`B021` about Yamagishi, whereas `SEQDATA2` contains Megumi's
rejection of tofu and Ryo's suggestion to try fish. Source archive hashes and
bindings are in `play/assets/yamanose/cata1/manifest.json` and
`tools/evidence/cata1-native-lifecycle.json`.
[Adrenaline SL's walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/18346)
also distinguishes the optional kitten care from essential progression. Do not
make the fish-only clue a mandatory gate for the entire investigation: other
witnesses and direct approaches to Yamagishi must remain possible. Later kitten
care is still unimplemented; the separate naming conversation is described in
[later kitten events](#later-kitten-events-source-leads). Sumiya supplies the alternate witness
lead in the authored conversation catalog below. This first encounter is not
proof of the later kitten systems.

Use `NEW_YOKOSUKA_KITTEN_E2E=true` with `NEW_YOKOSUKA_DOJO_E2E=true` to extend
the allowance browser check. It loads Yamanose normally, resets near the shrine
to bound test duration, walks into the event, and checks the selected branch,
saved clues and notebook. The default explicitly skips the introduction and
chooses fish. Set `NEW_YOKOSUKA_KITTEN_NATURAL_INTRO=true` to wait for the full
introduction and `NEW_YOKOSUKA_KITTEN_FOOD=tofu` for the alternate choice. The
test also reloads and checks retained progress, no replay and restored controls.
It does not prove the entire walking route between zones.

On November 8, the fresh front-door/dojo run continued into the kitten event
using the bounded shrine placement. The full introduction and fish ending
played naturally, the fish-specific Yamagishi clue and shared clue were saved,
and reload preserved them without replay. Megumi's visible speech mesh changed
across 23 rendered frames; complete handover and audio fidelity remain separate.

The October 22 rerun passed the connected allowance/reload, dojo and kitten
sequence in four minutes with one hardware-rendered browser. Before skipping
the kitten introduction it also samples Megumi's actual visible mouth buffers
and poses while the original voice plays. The food choice does not grant the
fish-only clue early, and the fish ending restores movement without playing or
crediting the incompatible tofu branch. This is integration coverage plus a
speech sample, not a complete visual review of the fish/kitten handover.

The October 23 connected tofu run earns allowance and dojo progress first,
plays the full 3,150-frame introduction, presents the real food-choice panel,
and completes only the 1,370-frame tofu ending. It saves the shared black-car
clue but not the fish-only Yamagishi clue, leaves money unchanged, restores
movement and reloads without replay or extra notebook pages. Megumi's speech,
the choice panel, held tofu and saved notebook were captured and reviewed.

A separate `cutscene-hands.spec.js` run plays all three clips (including the
2,391-frame fish ending), checks original hand poses and shared fish attachment
ownership, then replays and cancels without leaking presentation leases. Reviewed
captures show the early introduction, fish grip, held tofu, subsequent empty
hand and late tofu scene. This selector deliberately concatenates both alternate
endings for inspection; the connected Story test is the branch-isolation proof.
No additional rendering change was needed for these checks.

The 2026-11-07 change holds Ryo, Megumi, the kitten and box in a scene-derived
tableau during the choice instead of leaving the gameplay camera active for the
whole decision. It samples the original last actor motions and positions; the
source camera aims lower to fit the choice panel. The shared staging runtime
borrows the original archive-local kitten model and hides/restores the world
kitten and box rather than adding persistent NPCs. Separate isolated connected
tofu and fish runs skip the introduction, exercise real shrine entry and the
choice, play their endings naturally, verify distinct clues and unchanged yen,
and reload. The fish run also cancels at the choice and retries without saving.
Rendered inspection verifies the staged cast and box and restoration of the
world roots. A follow-up uses the shared transition canvas to retain the last
rendered film frame until the tableau's first render, with transaction-scoped
cleanup. The isolated frame probe observed zero uncovered gameplay frames after
both a skip (six held frames) and a natural completion boundary (four held
frames). The latter sought through the first 100 seconds and then let the
ending play normally; that earlier check was not a full real-time playback.
An unabridged natural run then passed on 2026-11-07: it walked into the shrine
trigger, played the full introduction without seeking or skipping, held four
transition frames with none exposing gameplay, and carried the same playing
BGM051 element through the choice and full tofu ending. It saved the expected
clues, restored controls and reloaded the saved result.
Cancelling while the successor's actor load was deliberately delayed released
the frame and controls, and a late load did not reacquire the scene. A separate
tofu run passed choice cancellation, retry, settlement and reload. Subsequent
isolated rendered tofu and fish runs verified the same BGM051 media element
continued playing across the skipped introduction, the choice and the chosen
ending; it stopped on cancellation and after settlement. The tofu run also
retried after cancellation, and both reloaded their distinct saved clues. This
checks playback continuity, not an auditory comparison with the original.
Accelerated seeking also produced audio-channel quota warnings, so that earlier
review is not an audio test.
Sampled shots are not a frame-by-frame kitten,
prop, finger or audio-fidelity sign-off. These events have not been deployed.

## Early black-car investigation

The authored input is `tools/scripting/story-investigation.json`.
`build_story_investigation.mjs` deterministically resolves its line IDs against
the original HUMANS.AFS message catalogs and emits ordinary official Yarn
imports for the separate server. It is content translation, not another quest
runtime. The imports use the existing NPC picker, conversation presenter,
server-owned gates and atomic settlement.

| Event / location | Prerequisites in this adaptation | Original voices | Saved lead |
| --- | --- | --- | --- |
| `sumiya-witness`, Sumiya (`SUMI`) in Sakuragaoka (`JD00`) | Opening and first dojo complete; this conversation not complete. | F1129 | Yamagishi hurt himself avoiding the car; visit his home. Alternative to the kitten's fish-only witness clue. |
| `yamagishi-black-car`, Yamagishi (`YAMA`) in Sakuragaoka | Opening, dojo and witness clue; not complete; personal 08:30–19:00. | F1053 | The car went toward Dobuita. |
| `nozomi-black-car`, Nozomi (`HRSK`) in Dobuita (`D000`) | Opening and first dojo complete; not complete. Yamagishi's conversation is optional. | F1239 | Tom argued with the occupants. |
| `tom-black-car`, Tom (`TOM_`) in Dobuita | Opening and Nozomi conversation complete; not complete. | F1038 | A man in a deep-green Chinese coat; ask the Chinese community. |

All four require Story mode and authoritative presence of the corresponding
NPC in this player's zone. The existing personal schedule supplies placement;
other players' NPCs are not changed. No item, yen, native-flag guess, calendar
jump or weather override is added. These are ordinary conversations with no
QTE or combat.

Click the scheduled NPC to start. The shared presenter locks movement, faces
the NPC toward Ryo, displays the original English subtitle and plays its
original voice. The generated Yarn line retains its exact original SRF mouth
cues as `lip:srf1:...` metadata. `NativeVoiceFacialPresentation` connects those
cues to the same detailed FACE/embedded mouth renderer used by cutscenes,
following the audio position rather than elapsed loading time. Detailed faces
require a proven matching body variant; off-stage voices acquire no model.
Line changes, cancellation and world teardown release the face, including
late asset arrivals. Voice completion or Space advances a line. It preserves
the gameplay camera rather than inventing original shot timings and does not
reproduce specific conversation gestures. Completion adds
the personal milestone and lightly adapted notebook page together, then
restores controls/facing. X/cancellation commits no partial clue; repeat and
reload cannot duplicate completion.

### Provenance and deliberate simplifications

The line text, speakers and voice IDs are resolved from the original English
HUMANS.AFS catalog, whose source hash is retained in each generated import.
[Shotgunnova's walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404)
supplies the witness chain and Yamagishi's 08:30–19:00 availability.
The authored ordering condenses multiple questions into one conversation;
it is not a recovered original selector or timing table. In particular, the
original allows Nozomi to supply her clue without another witness's referral.
After the first dojo visit, this adaptation lets her be questioned before or
after Sumiya and Yamagishi; Tom's selected lines explicitly refer to Nozomi, so
they still require her clue. Other witnesses, optional enquiries and
native-dialogue consistency outside these translated routes remain incomplete.
The player may still explore freely.

Rebuild server content with `NEW_YOKOSUKA_SERVER_DIR` set to the separate server
checkout and run `node tools/scripting/build_story_investigation.mjs`.
Adding `--voices` requires `VGMSTREAM_CLI` and the extracted original game data;
it merges only the selected voices into the existing local audio catalog.
Audio binaries are ignored and need separate publication before deployment.
Import the reviewed built-ins into the isolated test database. Neither
generation nor a local import publishes production content.

Set `NEW_YOKOSUKA_INVESTIGATION_E2E=true` alongside the dojo and kitten test
flags to extend the connected browser check through Sumiya, Yamagishi, Nozomi and Tom.
It loads their actual zones and clicks the actual scheduled actors, while
resetting nearby to bound travel time. Each resident's voice must play while
their visible mouth buffers change across rendered frames, and the complete
conversations play without line skipping. Set `NEW_YOKOSUKA_NOZOMI_FIRST_E2E=true`
with the tofu branch to check Nozomi and Tom before Sumiya and Yamagishi. This
does not establish listening-level audio, gestures or original camera fidelity.

On November 8, an isolated connected browser run took the tofu branch, then
completed Nozomi, Tom, Sumiya and Yamagishi in that order. It verified the
fish-only witness and Yamagishi completion were absent before Nozomi and Tom,
observed each actor's rendered speech, and read each saved clue. A separate
compiler/PostgreSQL test verifies both orders, cancellation without a clue,
retained clues and character isolation. Neither is an uninterrupted walking
playthrough: zone travel and nearby placements are bounded test shortcuts.

The 2026-10-22 local run passes allowance/reload → dojo → kitten/fish → all
four witnesses. Sumiya (`SMY_L`) and Tom (`AME_L`) show changing embedded mouth
targets; Yamagishi (`YMG_L`) and Nozomi (`NZM_L`) show changing detailed FACE
vertices. All four rendered captures were reviewed, and each saved lead and
restored movement was checked. The generator carries 599 unique source voices
across 727 voiced line uses; all 177 generated imports compile in the real Yarn
compiler. That corpus check does **not** visually verify the remaining actors
or conversations. Focused tests separately cover stalled/rewound audio,
skipping, stale preparation, body replacement, disposal, failure and retry.

The connected run passed locally through allowance, reload, dojo, kitten and
all four witnesses. Rendered captures also exposed and verified a fix for the
shared conversation-facing direction: character models face local -Z, so
FACE must apply the same half-turn as scheduled movement. No NPC-specific
rotation override was added. Existing ambient gestures, including sweeping
and dancing, remain active rather than becoming dedicated conversation clips.

## Three Blades and the Liu family

The investigation catalog continues through these ordinary conversations:

| Event / location | Important conditions | Participants / original voices | Completion |
| --- | --- | --- | --- |
| `tao-three-blades`, Ajiichi (`DCHA`) | Tom's Chinese-community clue; personal 10:00–21:00. | Tao (`UNO_`) and Lin Xia (`RNKT`), F1050. | Three Blades notebook: Maeda, Itoi and Manpukuken Ramen. |
| `itoi-liu-referral`, Mary's Patches in Dobuita | Three Blades clue; 10:00–20:00. | Itoi (`ITOI`), F1031. | Liu Barber notebook lead. |
| `maeda-liu-referral`, Maeda Barber (`DTKY`) | Three Blades clue; 10:00–18:00. | Maeda (`MADA`), F1035. | Same Liu Barber lead; either referral suffices. |
| `liu-barber-father`, Liu Barber (`DRHT`) | Either referral; 10:00–19:00. | Liu Ji You (`KYUR`) and Liu En Ling (`ONRR`), F1049. | Find Liu Senior in Suzume Park; atomically enable his reviewed native park schedule. |
| `liu-senior-sailors`, Suzume Park in Dobuita | Liu family clue; 08:30–20:30. | Liu Gong Hui (`RKKI`), F1274. | Sailors notebook: Hong Kong/Shanghai sailors may know about the harbor cartel. |

All require personal Story mode, completed opening, authoritative presence of
every named NPC participant, and an unfinished individual conversation.
The shared presenter faces each participant toward Ryo and restores each prior
facing independently on completion or cancellation. The original voiced
English lines supply the action sequence and timing; voice completion or Space
advances. Preserve the player's gameplay camera and current personal weather.
No currency, item, QTE, combat, calendar jump or forced travel is involved.
Controls restore in the current shop or park; cancellations grant no partial
clues. Alternate referrals unlock one stable notebook page, not duplicate pages.

Liu Barber has no recovered player Entry or live AKIR placement. Its arrival is
an approximation: the existing door offset is placed on the side supported by
both residents' original schedule positions. The same generator leaves rooms
without two agreeing resident anchors on their previous, unresolved fallback;
their arrival sides still need review. Refresh the compact source evidence with
`tools/worlds/build_interior_resident_anchors.py` when the local scheduled-actor
research corpus is available, then regenerate browser transitions.

[Shotgunnova's walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404)
sections 1.05–1.07 and scenes 1-17–1-19 corroborate the sequence, the spouses'
roles and the business hours. Original message text, speaker IDs and voice
references come from HUMANS.AFS, with hashes in each generated import.
Question sequences are condensed; gameplay cameras and each resident's original
default idle replace unrecovered conversation direction and gestures. The cook
route through Manpukuken and Yong/Wu is now connected as described below. The shop's
original phase-dependent closure is not newly implemented by these talks.

### Liu Senior's personal placement

The original RKKI schedule condition at CM_D000.BIN `0x5896c` requires bank-2
bit 65 set and bit 70 clear. It selects schedule table `0x59b5c`, which places
him in Dobuita at original position `(13.35, 0.08, 47.71)` from 08:35, mirrored
to browser X `-13.35`. The generated actor catalog retains the exact predicate
and source file hash `f5703c148278bc3ec3f656644cd2291de97e5dbfea9d528b31b24842366301cc`.

The authored Liu-family completion writes `2:65 = 1` through the existing native
bank transaction bridge, together with the named milestone and notebook clue.
This is a reviewed compatibility mapping to an established schedule consumer;
it does not assert that the original barber conversation was the only setter,
or invent a complete historical meaning for bit 65. It leaves bit 70 untouched.
The private commit receipt refreshes that character's NPC engine on the same
day; public NPCs and other characters retain their own state. Failure and
cancellation must not commit the bank write separately from the clue.

Rebuild audio and imports with the investigation builder, then import these
official built-ins through `cmd/script-import --builtin ...`. The Go catalog
adds the canonical fresh Story snapshot to previews requiring native effects;
this avoids duplicating the binary save layout in the JavaScript generator.
Set `NEW_YOKOSUKA_THREE_BLADES_E2E=true` with the prior connected-test flags to
extend the browser check. It waits for the real personal clock to reach 10:00,
loads the existing interiors, clicks residents, tests both daytime referrals,
checks the stored native bit, then follows Liu Senior and the saved notebook.

The 2026-10-23 isolated rendered continuation lets all five conversations
finish naturally (126 original voice lines), with real resident clicks and no
Space-skipping. Both two-person conversations additionally cancel during a
spouse's speech, grant no clue, and successfully retry. Completion verifies the
clues, stored `2:65`, Liu Senior's source park placement and sailors notebook;
reload retains progress and money. Position, participant-facing overrides,
player camera and controls restore. Earlier investigation prerequisites were
seeded into disposable local characters; this is not a fresh uninterrupted
opening-to-sailors playthrough.

Original mouth deformation is observed over rendered frames for all seven
speakers. Reviewed speaking captures now include Tao and Lin Xia, Itoi, Maeda,
Liu Ji You and Liu En Ling, and Liu Senior. The test uses real right-drag to
frame each spouse, retaining that player-chosen view afterward. A shared
stationary-talk override now uses each actor's source default idle instead of
retaining mopping/cooking/leaning motions. Maeda now stands upright with his
face visible. The browser check asserts the default motion during speech and
the live scheduled motion after completion or cancellation. Its recheck resumed
from earned Tao progress after the browser runner lost its channel; no earned
flags were reset. Dedicated conversation gestures, work-prop put-down/pick-up
transitions and original camera direction remain unimplemented.

The shared test approach uses supported-ground/clearance and sightline checks,
then waits for the target's body to render after aiming. A separate completed-
checkpoint check covers all five residents without replaying or resetting their
earned flags. It also reproduces Ajiichi's overlapping selection boxes: a click
aimed at Tao previously selected Lin Xia. The shared picker now resolves
overlapping boxes against current visible body poses; the exact early-morning
angle selects Tao while the old box-only method still selects Lin Xia.

For focused rechecks, `NEW_YOKOSUKA_STORY_RESUME_ID` and
`NEW_YOKOSUKA_STORY_RESUME_TOKEN` select a previously earned isolated test
character. The test requires Tom's saved lead and resumes unfinished witness
conversations without creating story flags or advancing the clock. The normal
variant still connects the whole sequence from the earlier allowance check.
`NEW_YOKOSUKA_DIALOGUE_APPROACH_E2E=true` additionally revisits completed
daytime conversations to verify supported footing and real clicks while
asserting that their completed Story talks remain unavailable.
Opening-hour waits derive their wall-clock budget from `worldState.dayLengthMs`
and the remaining personal game time, rather than assuming a speed multiplier.

This rendered work exposed a shared schedule bug: Tao's 10:00 descriptor has
no repeated room assignment, so the evaluator must inherit DCHA from his earlier
descriptor. The server now retains eligible prior room assignments for both
primary and secondary routes. Cold-start and explicit replacement tests pass;
the restaurant capture verifies Tao's visible presence after the correction.

The builder also emits `play/data/authored-story-talks.json`, a small area/actor
projection used by the existing interaction dispatcher. In Story mode, these
translated talks never fall back to the original native selector on a declined
gate, missing server script or offline connection. That prevents an unavailable
or completed authored conversation from independently changing native flags.
Free roam and unconverted NPC talks retain their existing native behavior.
Focused checks cover those boundaries, and the rendered repeat check clicks
completed Liu Senior, verifies the notebook guidance, restored movement and
absence of a native dialogue launch. Native consistency outside this translated
catalog remains a separate content gap.

## Personal waiting and nighttime leads

The Story-only sidebar offers waiting until 19:00 or the next day's 08:30.
This is an authored convenience, not a recovered original menu. Both targets
live in the authoritative `internal/scriptcontent/story_time.v1.json` catalog
and its generated client projection. Each starts an ordinary Yarn event and
asks the player to confirm or keep exploring. `advance_story_time` resolves
the target from trusted personal calendar facts; its internal timestamp effect
settles in the same transaction as other event effects. It does not change
location, avatar, money, inventory or clue flags.

The private commit receipt advances the live clock and reselects that viewer's
NPC schedules. Mode/revision checks reject stale receipts, and monotonic clock
checkpointing prevents an older location writer from undoing the jump.
Cancellation and the decline option advance nothing. Reconnect restores the
stored time. Waiting until an already-passed evening declines; morning means
the next calendar day. Waiting itself does not pay the separately implemented
[daily allowance](#subsequent-daily-allowance), and does not implement the
original bed interaction, curfew destination or deadline scenes.

After waiting, these original-voiced talks use the existing investigation
generator and multi-participant presenter:

| Event | Location and hours | Required clue | Result |
| --- | --- | --- | --- |
| `junko-yong-wu` | Manpukuken Ramen (`DRME`), 17:00–04:00 | Three Blades | Ask former members Yong and Wu at night. |
| `yong-wu-liu-referral` | Bar Yokosuka (`DBYO`), 17:00–03:00; Wu (`GRKN`) and Yong (`ECHO`) | Junko's lead | Same Liu Barber clue as Itoi/Maeda. |
| `saijo-sailor-bars` | Bar Yokosuka, 17:00–03:00; Saijo (`SAJO`) | Liu Senior's sailors lead | MJQ and Heartbeats; Heartbeats is opposite the motorcycle shop. |

The winning story chain and hours are corroborated by
[Shotgunnova's walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404).
Text/speakers/voices come from original HUMANS.AFS F1019, F1276 and F1131.
Questions are condensed. Junko and Saijo retain the ordinary talk camera and
ambient gestures; Yong and Wu use the scoped staging described below.
Source actor presence remains required for every participant.
The hours compiler handles intervals that cross midnight, though ordinary
Story waking time still rolls past the late-night closing hours.

The isolated browser continuation verified declining/confirming waiting,
all three residents and initial voices, the earned Heartbeats notebook page,
restored movement, and next-morning time without losing clues or money. Real
Yarn/PostgreSQL tests cover cancellation, repeat, stale checkpoints and other
characters; realtime tests cover private receipts and stale-mode rejection.
Use `NEW_YOKOSUKA_NIGHT_STORY_E2E=true` with a saved connected test character.

The 2026-10-23 rendered continuation now lets all 23 Junko, 21 Yong/Wu and
13 Saijo voice lines complete without Space-skipping. Reviewed speaking
captures and changing rendered mouth buffers cover `JUKY/YAM_L`,
`ECHO/QHB_L`, `GRKN/SSI_L` and `SAJO/BAU_L`. The combined isolated run passes
wait-decline/confirm, real resident clicks, natural endings, notebook clues,
unchanged money, next-morning time and reload. It starts from a seeded earlier
investigation checkpoint, not a new opening-to-night playthrough. Yong/Wu also
passes cancellation without settlement, a real-click retry, restored player
position/first-person camera and zero remaining actor leases.

That review found Yong speaking from behind the bar's entrance wall. His
default schedule was waiting at browser position `(-3.15, 0, 1.54)` before
`CM_D000` operation `0x11014`; its variable `BYO2` waiting-seat allocation
remains unresolved. This was a placement problem, not missing lip-sync data.
The conversation now borrows both actors through the existing scene-staging
runtime using the original selector-4 placements at `0x111a0` (Yong) and
`0x15230` (Wu), including their original facing. The source hash and exact
coordinates are checked against the locally extracted binary when available.
No global seating rule, culling bypass or story-flag override is introduced.

`s1.dbyo.yong-wu` deliberately applies those placements for this optional talk
even after native flag 65 would end that original schedule variant. Its
two-person camera and generic standing motion are authored; Ryo speaks from
off camera. Cleanup restores ambient placement and the player's prior view.
Original conversation-specific gestures, camera timing, ambient variable
seating and listening-level audio fidelity remain unverified.

## Heartbeats alley: staged introduction and defensive challenge

Event: `d000-heartbeats-alley`; personal Story mode with the opening and sailors
clue complete, after 19:00. An authored Dobuita approach surrounds the original
DBHB return-entry point `(124.56, -1.8, 64.41)`, derived from MAPINFO record
`0xd35e0`. It is not the separate cinematic Ryo pose at
`(121.728, -1.883, 76.075)`; using that pose as a walking arrival caused a void
reset and was corrected before verification.

The server independently checks the accepted position and eligibility.
The client reuses original YQ14 `SEQDATA1.AUTH` and `SEQDATA2.AUTH`, motion,
actors, cameras, voices and beer prop through the same package renderer. The
Story projection binds their global coordinates to Dobuita; the asset-viewer
preview retains its original isolated world. Each scene part explicitly
restores the prior player/controller/camera pose before continuing. No time or
weather override is added beyond the nighttime gate.

Then the shared prompt presenter requests B followed by A, matching the
[original guide's winning order](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf).
They are separate client attempts (`s1.heartbeats.alley.defend` and `.finish`),
so the first response can play an action before the next prompt. Desktop
mapping is Shift/Enter; onscreen A/B buttons also work. Two-second
windows and restarting on any miss are declared adaptations. The browser
starts timing after readiness and judges input locally. The server checks the
owned attempt token and readiness before accepting one result; it does not
time individual inputs. Stale tokens, movies and explicit scene skips cannot
award success. The shared compact QTE surface shows only the current button
or combination, rather than obscuring the scene with every possible control.

Failure offers retry or departure and grants no flag. Correct inputs settle
`story.s1.heartbeats-alley.completed` once through Yarn; no item, money or HP
effect is added. Cancellation, timeout, missing preparation and disconnect
must leave the attempt retryable. The browser failure/retry/success check uses
ordinary walking into the region and keyboard responses, then verifies the
durable flag and unlocked movement. It starts near the entrance to bound travel.
Use `NEW_YOKOSUKA_ALLEY_QTE_E2E=true` with the connected saved fixture.

The 2026-10-22 run passed input outcomes but exposed an unsupported test start
at `(124.56, -1.8, 67.4)`. Its blank below-map captures are **not** visual
verification. The test now finds a collision-validated path across the region
boundary and waits for an actual AUTH frame before capturing. A separate
`NEW_YOKOSUKA_ALLEY_PRESENTATION_E2E=true` review on an already-earned save
verified that walk, then replayed only the real activity adapter: original
Ryo/attackers, alley, camera shots and beer prop were visible, both parts
completed naturally, player position/controls restored and saved flags/money
were unchanged. This does not re-prove fresh eligibility or every facial/grip
detail.

A 2026-10-23 presentation-only recheck (`NEW_YOKOSUKA_STORY_FACES_E2E=true`,
`NEW_YOKOSUKA_STORY_FACE_SET=alley`) cancelled the beer scene and replayed it to
natural completion. Both original recordings played with changing mouth
vertices; Tony's speaking face and the moving bottle are visible in reviewed
captures. Ryo's original speaking shot faces his back and the diagnostic
close-up was occluded by another actor, so his visible mouth/grip fidelity is
still unverified. Both runs restored avatar, position, camera mode and controls,
released actor leases and left saved flags, yen and inventory unchanged.

The first defensive exchange now uses original `YQ14/M_YQ14.BIN` (88,464 bytes,
SHA-256 `ff7984a495727a5f9c89eb82cc1fa0e8ca8f08b9510e40abe46d970965d15f6e`).
`AKI_KERI_SEIKOU_1QTE` / `TKA_KERI_SEIKOU_1QTE` show the counter and the
attacker falling; the matching `SIPPAI` pair shows the missed defense. The
prompt holds their source start poses. After input, the scene waits for the
longest original clip rather than an arbitrary short delay. A successful
first exchange retains one cast/camera lease through repositioning, the second
prompt and its response; failure, cancellation and final settlement release it.
Animation alone earns no progress.

Rebuild with `tools/cutscenes/build_yq14_activity_pack.mjs`, then
`NEW_YOKOSUKA_SERVER_DIR=/path/to/server node tools/scripting/build_heartbeats_alley.mjs`,
and synchronize scripting contracts. This extends the existing activity pack,
scene catalog and Yarn staging primitives. The camera is the original
`SEQDATA2.AUTH` shot evaluated at four seconds. Actor alignment, Tony's role
assignment and the held prompt are reviewed adaptations, **not** a recovered
native QTE controller. Matching clip names did not prove the input decision
tree: `HANGEKI` starts in the `KERI_SIPPAI` ending posture, and finisher clips
have different timing. They are not silently assigned to Smith's second input.
The original YQ14 MAPINFO SCN3 entry at `0x56613` is a legacy instruction
stream (`encodingMarker: 0x00000100`), not a native SH-4 callback. The existing
container evidence classifies it accordingly and the native IR has zero
functions. The older speculative bytecode decoder does not yet prove its
branch/motion selection; completing that decoder is a separate research task,
not a reason to assign a finisher from its filename alone. The second exchange
instead deliberately reuses the first kick success/failure pair on Smith,
with authored walk-in and placement. Tony remains down; this is not recovered
native second-QTE choreography.

On 2026-10-23 an isolated character seeded from previously earned prerequisites
walked the supported approach, played the introduction, failed the first
prompt, retried, played the visible counter/fall, answered A and saved completion
without changing money. This is an isolated event check, not another complete
opening-to-Heartbeats playthrough. A second isolated run also failed A after
winning B, cancelled during the counter, walked back into the trigger and
finished both inputs. Neither failure nor cancellation saved completion;
the final result restored first-person view, supported ground position,
movement and zero actor leases. Source-compiled Yarn tests separately check
both failure branches and their scene-release ordering. Reviewed rendered
captures prove the first exchange, not exact native choreography. The new bank and changed package
manifest are registered locally; they still require asset publication before
deployment.

On 2026-11-07 an isolated connected replay covered the supported approach,
both wrong-input branches, retry, cancellation during the first exchange and
success. The completion flag was absent during Smith's response and present
afterward; money, camera, controls and actor leases were checked. A separate
rendered replay inspected the walk-in and both Smith reactions over time and
reloaded the saved character successfully. These checks start from a seeded
investigation checkpoint, not a complete playthrough, and do not establish
original second-exchange fidelity.

Current presentation limits: Smith's actual native move and the original
between-input failure-recovery branches are not reconstructed; the second
pair repeats the first as an approximation. Detailed impact sounds remain
unfinished. Standard gamepad buttons and directions now use the same challenge
runtime as keyboard and touch; a simulated standard controller passed the full
application's prompt wiring and the connected bar encounter below. A physical
controller and the complete alley encounter have not been tested together.

## Heartbeats interior: the bar encounter and Charlie lead

Official event: `heartbeats-bar` (`story-s1-heartbeats-bar`). It is compiled from
the investigation content catalog into ordinary Yarn, not a new quest system.

| Field | Definition |
| --- | --- |
| Location / trigger | Enter Heartbeats (`DBHB`) through its Dobuita door; the existing automatic room-entry dispatcher starts the event. |
| Prerequisites / time | Personal Story Ryo, opening and sailors clue complete, alley QTE won, Hato present, 19:00–04:00, bar milestone incomplete. Use the personal calendar; no forced date or weather. |
| Player / cast / props | Lock input and borrow Ryo, Hato and three original actor models: Sera (`TUW_L`), Jones (`GIF_L`) and Harry (`GIE_L`). The authored scene places Ryo near the original arrival and holds standing loops. No separate drink, weapon or thrown-object prop is animated. |
| Sequence / dialogue | Original `E1030` welcome, sailors question, mockery and confrontation; then a real defensive QTE; only after winning, Hato names Charlie and describes his motorcycle, clothes and tattoo. The 25 selected original voice/subtitle lines are condensed into authored order. |
| Camera / timing / audio | One authored room shot; original voices advance on their audio ending or supported Space input. The scene remains owned across the challenge. No invented music identity or exact native fight timing. Preserve existing room sound, weather and lighting. |
| Challenge | Four client-timed inputs, B/A/B/A, through the same prompt system as the alley. Shift/Enter, onscreen buttons or standard gamepad B/A. The server accepts one result for the owned, ready attempt; old tokens, movie completion and Continue cannot win. Two seconds per input and strict restart are adaptations. |
| Effects | Atomically set `story.s1.heartbeats-bar.completed` and `notebook.s1.charlie` after successful input and completed clue dialogue. No currency, item, HP or speculative native-bit effect. |
| Exit / retry / skip | Restore the exact prior room position, avatar visibility, camera mode and controls. Stay inside Heartbeats; the original forced ejection is not implemented. Space may advance voice lines but not prompts. Wrong/late input offers retry or leaving without progress. X/cancellation, failed preparation or disconnect settle no clue. Re-enter a cancelled event to retry; a completed event does not replay. |

### Sources and verification

The [Japanization guide](https://shenmuesubs.sourceforge.net/howto/shenmue1/addons/S1_JPG_083.pdf)
identifies `E1030` as the Heartbeats encounter. Original SRF speakers and ordered
AFS speech members establish each selected subtitle/voice pair; source SHA-256
is `293e91c89786994e8747d3057f4cf5731ba5302b2c46f5b753c0455e7566f069`.
The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
corroborates the winning inputs and Charlie lead. Neither source establishes
our standing poses, camera or retry timing; those are declared approximations.

`AuthoredSceneStagingRuntime` borrows the shared cinematic actor/camera
primitives under the existing script presentation transaction. It stages no
server NPCs and writes no progress; other players keep their own views. Late
model preparation cannot acquire actors beneath a cancelled/new transaction.
The automatic dispatcher waits for world travel and avatar loading to finish.

The entry generator now prefers an original live AKIR CHRS placement when a
room has no Entry record, rather than guessing the interior side of an exit
door. This corrects DBHB's outside-wall arrival and also uses available source
placements for DAZA, DCBN and DRSA. DBHB uses native record `0x24530` at browser
`(-0.68, 0, -7.32)`; facing into the room remains the established adaptation.

The isolated browser check (`NEW_YOKOSUKA_BAR_QTE_E2E=true`, using an earned
alley checkpoint) clicks the real Heartbeats door, observes voice playback,
fails/retries the challenge, enters B/A/B/A, advances the original clue dialogue,
checks the notebook and unchanged money, verifies restored Ryo/first-person
camera/arrival/controls, and re-enters without replay or owned cast. Captures
show Ryo and the three encounter actors; they do not prove fight choreography
or natural timing of every voice line. Real Yarn/PostgreSQL checks additionally
cover missing prerequisites/Hato, opening hours, cancelled preparation,
cancel-after-win, clue settlement, repeat and cross-character isolation.

The 2026-10-22 connected recheck passed those browser steps and reviewed the
standing cast and door approach. This still does not verify facial motion for
every staged speaker, nor supply the missing bar-fight choreography. Separate
desktop/phone browser checks exercise the shared compact QTE, pointer/key
success, wrong input, timeout and return to normal dialogue; their clock is
controlled for deterministic layout captures, not evidence of original timing.

On November 8, a simulated standard gamepad was used in the connected bar
encounter from an isolated seeded checkpoint. Wrong A input produced a retry
without the Charlie clue; B/A/B/A then saved the clue and bar completion,
restored the camera, player and controls, and did not replay on room re-entry.
The test used the real door and server transaction but skipped dialogue; it
does not prove physical-controller behavior or original fight choreography.

The 2026-10-23 source check located the fight-specific room in `DHQB`, separate
from the ordinary `DBHB` interior. Original `DHQB/MPK00.PKS` (654,588 bytes,
SHA-256 `9252217af74608f215f1b90bd8460cd9182840b1758094e109520572c028f3a2`)
contains `M_DHQB.MOTN` (321,216 bytes,
SHA-256 `b53970dc8443c01cdbb02daf4d15b959746aa5729c8919f126df22d7d2c8359b`):
62 complete motion clips including milk dialogue, counter/table interactions,
successful defenses and failed reactions. It also contains `DYNAMICS.DYNM`
and separate bar objects. These assets are **not connected to Story**.
Clip names alone do not establish actor assignment, placement,
prop movement or the original branch/timing sequence; do not substitute the
normal room's static furniture for moving/breaking fight props without review.

The same day's isolated `NEW_YOKOSUKA_BAR_MOTIONS_E2E=true` review rendered
four candidate pairs (counter throw, table, kick and high kick), through the
production actor/motion adapters in DBHB. The clips animate, but the diagnostic
floor positions and opposed facings **fail the choreography review**: the
counter pair loses contact, furniture intersects the opponent, and the kick
pair overlaps incorrectly. Twenty captures cover starts, intermediate frames
and ends. This test is an inspection aid, not a visual approval or a new Story
implementation. It checks restoration of avatar, camera mode, position,
controls and actor leases and leaves earned flags, inventory and money alone.
Use an isolated character that has already completed the bar event so the
review cannot accidentally trigger or settle it.

The named motion pairs have unequal source durations: the Ryo kick is 79
frames and the matching named opponent clip is 124; the counter throw is 81
and the opponent's counter climb is 65. Matching names alone do not prove
simultaneous starts or a complete exchange. Follow-up poses and native state
transitions must be established before these become gameplay choreography.

Additional source evidence explains why simply assigning these clips is
insufficient:

- `DHQB/MPK00.PKF` SHA-256
  `0a32842dd33a4dedd6fbfd210f7978bd6182d28b4264ae2bc7e836510b124b65`
  contains `CHARA.CHRT`, with exact SERA→TUW_L, HARY→GIE_L, JONZ→GIF_L,
  HATO→BAT_L and AKIR→YKB_M bindings. Several initial positions are staging
  placeholders, not useful fight anchors: AKIR `[133.5,0,38.52]`, SERA
  `[13.3,0,22]`, and HARY/JONZ `[3.3,0,20.6]`.
- `DHQB/MAPINFO.BIN` SHA-256
  `79e56d21feda1d331d0734730e5a8b52766262cee6cb6ff3304a6fbdc502508d`
  has no embedded AUTH. Its original controller at `0x9808` calls the
  transform/link helper `0x28fc` and uses per-state motion callbacks at
  `0x3af4`. For example, the call at `0x98fe` links a runtime-table actor to
  the main actor with X/Z/angle arguments `0.82703`, `0.42759`, `79.7557`.
  Those relative transforms must not be treated as absolute world positions.
- `CHARA.CHRT` explicitly binds `TBN0/1`, `CIS0/1`, `CB10/11`, `CB20/21`,
  `CB30/31`, `TBI0/1` and `MLK0/1` to the fight-specific furniture/milk models.
  The controller switches these objects and calls their motion handlers;
  the `DYNAMICS.DYNM` tracks and exact switch timing remain unresolved.

The next implementation gate is a reviewed continuous actor/object alignment,
then connecting that presentation to the existing client-timed challenges.
Keep native-controller research timeboxed rather than enabling the failed
diagnostic placement as an approximation.

On 2026-11-07, another isolated rendered review sampled four interpretations of
the link helper's relative offsets and four positions in the normal room. The
open floor near native `(3.5, 0, -6.5)` avoids the counter intersection seen in
the earlier test. It does not establish correct contact or that this helper
call belongs to the tested QTE: the counter throw leaves its opponent in the
air at the end of `OTH_TKA_QOK_NORU_CAUNTER_HB_A`, and the table/kick/high-kick
pairs still need actor alignment and continuous follow-up review. The same
bank contains `OTH_TKA_QOK_SUBERU_CAUNTER_HB_A`, a candidate continuation,
but its use, placement and furniture interaction are not established. These
samples were inspection only; Story remains unchanged. The test restores the
player and leases and confirms the isolated character's flags, inventory and
money are unchanged.

A further rendered high-kick review tried the opponent on either side of Ryo,
at one or 1.5 units, with opposed and matching headings. The two original
clips were started simultaneously. None of the sampled placements established
credible contact: the opponent moves before or away from the visible kick, or
overlaps Ryo. Some movement also leaves the fixed diagnostic camera. Those
observations are not proof that the original clips are mismatched; their
relative start timing and original anchors remain unknown. The second set is
reproducible with `NEW_YOKOSUKA_BAR_HIGHKICK_CONTACT_REVIEW=true` alongside the
bar motion review; it cannot award progress.

The inquiries below continue this clue. The parking-lot ambush continues their
evening lead; the same-night tattoo-parlour visit, later Charlie confrontation
and Chinese-letter progression are connected and documented below.

## Searching for Charlie: daytime inquiries

These ordinary talks are data in `tools/scripting/story-investigation.json`,
compiled into the existing official Yarn imports. All use personal Story mode,
a completed opening, original HUMANS.AFS text/voice pairs, current NPC presence,
the normal talk picker and existing participant-facing cleanup. There is no
extra weather condition, camera package, item, reward or combat result.

| Event / location | Gate | Original voice group | Saved clue |
| --- | --- | --- | --- |
| `ono-charlie-jackets` — Knocking Motorcycle Shop, Dobuita; 10:00–21:00 | Charlie lead | F1114 | Ask Tsuruoka at Jupitor's Jackets. |
| `tsuruoka-charlie-evening` — Jupitor's Jackets, Dobuita; 10:00–20:00 | Charlie lead | F1032 | Sightings around 19:00. |
| `kurita-charlie-evening` — Kurita Military Surplus, Dobuita; 10:00–20:30 | Charlie lead | F1033 | The same evening clue; alternative to Tsuruoka. |
| `kinuyo-nagai-referral` — Kinuyo in Dobuita; 10:00–20:00 | Charlie lead | F1155 | Optional Nagai Industries inquiry, past Lapis. |
| `nagai-charlie-inquiry` — Nagai Industries; 13:00–23:30 | Kinuyo's referral | F1223 | Ask the younger men in the office. |
| `hasegawa-charlie-inquiry` — same office and hours | Kinuyo's referral | F1107 | Ask Toshiki for details. |
| `toshiki-charlie-hangouts` — same office and hours | Kinuyo's referral | F1150 | Charlie visits the military surplus and jacket shops at night; ask the shopkeepers when. |

### Common sequence, outcomes and provenance

Click a resident, lock gameplay input, turn that resident toward Ryo, play the
selected original voiced lines, restore facing, then settle that talk's completed
milestone and its notebook clue together. Space advances a line; X/cancellation,
failed preparation or disconnect settle nothing and leave a retry. Completed
talks do not repeat or grant another page. Reload reads the same authoritative
flags. No guessed native compatibility bits are written for these clues.

The authored line order condenses first/repeat conversations rather than
reconstructing native per-person dialogue counters. Tsuruoka and Kurita can be
asked directly after learning about Charlie; Ono's referral is useful direction,
not an extra mandatory gate. Nagai Industries remains optional, and its clues
do not suppress the simpler shopkeeper route. Ambient/work poses and the
player's gameplay camera remain the existing renderer's presentation, not
recovered original conversation direction or gestures.

The [original GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
establishes the inquiry order and optional office route. The
[Shotgunnova walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404)
distinguishes learning about evening visits from the later-night ambush: the
ambush is not available on the bar-brawl day. The current inquiry events do not
grant an ambush win or tattoo-parlour milestone. The later encounter uses the
separate calendar gate and client-simulated fight described below.

The talk gates above are pragmatic authored daytime windows plus actual
personal NPC presence. They are not a recovered native business/selector table.
The shared waiting catalog now also offers 10:00 and 13:00 targets, through the
same confirm/cancel, atomic personal clock settlement and private NPC refresh
as evening/morning waiting. This remains a wait-anywhere adaptation; it does not
implement sleeping or curfew, and does not itself collect the separate daily
allowance.

### Verification and input ownership

`NEW_YOKOSUKA_CHARLIE_INQUIRIES_E2E=true` resumes the bar-clue checkpoint.
It advances the actual personal clock, clicks all seven rendered residents,
observes mouth movement across rendered frames during initial voice playback, advances
the remaining lines with supported Space input, checks notebook leads and
unchanged money, then reloads the saved Ryo, office location, date and progress.
Travel is shortened by placing the test player near the real scheduled residents;
this is not proof of walking every route or listening to every recorded line.
Real PostgreSQL/Yarn tests separately cover gates, closing times, missing
participants, cancellation/retry, repeated settlement and other-character
isolation.

The 2026-10-23 facial recheck passed all seven conversations and reviewed their
speaking captures. It used an isolated presentation fixture copied from the
earlier earned bar checkpoint, with these inquiry flags unset; it is not a fresh
opening-to-office playthrough. Kurita's `KZM_L` exposed a shared structural-mouth
matcher that rejected original closed-pose copies differing by about `0.000001`.
The corpus-backed rounding correction in `GenericFaceMorph` also admits 16
other bodies, without borrowing faces or choosing a nearest shape. Those other
bodies have geometry tests, not 16 additional rendered performances.

The test approaches now require both supported footing and a clear sightline
to the actual upper body. Review uses 13:00, when Nagai Industries is open and
Ono is outside: his original 10:00 schedule first waits inside for 120 game
seconds before walking out. Do not remove that wait or click through the shop
wall to make an immediate 10:00 test pass. Ono retains his crouched work pose;
original conversation-facing reactions and gestures remain unreviewed.

The browser check exposed overlapping input locks: a talk could save the date
overlay's `movementLocked=true` and restore that obsolete boolean on exit.
The player controller now supplies independently owned temporary lock tokens.
Yarn presentation, date overlays, modals and cutscenes release only their own
tokens; a manual gameplay lock and other live owners remain effective. Focused
tests cover both completion orders and modal handoff; a next-day browser check
verifies that date transition and conversation cleanup leave movement unlocked.
The fresh opening → natural allowance → saved reload check and desktop/mobile
arcade-results modals also pass with the shared lock primitive. Error-path tests
verify that failed actor cleanup still releases the event's input token.

## Arcade-area ambush: the tattoo-parlour lead

Event ID: `story-s1-parking-lot-ambush`, official import `parking-lot-ambush`.

| Field | Implemented adaptation |
| --- | --- |
| Location and trigger | Dobuita (`D000`), approach to You Arcade from the Suzume Park side. Cross authored region `s1.d000.arcade-ambush`, centred on the original introduction's Ryo arrival. The server checks accepted presence, not coordinates supplied in the trigger request. |
| Prerequisites / calendar | Personal Story Ryo, opening and Heartbeats bar complete, evening-visits clue, 19:00–23:30 and a later personal day than the bar brawl; ambush incomplete. No forced weather. |
| Introduction / trap | Original DRAUTH `SEQDATA1.AUTH` and `SEQDATA2.AUTH`, packaged through the existing native cutscene player. Explicit X-skip advances these noninteractive introductions; it does not win the fight. Original cast, voices, motion, camera timeline and available BGM013 cue are reused. |
| Fight | Ryo against Smith Bradley (`SMTH`), Harry Thompson (`HARY`), Tony Abrams (`TONY`), Takeshi Sera (`SERA`) and Jones Henders (`JONZ`). Start from the trap's decoded final AMOV positions. Shared punch, kick, throw and guard controls with earned Story moves; at most two attackers act simultaneously in this adaptation. |
| Victory dialogue | Stage Ryo and Tony in the lot; choose Charlie or the tattoo, then play the selected original E1068 voice/subtitle lines. Both choices converge on a tattoo parlor in Yokosuka, with its location still unknown. |
| Completion | After interrogation cleanup, atomically record the personal fight day, `story.s1.parking-lot-ambush.completed` and `notebook.s1.tattoo-parlor`. No yen, item, persistent HP or experience reward/change. |
| Exit | Restore the pre-introduction approach position, facing and camera; release private actor/input ownership and resume the personal clock. This deliberately differs from the original parking-lot exit. |
| Failure / cancellation | Health defeat or heartbeat/time limit offers retry or leave; retry restarts only the fight. Cancelled preparation, fight or unfinished interrogation settles no clue. Completed encounters do not replay. Reconnect reads committed progress; an uncommitted fight restarts rather than persisting every punch. |

### Provenance and approximations

- Original `D000/DRAUTH.PKS` supplies the cast and introduction/trap timelines;
  the trap AUTH hash is checked by `build_story_combat.mjs` before deriving
  actor positions. The original `SCENE/01/STREAM/E1068.AFS` supplies ten selected
  lines: AKIR A001–A003 and TONY B001, B003–B008. The generated import retains
  its source hash.
- The [Shotgunnova walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404)
  supports nighttime, the later-than-bar day, Suzume-side approach, five thugs
  and at most three active attackers. The
  [original guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
  supports interrogation leading to the tattoo parlor.
- `tools/scripting/story-combat.json` authors health, movement speed, rectangular
  arena padding and the strict retry policy. The generator reuses shared practice
  move identities, timings, damage, ranges, stun and 400 ms input buffering.
  These are playable rules, not a reconstructed original free-battle engine.
  Story now uses the shared client combat engine, earned move repertoire,
  authored paired throws/root motion and combat sound cues. Enemy-specific
  movesets and exact original battle behaviour remain approximations.
  The arena uses bounded movement and fighter separation,
  not the ordinary scenery collision system. The temporary fight HP does not
  modify the character's persistent MMO HP.
- The interrogation's standing poses and two-person camera are authored; Tony's
  original grabbed pose is not recreated. Fight music retains normal zone
  music; the introduction's BGM013 is not claimed as the recovered battle theme.
- New bar completions record their date. Older prototype saves with the bar flag
  but no date receive an explicit unvoiced notice, record the current day as a
  conservative baseline, and must return another night. No silent guessed date
  or automatic ambush win is supplied.

### Verification

On 2026-11-08, a connected character with earned Heartbeats, Ono and Tsuruoka
leads (earlier prerequisites seeded) walked into the ambush region during the
following day and waited there until 19:00. The personal clock re-armed the
region without requiring an exit and both original introductions played
without skips. A first keyboard-controlled fight lost and saved no clue; after
reconnection, a second ordinary fight defeated all five. The Charlie-choice
interrogation ran without skipped lines, the tattoo lead survived reload and
controls and persistent HP/yen were unchanged. This does not establish every
interrogation face, the alternate choice or original fight fidelity.

The ambush, Heartbeats alley, Fuku's letter gate, the dojo return and Nozomi's
post-parlor approach now declare the same dispatch hours as their existing
server gates. Without that metadata, entering before opening could consume the
client's entry latch until the player physically left. Catalog checks compare
all time-gated investigation bounds against their authored story windows; only
the ambush's wait-inside case received this connected rendered recheck.

`NEW_YOKOSUKA_AMBUSH_E2E=true` walks across the real trigger and renders/skips
both original introductions. The 2026-10-23 complete check passed from an
isolated copy of the earned Charlie-inquiry checkpoint: defeat, retry with
physical keys, all five opponents defeated, Charlie dialogue choice, tattoo
clue/date settlement, notebook, completed-trigger rejection and saved reload.
The keyboard helper uses ordinary guard/movement and starting moves, including
Elbow Assault (`W,W,J`) and Side Reaper Kick (`S,K`), instead of the earlier
ineffective repeated simple attacks. No health/damage/difficulty changes or
injected result were needed. It stops issuing commands when the last opponent
falls, then waits for the real victory dialogue; a missing target direction
during the final animation is valid, not a nonfinite gameplay coordinate.
Reviewed captures show the interrogation and saved notebook; saved HP remains
100 and yen 2,000, with zero actor leases and unlocked movement after reload.
Full interrogation lip/gesture fidelity and the alternate tattoo choice are
not established by this check. Samples and combat events are retained.
Travel to the approach is shortened; this is not a proof of the entire walk
from the previous shop or every combat move's choreography.

Add `NEW_YOKOSUKA_COMBAT_REVIEW_E2E=true` for the focused rendered guard/cancel
check, not the complete progression check. The latest 2026-10-23 hardware-browser
run observed 32 blocked strikes and one correctly damaging throw in 21 seconds,
without a third fighter interrupting either half of the pair. X cancellation
released actor leases and movement, restored numeric pose/camera mode, and left
saved flags, persistent HP and yen unchanged. A regression test also covers a
strike landing on the same simulation tick knockdown recovery ends: held guard
now resumes immediately. The inspected return screenshots in the last two runs
show a normal third-person view; the earlier close-up was not reliably reproduced
and no camera patch is claimed. The fight HUD now has a collapsible move scroll,
no empty command box, and a compact action panel. Browser checks verify opening
and closing the scroll, actual attack feedback, and five 44-pixel-or-larger
buttons in a panel under 160 pixels tall at 1280×720. Mobile layout is not
certified by this desktop check. The separate rendered QTE/move-lesson check
also passed through Tornado Kick and Swallow Flip; its transport is mocked,
so it is not evidence of saved Story progression.
The JSON frame/event trace and screenshots are written to the test output,
not production logs. No win or prerequisite was injected.

The compiler/PostgreSQL test executes the canonical generated import with
simulated result intents, not server combat AI. It checks missing-date migration, same-day/daytime/
out-of-region rejection, another character's inability to advance the run,
timeout, cancellation before and after victory, atomic clue/date settlement,
repeat protection and stale post-completion inputs. Headless result tests do
not establish visual fidelity.

## Finding the tattoo parlor and the same-night visit

| Event / location | Gate and trigger | Presentation and saved outcome |
| --- | --- | --- |
| `saijo-tattoo-location`, Bar Yokosuka (`DBYO`) | Tattoo-parlor lead, resident Saijo, 17:00–03:00; normal talk click. Later-story priority outranks his earlier sailors clue. | Twelve selected original F1131 lines identify Takashiro and Okayama Heights. Save `notebook.s1.okayama-heights` and the talk milestone. |
| `kurita-okayama-location`, Dobuita (`D000`) | Okayama clue, resident Kurita, 10:00–20:30; normal talk click. | Ten original F1033 lines give the opposite-Bar-Yokosuka location and second-floor direction. Save `notebook.s1.okayama-second-floor` and the talk milestone. This extra direction is optional, not an entry requirement. |
| `first-tattoo-visit`, Tattoo Parlor (`TATQ`) | Tattoo-parlor lead, resident Takashiro (`HORS`), 14:00–midnight, same personal day as the ambush; automatic entry. Directly discovering the room is allowed without either location talk. | Twenty original F1024 lines: ask for Charlie, refuse a tattoo, and receive the tomorrow lead. A shared authored two-person scene holds Ryo/Takashiro, then restores exact entry position, facing, camera and NPC ownership. Atomically save `story.s1.first-tattoo-visit.completed`, `notebook.s1.charlie-return-tomorrow` and the personal visit-day ordinal. |

The [original GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
pages 24–26, supports the alternate location searches, upstairs entrance and
later-day visit after 2 p.m. The
[Shotgunnova walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404)
distinguishes the ambush-night artist talk from later-day first arrivals, which
belong to Charlie's confrontation. Do not impose an invented extra waiting day
on those later arrivals; the connected confrontation below handles them directly.
Our optional location path uses Saijo and Kurita; the original gang-joining and
Nagai alternatives are not yet authored here.

All three use the personal calendar and existing server/Yarn settlement. They
have no weather requirement, new prop, item, currency reward, clock jump or QTE.
Voice lengths/manual Space control line timing; the ordinary zone music and
ambience remain. Cancellation, preparation failure and disconnection settle no
clue/date; completed visits cannot pay or replay. The parlor's original grab
gesture and camera direction are not reconstructed. Its held poses, Ryo's nearby
position and side camera are authored around HORS's original room anchor
`[-1.3584, 0, -2.4255]` from the 14:00 CM_D000 schedule journey.

`NEW_YOKOSUKA_TATTOO_E2E=true` continues the ambush-earned checkpoint. It clicks
both residents, observes original voice playback, enters through the real
upstairs door, checks the artist's rendered body, cancels and re-enters, completes
the conversation, inspects the notebook and reloads the saved room/Ryo without
replay. Exterior travel is shortened; walking the full stairs route and every
original gesture are not claimed. The real compiler/PostgreSQL suite checks
ineligible players, actor presence, hours, later-day exclusion, cancellation,
repeat protection, unchanged economy and clue/date settlement. The shared wait
menu now includes a confirmed/cancellable 14:00 target for the coming encounter.

The 2026-10-23 connected continuation passed directly from the new keyboard
ambush victory, without inserting tattoo prerequisites. Both location talks,
door entry, cancelled visit/re-entry, notebook and saved reload passed. The
same save then used the normal wait menu for the next-day Charlie encounter.
This connects the earned events across saves; the earlier investigation
checkpoint was copied into an isolated fixture and exterior travel shortened.

On 2026-11-08, a separate connected character earned the ambush victory and
walked to both Saijo and Kurita, playing their conversations without skips and
retaining each clue after reload. The natural approach found a collision wall
blocking the stairs; a source-backed, bounded collision-field handoff now
allows the character to climb to the real door. The artist's conversation then
completed without skips, with rendered mouth movement and the next-day clue
retained after reload. A separate cloned-save check walked up and down and
checked the stair side and ground collision. The [collision investigation](../research/shenmue1/native-world-collision.md#okayama-heights-natural-ascent-blocker)
records the evidence and the limits of the handoff approximation.

The rendered visit exposed an ownership bug: ordinary GPU occlusion had disabled
the artist's render hierarchy while his placement remained enabled. Activity
ownership now temporarily clears ambient occlusion and camera fading, then
restores their exact prior policy. Partial acquisition or failed restoration
still releases every actor lease. This shared boundary covers borrowed cinematic
actors, not a tattoo-artist-only visibility override.

## Charlie: confrontation and the cartel appointment

Event ID: `story-s1-charlie-tattoo-confrontation`; automatic `TATQ` entry at a
higher priority than the same-night artist conversation.

| Field | Implemented adaptation |
| --- | --- |
| Prerequisites / trigger | Personal Story Ryo, completed opening, tattoo-parlor lead, resident HORS, 14:00–midnight and a personal day later than the ambush. Cross the parlor door or resume inside an eligible room. The same-night artist conversation and optional location clues are not mandatory for later-day first arrivals. |
| Characters / setup | Original animated Ryo/Takashiro/Tony/Smith introduction, then authored Ryo/Charlie challenge staging. Reuse shared actor ownership, model loading, camera and input locks. An owned out-of-shot HORS is hidden during the confrontation and restored afterward. |
| Dialogue / timing | Exact 1,780-frame introduction includes twelve A0136A voice/subtitle cues, original camera/body tracks and thirteen distinct sound-effect resources. Then a real Left/A QTE; only winning reaches the 1,695-frame original aftermath with all eighteen A0136 recordings and the next-day 3 p.m. appointment. Space advances movie time, never answers the challenge. |
| Presentation / props | Original AUTH `0x23ce4` drives the introduction and `0x281e0` drives the disarm, arm-grab/interrogation and release. Both packages use original camera/body tracks, detailed faces and hands. The introduction tool follows original attachment cues; HORS/Tony finger poses and HORS's later body-hand request are connected. The aftermath includes the moving knife and source-bound open curtain. Its wrist adjustments are compiled from the original callback. The playable QTE still uses authored standing staging; curtain-opening manipulation, callback expression/gaze controls and the tool's off-camera resting placement remain incomplete. No new gameplay item is granted. |
| Challenge | Closed catalog `s1.tatq.charlie`, Left then A. Keyboard uses ArrowLeft then Enter; touch buttons use the same client runtime. Two-second client windows and strict restart are adaptations. Wrong input/timeout offers retry or leave. The server accepts the trusted final client result for the current ready attempt; ordinary Continue, movie completion and stale tokens cannot succeed. |
| Calendar / environment | Preserve personal weather, season and ordinary room music/ambience; no forced lighting or date jump. Event ownership pauses the personal clock. Record the successful conversation's personal day, rather than resetting the public world time. |
| Settlement / exit | After scene cleanup, atomically commit `story.s1.charlie-tattoo-confrontation.completed`, `notebook.s1.charlie-cartel-appointment` and `story.s1.charlie-parlor.day`. Appointment eligibility can derive the following day from that ordinal. Restore exact room-entry avatar/location/facing/camera and controls. Money, persistent HP and experience stay unchanged. |
| Skip / failure / replay | Space skips lines but never the QTE. Cancellation, failed preparation and unfinished post-win conversation grant no appointment or partial date. Completed encounters do not replay; reconnect reads the committed state. Failed attempts remain retryable. |

The original [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
and [Shotgunnova walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404)
support the day/time gate, Left/A order and appointment. Original
`SCENE/01/STREAM/A0136A.AFS` and `A0136.AFS` are hash-pinned by the generator.
`TATQ/QTE.PKS` supplies the scene-specific `BIS_L`/`BIS_F` body/face and its PKF
supplies textures. QTE.PKF's CHARA.CHRT explicitly binds `CHRL` through image
`CHT_L` to `BIS_L`, independently of the rendered identity check.
`build_tatq_story_assets.mjs --audio` reproduces both packages and explicitly
registers its ignored assets (set `VGMSTREAM_CLI` and a DTPK-compatible
`DTPK_PYTHON`; use a disk-backed `TMPDIR`; `--profile introduction|aftermath`
limits regeneration to one package). The M_0136 waiting clips were inspected/rendered, but their
first-frame poses were not suitable as a standalone scene; generic original
standing motion is an intentional replacement, not a fallback alias.

The introduction borrows exact MAPINFO bytes `0x23ce4..0x26fdc`, SHA-256
`df894f627509cdaae4b07fd61ff594848c52a14763fe91c5795bd2ff39d36bd6`,
bank 16 `M_0136.MOTN`, `A0136A.AFS` and `A1_TATT3.SND`. It replaces the obsolete
standing introduction rather than keeping two paths. Movie completion only
advances to the playable challenge; it cannot award success or the appointment.
After updating a server, republish `charlie-tattoo-confrontation` with the
documented `cmd/script-import -builtin` workflow before accepting new runs;
restarting a server does not update an already published Yarn version. The old
introduction sequence capabilities are retired, so drain/cancel old active
runs as part of any future coordinated client/server rollout.

The shared CHRT parser now recognizes original mixed-case/uppercase property
names and binds each character to the preceding image definition, preserving
later redefinitions without changing earlier objects. A local scan of 340
CHRT members across all three source discs found 907 additional bindings in
106 members (includes repeated disc content), no changed previously resolved
model identities, and resolved ten previous parse errors. This is source
coverage, not proof that every newly discoverable prop is rendered in-game.

The introduction is embedded TRCK slot 0. Original controller `0x19044`
launches child `0x19fb4` immediately before starting that slot. The extracted
[callback record](../../tools/evidence/tatq-introduction-callback-ir.json)
retains both functions, their source hash and exact call offsets. Reproduce it
with `python3 -m tools.cutscenes.extract_native_aseq_callback_ir --disc 1 --area TATQ --map-entry 0x1c670 --callback 0x19fb4 --include-function 0x19044 --output tools/evidence/tatq-introduction-callback-ir.json`.
The shared callback compiler recovers `ITEM` → HORS right-hand controller 18
at frames 1/60, including original local position/rotation, then release at
frame 1000. Same-frame detach/rebind keeps the last operation, as in DJHN/TOKI.
CHRT binds `ITEM` through `HORI` to `B03I005G`; no visual filename guess or
hand-tuned offset is used. The current attachment runtime hides this standalone
prop after release; its original off-camera resting placement is not claimed.
The same callback supplies HORS's two detailed hand poses and Tony's left-hand
pose at frame 1, followed by HORS's left body-hand request at frame 60. The
package now includes their exact global `MODEL/HAND/TAT_*` and `GIJ_*` models
and rigs, with hash-pinned provenance. The shared descriptor builder derives
each model's root keys and vertex count; no copied rig dimensions or tattoo-only
renderer is needed. Presentation-only regeneration now refreshes the runtime
asset registry even without `--audio`, preventing stale manifest/model hashes.

`NEW_YOKOSUKA_CHARLIE_QTE_E2E=true` continues the earned ambush/parlor checkpoint.
It uses actual personal waiting, real door entry or an already-starting resumed
room event, original voice playback, a wrong direction, retry, real Left/Enter
inputs, the clue conversation, unchanged HP/money and the notebook. Full-stack
tests also prove same-day exclusion, missing artist/early-hour rejection,
later-day first arrival without the optional artist flag, cancellation before
and after winning, atomic day/clue settlement, repeat protection and another
character's isolation. Original playable-challenge choreography is not yet
implemented; mobile/controller/gamepad input has not been visually verified.
The ending choreography is covered by the original-aftermath check below.

The 2026-10-23 continuation from the newly earned ambush/first-visit save also
passed intro cancellation/re-entry, wrong-input retry, Left/A success,
appointment settlement and reload without replay. Saved day ordinals are
`6185` for the ambush/first visit and `6186` for Charlie, with unchanged money
and persistent HP. Reviewed captures show the original animated introduction,
the then-authored standing challenge/aftermath and the appointment notebook.
The later original-aftermath check below supersedes that ending presentation.

On 2026-11-08, a connected earned first-visit checkpoint (earlier prerequisites
seeded) used the real door for a same-night return, which correctly did not
trigger. Ryo descended the stairs, waited until the next afternoon, climbed and
re-entered. The original introduction and aftermath ran without skips around
actual Left/A QTE inputs; the appointment clue and unlocked controls survived
reload with HP and yen unchanged. This does not replace the separate failure,
cancel/retry and detailed facial/prop reviews.

2026-10-23 rendered recheck: `NEW_YOKOSUKA_TATTOO_PRESENTATION_E2E=true`
played the complete introduction and captured frames 200/480/900/1120/1200/1360/1650.
Original camera cuts, Ryo's entrance, sailors' retreat and voiced Ryo/Tony/Smith/
Takashiro mouth deformation were observed. Original `TAT_F`/`TAT_FTBL` use
SH-4-evaluated TALK poses through the shared face catalog, including the voice
adapter used by ordinary Story dialogue. Separate rendered close-ups confirmed
the artist's changing mouth and hand-held tattoo tool. The follow-up hand check
also reviewed native frame 200 and diagnostic close-ups of HORS's tool grip
and Tony's left hand, with detailed meshes and source poses active. The full
1,780-frame replay and cancellation pass with those hand assets enabled;
14 focused compiler/hand tests pass. Regenerating the existing Nozomi amulet
and Chen letter packages through the shared descriptor produces byte-identical
manifests. All four speakers played audio. Cancellation
and completion restored avatar, position, camera mode and controls with no
flag, inventory or money changes. The tool moved with the hand and released at
its source frame. Curtain-opening manipulation remains incomplete;
adding face/prop assets is not a certificate
of complete scene fidelity or a fresh same-night-visit rendered check.

The aftermath uses embedded slot 2 at `0x281e0`, 21,660 bytes, SHA-256
`e5ad1935a05b9560b43f8755f1a1d48435c6fa66ce467352e6c8c1272f7c5e6e`,
normalized to package slot 0. Original owner `0x19044` selects callback
`0x1a69c` and setup `0x19860`; the [callback evidence](../../tools/evidence/tatq-aftermath-callback-ir.json)
retains all three. CHRT supplies open curtain `KTE3` / `B03I008G` and its
initial transform. The existing actor-lease system suppresses the out-of-shot
artist/sailors and restores them afterward. Charlie's exact `BIS_F`/FTBL pair
now uses 80 upper-face and 80 mouth poses evaluated by the original SH-4 TALK
routine, shared with ordinary voiced dialogue. The wrist compiler recovers
five constant adjustments and the inclusive frame 510–539 integer ramp;
unknown feedback writes still reject the entire affected hand lane.

Rendered full playback reached the ending, played all eighteen recordings and
showed both speaking faces, the knife/disarm, wrist grip and release. Native
frames 105/420/801 and a Charlie facial close-up were reviewed. Separate
presentation cancellation and completion restore avatar/location/camera/input
without changing flags, inventory or money. A connected continuation from an
isolated copy of the previously earned ambush checkpoint then passed real door
re-entry, intro cancellation, wrong input/retry, actual Left/Enter input,
cancellation after winning, another successful attempt, notebook settlement
and reload without replay. Independent database reads confirm day 6186,
¥2,000 and HP 100. This is not a new complete opening-to-Charlie playthrough.

That connected check exposed a shared missing control: standalone AUTH
packages advertised Space-to-skip but their player had no seek implementation.
Forward skipping now executes every intervening native frame/command, using
the existing audio seeking mode to suppress intermediate playback, and waits
for covered completion/cleanup before Story settlement. Keyboard skipping is
asserted through the rendered browser, not a direct completion call. Rewind
and pause are not newly implemented by this change.

Earlier fixture-only Charlie checks and failed automated ambush attempts are
superseded by the connected ambush → first visit → Charlie checks above. They
do not constitute a fresh opening-to-Charlie playthrough, nor do they establish
the still-authored playable challenge choreography.
Health, damage, encounter difficulty and result settlement were not adjusted to
force a win. The older later-fight helper also reverses target-relative strafing;
repair that test helper before treating it as reliable movement evidence.

The source assets and newly encoded Story voices are registered in the immutable
runtime catalog. They have **not** been published to R2 from this worktree;
publication and verification are required before any later authorized deployment.

## Nozomi's concern after the tattoo parlor

Event ID: `story-s1-nozomi-after-parlor`; official import `nozomi-after-parlor`.

| Field | Implemented adaptation |
| --- | --- |
| Location / trigger | Dobuita (`D000`), lower approach to the Okayama Heights stairs. Cross authored region `s1.d000.nozomi-after-parlor`; the server uses its accepted Ryo presence, not trigger-request coordinates. |
| Prerequisites / personal calendar | Story Ryo, opening and Charlie confrontation complete, same personal day as the saved parlor encounter, 14:00–23:30, Nozomi encounter incomplete. This is optional and must not gate the following day's letter. |
| Player / actors | Borrow Ryo and Nozomi (`HRSK`) through shared cinematic ownership. Nozomi can be staged even when her ordinary personal schedule is elsewhere; no public or other-player NPC is moved. |
| Sequence / timing / camera | Play the existing `YBHN/SEQDATA0.AUTH` package: original 2,130-frame timeline, `M_01YOB` body motion, cameras and 26 original `01YOB` voice cues. No new handwritten dialogue or invented camera offsets. |
| Props / challenge | None. No QTE, fight, reward or item. Completing a noninteractive scene is not a combat win. |
| Weather / audio | Preserve personal season/weather and ordinary broad environment. Reuse the package's original voices/SFX and existing BGM018 render, then restore the prior zone music. This does not reconstruct incidental native room initialization. |
| Completion | After presentation cleanup, atomically save `story.s1.nozomi-after-parlor.completed` and `notebook.s1.nozomi-worried`. No currency, persistent HP, experience, clock jump or guessed native bit. |
| Exit / skip / failure | Restore the pre-scene approach position, facing, camera and controls. Natural ending or explicit cinematic X-skip accepts the noninteractive encounter. Event cancellation, lost connection or failed preparation settles nothing; re-entering the region or resuming the eligible saved approach retries it. A committed scene does not replay. |

The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
page 26, places this conversation after Ryo comes down the tattoo-parlor stairs
and records Nozomi's concern. The original archive hashes and motion bindings
are retained by `build_ybhn_activity_pack.mjs` and `build_ybhn_audio_pack.mjs`;
the authored import pins both `YBHN.PKS` and `01YOB.AFS`. The same-day/hour gate,
activation box and exact return-to-approach policy are adaptations, not a
recovered native trigger. The box includes the walkable street edge before
scenery collision and excludes the upstairs arrival elevation.

Dobuita now has several area-entry candidates. Their explicit priorities let
an ineligible Nozomi gate pass to the earlier ambush/alley candidates. Equal
priorities are ambiguous before any gate executes; both the content generator
and the complete official-import catalog test reject that mistake rather than
weakening the server's ambiguity safeguard.

`NEW_YOKOSUKA_NOZOMI_PARLOR_E2E=true` resumes the earned Charlie checkpoint,
uses the real return door when starting in the parlor, and shortens the stair
walk to the lower approach. It checks cancellation without a notebook entry,
physical walk/re-entry, natural original-timeline completion, restored controls
and camera, notebook settlement and reload without replay. A separate run with
`NEW_YOKOSUKA_NOZOMI_PARLOR_SKIP=true` also passed the real parlor exit,
original voice playback and explicit X-skip after the cancelled attempt.
This is not proof
of walking every stair from the upstairs door or full frame-for-frame fidelity.
Real compiler/PostgreSQL tests cover missing progress/date, wrong day/hour,
out-of-bounds rejection, cancellation/retry, stale acknowledgements, mode
locking, another character's isolation and unchanged economy.

The October 23 recheck passed the real parlor return door, walking trigger,
cancellation/re-entry, natural completion, notebook and saved reload again.
It used the isolated parlor fixture whose earlier prerequisites were seeded,
not a fresh uninterrupted bar/ambush playthrough. A separate presentation-only
run completed all 2,130 frames and sampled original NZM/YKC face deformation
during speech, with reviewed native shots and diagnostic close-ups. Those
checks do not certify all authored expressions or gestures.

On 2026-11-08, the connected earned Charlie checkpoint used the real parlor
exit and walked down the repaired stairs. Nozomi's voiced scene triggered
during that descent and completed without skips; its notebook clue survived
reload and movement, actor leases, HP and yen were restored. This run did not
repeat the separate cancellation or detailed face review.

## Next-day dojo practice and the Chinese letter

Two official Yarn imports connect this sequence: `cartel-dojo` in the grounds,
then `chinese-letter` in the house. Normal house travel is between the two
settled events; no transient Yarn session is expected to survive a world reload.

| Field | Implemented adaptation |
| --- | --- |
| Location / trigger | Walk into the Hazuki dojo-floor region in `JHD0`. After the invitation, enter the house (`JOMO`) through normal travel; its automatic entry selects the letter event. |
| Prerequisites / personal time | Story Ryo, opening and Charlie confrontation complete; dojo encounter incomplete; a later personal day than the parlor appointment, 08:30–23:30. Optional Nozomi concern is not a prerequisite. The letter requires the saved invitation and is retryable on later house entries. |
| Actors / practice | Ryo and Fuku-san use the existing cinematic actor ownership and shared combat moves. Thirty seconds of client-timed, nonlethal practice: both can move, attack and defend, but neither is knocked out. The current authorized attempt and bounded keepalive are required; stalled or cancelled preparation is not completion. The result is `practiced`, distinct from a fight's `success`. |
| Action / dialogue | After practice, play original `KAKG/SEQDATK2.AUTH` (Fuku-san's concern and Ryo's cartel lead), then `SEQDATK3.AUTH` (Ine-san's invitation). In the house, play the original 2,016-frame letter handoff, including its 13 A01124 voice cues and original M_01CRY motion/cameras. |
| Props / audio | The house presentation renders the original `MALS501G.MT5` envelope and `TTMS246G.MT5` tatami model. Its room resource cluster supplies A1_INET2, A01124 and BGM115; reuse the viewer's already rendered, hash-pinned BGM115. Dojo conversations reuse their existing slot-specific audio/music. |
| Weather / camera | Preserve personal weather/season and broad room lighting. Practice uses the shared third-person gameplay camera; conversation/handoff shots use the original AUTH cameras. |
| Settlement | Completing the dojo follow-ups atomically saves `story.s1.cartel-dojo.completed`, `story.s1.ine-letter-invitation` and the personal dojo day. Completing the separate handoff atomically grants one non-stackable `chinese_letter` through existing inventory/economy storage and saves `story.s1.chinese-letter.completed` plus `notebook.s1.chinese-letter`. No yen, persistent HP/XP reward or guessed native bit. |
| Exit / skip / failure | Restore each event's entry position, camera and controls. Cinematic X-skip acknowledges noninteractive presentation only; it cannot finish practice. Cancelling practice or its unfinished follow-up saves no invitation. Cancelling the letter saves no item/notebook, but preserves the previously earned invitation. Reconnect resumes committed outcomes without another grant. |

The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
page 26, supplies the next-day spar, concern, house invitation and unreadable
letter order. The adaptation requires approaching the dojo rather than forcing
Ryo there on waking. The preceding meditation, exact original spar duration,
Fuku-specific fighting style and walk-follow-Ine choreography are not recreated.
Practice uses the existing simplified combat arena/AI, not ordinary scenery
collision. Its temporary health never changes the MMO character's health.

`build_chinese_letter_assets.mjs` reproduces the embedded JOMO AUTH at
`0xa8860` (22,008 bytes, SHA-256
`6505ad7b3c4ad0266bfb15d1849d5e7e4a77105d5a0bd54fd0d2e428bd065572`),
COMMON01's four-entry M_01CRY bank with sequence-index base 80, and the two
standalone models. MAIL/envelope and TTMI/tatami pairing uses their identities
and the adjacent original resource cluster; native allocation code is not
reconstructed. Package slot zero is only a local package ordinal, not a claimed
native room slot. Separate hand/face callback cues are not recovered, so exact
finger/expression fidelity is not claimed.

`NEW_YOKOSUKA_LETTER_E2E=true` starts from the earned Charlie/Nozomi checkpoint,
uses the real personal wait UI, walks across the dojo trigger, cancels/retries
practice, sends physical kick/guard inputs, observes original follow-up voices,
then cancels/re-enters the house handoff and lets it finish naturally. Rendered
checks show Fuku-san, Ine-san and the original envelope. Notebook/reload and
restored Ryo/location/controls pass. The October 23 continuation from the same
isolated parlor/Nozomi fixture additionally lets both dojo movies end naturally,
then checks the house cancellation/re-entry, natural letter ending, exactly one
saved letter, notebook, unchanged HP/yen and reload without replay. Earlier
parlor prerequisites in that fixture were seeded. Test travel is shortened;
walking every connecting route is not proved.
The compiler/PostgreSQL test separately verifies same-day/region gates,
cancellation before/after practice, atomic invitation, cancelled handoff,
one item/economy grant on completion, repeat refusal and character isolation.

On 2026-11-08, a connected character with earned Charlie and Nozomi outcomes
(earlier prerequisites seeded) waited until the next morning, used the normal
fast-travel menu to the grounds and walked onto the dojo floor. Practice used
real controls; both follow-up films finished naturally and the invitation
survived reload. Ryo then walked from the dojo to the actual house door; the
letter film completed without skips, exactly one letter and the notebook clue
survived reload, and HP/yen were unchanged. This does not prove a continuous
walk from Dobuita to the grounds or repeat the separate cancellation reviews.

The separate `NEW_YOKOSUKA_STORY_FACES_E2E=true` /
`NEW_YOKOSUKA_STORY_FACE_SET=letter` presentation-only review completed all
three films naturally and verified moving FUK/INE/YKC face geometry during
speech, original moving `MAIL` geometry, reviewed native shots/close-ups and
restored presentation state without changing progress. The connected daylight
capture also shows the original textured letter in Ryo's hand. Complete
finger/expression callback fidelity remains unverified.

Migration `008_story_items.sql` adds the letter definition. Its possession is
authoritative and server-saved. Inventory now reads actual server possessions;
artwork metadata no longer acts as a demo list of items the player appears to own.
New handoff assets are registered locally but not published to R2. No production
migration or deployment has occurred from this worktree.

## Fuku-san and the Chinese letter at the gate

Event ID: `s1.jhd0.fuku-letter-gate`; official import: `story-s1-fuku-letter-gate`.
The original `A0139` subtitles establish that Fuku asks about the letter Ryo
already received. This is not a second handoff. The
[GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
(printed page 26) places this conversation at the grounds gate before leaving.

| Field | Implementation |
| --- | --- |
| Location / trigger | Cross `s1.jhd0.fuku-letter-gate` in Hazuki grounds (`JHD0`); authored bounds around TGMA's original Ryo anchor, browser `[0.794366,0,3.207726]`. Rendered input/collision crossing verified. |
| Prerequisites / timing | Story Ryo, opening complete, saved Chinese-letter handoff **and** one `chinese_letter` in authoritative inventory, personal 08:30–23:30, not already completed. The daytime window is an adaptation, not a recovered native predicate. |
| Player / cast | Existing personal TGMA presentation owns Ryo and Fuku (`FUB_M`), locks gameplay and suppresses their overlapping ambient copies. No public NPC mutation or remote-player state change. |
| Sequence / dialogue / audio | Original `TGMA/SEQDATA4.AUTH`, `M_0139`, eight A0139 voices and A1_INET2 effects: Fuku asks about Ine-san, the letter, and finding a Chinese reader. Existing Hazuki residence music extends over the scene as an adaptation. |
| Props / camera / duration | Original folding letter `MALS509G`, controller-18 attachment, articulated nodes 152/153, original camera/body timeline, 954 frames (31.8 seconds). Letter shows at frame 350 and hides at 800. Its exact TEXN texture comes from `TGMA.PKF`; no replacement illustration. |
| Weather / lighting | Preserve this character's personal outdoor environment. No forced weather/date or new lighting rule. |
| Challenge / effects | No QTE or fight. Atomically set only `story.s1.fuku-letter-gate.completed` after presentation cleanup. No item, notebook duplication, currency, HP, calendar jump or inferred native flag. |
| Exit / skip / failure / replay | Restore approach position, previous camera and controls in grounds. Explicit cinematic skip settles once; cancellation/preparation failure settles nothing and can retry after leaving/re-entering. Reload preserves completion; stale acknowledgements cannot settle the retry. |

Provenance is pinned in the import, existing TGMA lifecycle evidence and asset
manifest. `TGMA.PKS` SHA-256 is
`095c988fcb8cf05c8559188b8705cc720c48305e9f1f8de3b577d97d676b95c2`.
The newly registered 18,480-byte texture pack comes from `TGMA.PKF` SHA-256
`820b77bb6e2c9d247d13f593a452ad7784b06196f79b042caff629b696d01fee`.
It is built by the existing TGMA producer and is not published to R2 yet.

The connected earned-save check (`NEW_YOKOSUKA_FUKU_GATE_E2E=true`) walks the
region, hears original voice playback, cancels/re-enters, lets the scene end
naturally, checks one letter/unlocked controls and reloads without replay.
An additional continuation (`NEW_YOKOSUKA_EARNED_FUKU_GATE_E2E=true`) starts
with the previously earned letter, waits until morning, exits the actual house
door and walks to the gate without repositioning. The voiced scene plays to
completion; one letter, completion and unlocked controls survive reload, with
HP and yen unchanged. Earlier prerequisites in this isolated run were seeded.
The optional `NEW_YOKOSUKA_FUKU_GATE_PRESENTATION_E2E=true` replays only the
already-earned presentation, not a new story settlement, to verify the letter
unfolding/texture/show-hide cues. Corresponding screenshots are inspected;
headless enabled-state assertions alone are not visual proof.

This check exposed a shared standalone-player bug: prop updating called a
nonexistent `currentActivityPosition` method and silently stayed at frame zero.
Packages now use the AUTH activity's accepted frame, including after cleanup,
and reject attachment failures instead of completing with a silently hidden
prop. The fresh opening's four explicit intro skips, natural allowance ending,
save and reload also pass after that repair. Exact expression/finger fidelity
and every other standalone prop scene have not been visually audited.

## Gao Wen rescue and translator referral

Official imports: `story-s1-gao-rescue` and `story-s1-gao-translator`.
The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
(printed pages 27–28) supplies the theft, three-opponent fight, A-button rescue,
Chinese boy and grandmother/translator order. Original `E1049` and `F1060`
subtitles supply the dialogue, rather than newly written story exposition.

| Field | Implementation |
| --- | --- |
| Location | Sakuragaoka (`JD00`), then Gao Wen's ordinary personal schedule in Dobuita (`D000`). Roadside staging around the existing Sakuragaoka arrival is an explicit substitute for the original construction-lot route and exact placement. |
| Prerequisites | Story Ryo, opening and Fuku gate complete, actual `chinese_letter` possession, rescue incomplete. The referral requires the saved rescue, letter possession and Gao's resident presence. |
| Trigger | Automatic Sakuragaoka entry; after rescue, click Gao in Dobuita through ordinary NPC interaction. |
| Player setup | Borrow the shared cinematic player/actor ownership, lock ordinary movement during dialogue/QTE and use the shared combat input during the fight. Restore the entry pose and camera between presentations. |
| Characters | Gao (`KOM_L`), Charlie (`BIK_L`), Hama (`KMD_L`), Hatanaka (`KAZ_L`), Okayasu (`OKA_L`) and Murasaki (`PPL_L`). Original KOJI CHRT proves Charlie's model binding. The community character inventory and native fighter filenames corroborate the other identities; this is not a recovered native roster-initialization trace. |
| Props | Original `FBB0201G` soccer ball and its KOJI textures, attached with the existing shared controller-matrix/prop runtime. Offsets, attachment switches and hiding after the kick are authored; the airborne ball trajectory is not reconstructed. |
| Action sequence | Original-voiced theft/ambush introduction → real three-opponent fight → Charlie holds Gao → A-button challenge → original kick/release motions → original thanks → separate grandmother referral talk. |
| Dialogue | Reviewed E1049 theft, hostage and thanks lines; condensed original F1060 talk identifies Xia Xiu Yu and Russiya China Shop. No new choice determines whether the letter can be translated. |
| Timing | Voice completion/ordinary advance controls dialogue. The client simulates the fight and times a two-second A prompt; the server records the resulting story outcome. The kick tableau waits for the longest loaded non-looping original motion: Gao's 418 frames (13.93 seconds). Ryo's 243-frame kick moves after frame 120. This is motion timing, not recovered native camera timing. |
| Camera shots | Authored two-person/wider cameras and the existing gameplay combat camera. No claim of original KOJI camera/controller execution. |
| Weather and lighting | Preserve the character's personal Sakuragaoka/Dobuita environment. Daytime rescue availability 08:30–23:30 and referral 08:30–19:00 are adaptations; no forced date, weather or 14:30 teleport. |
| Audio | Original E1049/F1060 voice assets; retain the normal zone music as an adaptation. Scene-specific soccer/strike sound effects are not yet reconstructed. |
| Interactive challenge | Three client-simulated fighters using existing movement, guard, hand/kick/throw controls and local health/hit calculations, followed by the closed-catalog client-timed A QTE. Health, speed, arena bounds and basic AI are authored balance, not the original free-battle engine. |
| Completion effects | One atomic rescue milestone plus `notebook.s1.gao-wen`; the separate talk atomically saves `notebook.s1.russiya-translator`. No reward, item consumption, calendar jump or guessed native flag. Temporary fight health does not change persistent MMO HP. |
| Exit behavior | Remain in the entered zone, restoring player pose, camera, controls and ambient NPC ownership. No public NPC mutation. |
| Skip, failure and replay | Ordinary advance only skips dialogue, not the fight/QTE. A lost fight retries the fight; a lost QTE retries the hostage attempt. Cancelled/failed aftermath saves no clue. Leaving and re-entering can retry; committed milestones do not replay or grant again. |

`tools/cutscenes/build_gao_wen_assets.mjs` hash-checks original KOJI PKS/PKF and
the full fighter MT5s, extracts their embedded textures, and registers the
existing character-loader assets. Its tracked manifest records model bindings,
source hashes and output hashes; it does not translate the native room owner.
Original `M_KOJI` clips drive Gao's held/release/talk and Ryo's soccer kick.
Other ordinary standing/combat motions reuse existing shared banks.

The real compiler/PostgreSQL boundary test proves prerequisites, possession,
hours, cancellation before and after victory, actual fight/QTE outcomes, retry
tokens, ignored stale input, atomic notebook writes, unchanged inventory/yen/HP,
repeat refusal and character isolation. `NEW_YOKOSUKA_GAO_E2E=true` continues
the earned Fuku/letter checkpoint through cancelled introduction/re-entry,
three-opponent loss/retry/win using physical movement/guard/kick inputs, failed
keyboard B input/retry, successful A input, full kick/aftermath, normal Dobuita
resident interaction, notebook and saved reload. Inspected rendered captures
show Gao/Charlie/Ryo, the hostage hold, ball and actual kick; complete original
projectile/finger/gesture fidelity is not claimed. Test travel is shortened,
and this is not proof of walking the original construction-lot route.

On 2026-11-08 a continuation from the separately earned Fuku/letter checkpoint
used the player-facing Sakuragaoka travel menu and reached the voiced rescue
introduction and three-opponent fight. It exposed a scenery-obscured authored
intro shot and a fight camera trapped against a fence; the intro camera was
reframed and shared fight setup now considers sightlines and target framing
once at encounter start. Rendered rechecks show the cast and a usable opening
fight view; other locations and all later fight positions are not certified.
The first automated player lost four retries. Correcting its lateral steering
and using normal down-kick and guard inputs then won on the fourth retry, failed
and retried the A QTE, saved the rescue and Gao's translator referral, and
verified the notebook and reload without changing persistent HP, yen or the
letter. Dialogue was advanced with Space and the test positioned Ryo beside
Gao for the referral; it does not establish a continuous walk to him. The
earned checkpoint itself had earlier seeded prerequisites. A separately
replayed aftermath exposed the same blocked camera as the introduction; a
presentation-only rendered replay confirms the reframed two-person shot.
The introduction still stages Charlie early and ambient pedestrians can enter
the shot; its road location and staging remain approximations.

The rendered check found and repaired two shared presentation omissions.
Guard/hit animation banks now follow the selected pose even when the independent
movement flag is true. Authored scenes and story combat also run the same native
cloth/hair post-pose update as gameplay; otherwise Ryo's acquired jacket surface
remained detached at the preceding pose during root travel. Motion-timed scenes
wait for the longest original clip rather than cutting the kick off at an
invented four-second hold. Ball controller 34 is the raised foot; controller 11
is a wrist and must not be described as a foot.

The new asset catalogs reproduce byte-for-byte through the canonical producers.
New model/voice assets are local and registered, not published to R2.
The telephone call, directory lookup and bus boarding are connected below;
subsequent harbor encounters remain unimplemented.

## Xia Xiu Yu translates the letter

Official import: `story-s1-xia-letter-translation`.
The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
(printed pages 28–29) establishes automatic entry, reversed writing, the letter's
contents and the next telephone objective. The existing TOKI package already
contains the complete original presentation; no new dialogue renderer, authored
replacement movie or native room-controller reconstruction is necessary.

| Field | Implementation |
| --- | --- |
| Location | Russiya China Shop, normal shared-world area `DRSA`. `TOKI` names the original cinematic resource, not another gameplay destination. |
| Prerequisites | Story Ryo, opening and Gao rescue complete, actual `chinese_letter` quantity at least one, translation not already saved. Gao's optional grandmother referral is not mandatory; players can find the shop directly. |
| Trigger | Automatic shop entry. Suppress alternative native ASDA story dialogue while the authored event is eligible; the server remains authoritative. |
| Player setup | Existing cinematic ownership locks movement and borrows Ryo/ASDA. Return hooks capture the normal shop arrival position, facing and camera before the scene. |
| Characters | Ryo and Xia Xiu Yu (`ASDA`, original `KAS_L`), using existing package/ambient actor ownership. The ordinary personal ASDA schedule begins at 08:30 and ends at 21:00; require the server's actual actor presence as well as that window. |
| Props | Original folding `MALS509G` letter, original attachment handovers, fold-node changes and KAS hand meshes/HM pose table through the existing shared adapters. No item is consumed or granted. |
| Action sequence | Original entry and greeting → Gao's grandmother thanks Ryo → present and decipher the letter → read its back/passwords and number → return the letter → restore ordinary gameplay. |
| Dialogue | All 41 original A0142B AUTH voice cues. The source archive SHA-256 is `34c9e3d2cda7f4cad2b7348dd4c1c5adb65421707b5d574595a25703d0097104`. |
| Timing | Original AUTH/body/camera/voice timeline, 5,355 frames (about 178.5 seconds). An explicit cinematic skip acknowledges presentation, not an interactive challenge result. |
| Camera shots | Original `TOKI/SEQDATA2` camera track. No new camera offsets or guessed scene duration. |
| Weather and lighting | Preserve the personal shop environment. Exact original incidental lighting is not required; no date, time or weather jump. |
| Audio | Original A0142B voices, A1_TOURA effect commands and the existing BGM050 package cue. Canonical audio regeneration reproduces all 57 voice/effect output hashes; only the producer's reorganized path changed in metadata. |
| Interactive challenge | None. The password phone call is the next event, not a QTE hidden in this movie. |
| Completion effects | One atomic translation milestone and `notebook.s1.translated-letter`, which unlocks two stable pages: letter contents/signature, then passwords/phone number. No currency, HP/XP, inventory, calendar or guessed native-bank write. |
| Exit behavior | Remain in `DRSA` at the ordinary arrival pose with previous camera and controls restored; release actor/prop ownership. |
| Skip, failure and replay | Natural completion or explicit cinematic skip saves the same outcome once. Cancellation, failed loading or cleanup saves nothing and permits re-entry. Stale acknowledgements cannot complete a newer run. Reload reads committed progress without replay or duplicate pages. |

The source manifest pins `SEQDATA2.BIN` to SHA-256
`507a20816d8a73a2a41700e90b4bc8e62e9a2b4dc4ad865cdfd9e555f459a38e`
and the normalized slot-zero install to pointers `0x34f7`/`0x3504`.
Existing builders retain exact motion, letter, hand and callback provenance.
The script activity forbids browser-owned durable effects and restores the
entry player state before the server accepts the presentation acknowledgement.

Real compiler/PostgreSQL tests extend the Chinese-letter chain through Gao's
required milestone, actual possession, ASDA absence, closing time, cancellation,
retry/stale acknowledgement, once-only notebook settlement, unchanged
economy/inventory/native snapshot and character isolation.

`NEW_YOKOSUKA_XIA_E2E=true` with the earned isolated Story checkpoint verifies
automatic entry, original voice playback, cancellation without settlement,
real door re-entry, the full natural ending, unchanged letter/yen/HP, both
notebook pages, restored arrival/camera/controls and reload without replay.
Inspected captures show Ryo, Xia and the original camera/subtitle sequence.
The letter attachment is enabled during the handover, but the sampled camera
views and subtitle panel obscure it; those captures do not establish the
letter's visible handover or complete finger/fold fidelity. No exact incidental
lighting claim is made. Travel is shortened near the shop's real doorway rather
than proving the entire walk from the previous event. Audio/assets and the
official import are verified locally, not published to production or R2.

An additional earned continuation (`NEW_YOKOSUKA_EARNED_XIA_E2E=true`) used
the normal Dobuita travel picker, walked from its arrival point along the
street to the shop, and clicked the actual door. A first test aimed at the
gap between the door leaves; the retried test walked the remaining distance
and clicked a visible leaf. The original voiced film then ran without skips,
both translated notebook pages and the completion survived reload, and the
letter, yen, HP, camera and controls were preserved. The test waited until
the next morning; earlier story prerequisites were seeded, and the walk was
split across the retry rather than one uninterrupted run. Sampled shots still
do not prove a visibly unobscured letter handover or every facial expression.

Door-entry testing exposed a registration gap, not a missing story bit. Ordinary
animated doors were given their verified physical destinations only when marked
`nativeStaticTransition`, a proxy-only flag. Known physical routes now attach
to ordinary placements too, using the same authoritative transition catalog and
access rules. This avoids sending a real shop entrance through unrelated legacy
dispatcher-number closed checks. The repeated-door-model test helper also uses
physical selectors rather than assuming filenames identify unique placements.

## Telephone passwords: Warehouse No. 8

Official imports: `story-s1-master-chen-phone-dobuita` and
`story-s1-master-chen-phone-home`. Both use the same reviewed Yarn template,
not separate quest logic. The original `E1032.AFS` provides the selected
subtitles/voices; its SHA-256 is
`d896882c41c36aa48881e806cf3932badc87563a99a5007b7ef511cbc82e7180`.
The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
(printed page 29) confirms both phones, reciprocal passwords and the warehouse
lead. Remote SRF voices have no actor tag: the subtitle role **Voice on
Telephone** is intentionally neutral, not a guessed character identity.

| Field | Implementation |
| --- | --- |
| Location | Dobuita tobacco-shop phone (`D000/TEL0`) or Hazuki foyer phone (`JOMO/TEL_`), at their original placed-object locations. |
| Prerequisites | Story Ryo, opening and Xia translation completed, actual `chinese_letter` possession, call milestone unfinished. |
| Trigger | Click the physical telephone. Use-only bounds validate server-accepted player presence; walking nearby never starts a call. |
| Player setup | Lock interaction/movement ownership, then stage Ryo beside the chosen phone after the player chooses the number. |
| Characters | Ryo only; the remote voice is not a physical NPC or a new scheduled actor. Other players' views are unchanged. |
| Props | Existing placed telephone. At home, the original TEL_ receiver is leased into Ryo's hand using the shared source-proven TELM binding and restored afterward; Dobuita's receiver is not yet wired. Pickup/dial/hangup choreography remains unreconstructed. |
| Action sequence | Choose the known number → original greeting → first password pair → second pair → warehouse lead; a wrong reply offers retry or leaving. |
| Dialogue | Fifteen original E1032 voice IDs, resolved against the pinned original archive. Native Yarn choices select actual replies. No fabricated original line IDs. |
| Timing | Voice completion or Space advances lines; choices wait for the player. Both pair orientations use server-owned random draws. No timer implies a successful answer. |
| Camera shots | Authored held shot for each real phone location, using the shared scene staging runtime. |
| Weather and lighting | Preserve the current personal environment; no forced date, season or weather. |
| Audio | Original selected E1032 voices through the shared voice manifest. Original dial-tone/coin sounds are not added or claimed. |
| Interactive challenge | Two real password choices, not a timed QTE: Heaven ↔ Nine Dragons, Earth ↔ Comrades. Wrong replies save no clue. |
| Completion effects | Atomically save `story.s1.master-chen-phone.completed` and `notebook.s1.warehouse-eight-phone`; one stable warehouse/directory lead page regardless of which phone was used. No guessed native flag, coin charge, HP change, item consumption or calendar jump. |
| Exit behavior | Restore the prior player pose/camera and controls in the same zone; no forced harbor travel. |
| Skip, failure and replay | Space cannot answer a password. Leaving, cancellation, loading failure or expiry saves no clue; retry is safe. Completion at one phone prevents duplicate completion at the other. Reload preserves the earned lead. |

The number-selection menu, held gesture/camera and free public call are explicit
prototype adaptations. This is not a reconstructed dial pad or complete original
telephone animation. The successful phone-book lookup is connected below;
travel to Amihama is connected below. `--voices --voice-route <route-id>` on the
investigation producer exports just the newly required voices while regenerating
the complete official catalog, avoiding repeated encoding of earlier chapters.

`NEW_YOKOSUKA_PHONE_E2E=true` resumes the genuinely earned Xia checkpoint in
the isolated database. It travels normally between the two zones but shortens
the approach near each physical phone, picks an actual visible surface, and
uses ordinary menu/keyboard responses rather than injecting success. The
check passed through cancellation, wrong answer/leaving, retry, the saved
warehouse notebook page, restored player ownership and reload. A completed
phone click does not invoke the native object fallback. Captures show Ryo and
the phone-choice interface; the Dobuita shot was adjusted out of a wall after
inspection. The then-white placed phone's missing source textures were fixed in
the subsequent directory check below. Complete handset animation is not claimed. Local original
voice files are registered and hash-checked, not published to R2.

An earned continuation exited Russiya through its actual door, then used the
normal fast-travel menu to Hazuki grounds after a direct Dobuita street walk
became stuck against an object. Ryo walked into the house, clicked its real
telephone, cancelled once, gave a wrong answer and retried, then gave the two
correct answers. The warehouse clue, original letter, HP and yen survived
reload. The dialog was advanced with Space and the earlier checkpoint had
seeded prerequisites. A later rendered inspection showed the original home
phone's receiver remained on the cradle while Ryo raised an empty hand. The
authored home staging now reuses the existing exact TELM receiver adapter with
the staged actor's current hand matrix and restores the original receiver on
finish/cancel. A presentation replay and a full call on a disposable copy of
the checkpoint verify the held receiver, restoration, retry and saved clue.
Reusing the JOMO binding with a different held animation is an adaptation;
native pickup, hangup, cord movement and the Dobuita phone remain unfinished.

## Telephone directory: Amihama

Official import: `story-s1-amihama-directory`. This borrows the successful
original `01TEL/SEQDATA0.AUTH` presentation, not the SA1071 unsuccessful lookup
used by the separate recovered room-owner activity. No native selector/room
controller is needed to decide this authored Story result.

| Field | Implementation |
| --- | --- |
| Location | Dobuita tobacco-shop counter, original physical `TBK1` directory. |
| Prerequisites | Story Ryo, opening complete, actual saved successful telephone-call milestone; directory milestone unfinished. |
| Trigger | Click the book, with accepted server presence inside its use-only proximity bounds. No automatic scene on approach. |
| Player setup | Existing native-cutscene ownership stages the original AUTH player pose; save the previous player position/facing/camera for return. |
| Characters | Ryo (`AKIR`) only. The merchant and other players remain in their shared world; this scene does not change their durable state. |
| Props | Borrow the world book, use the original opened `DENS502G` and AUTH.PKF textures. Reuse the recovered local attachment transforms, but bind the open book to this whole movie's right reading hand (control 18), not the standalone LOOK loop's left hand (control 12). This hand binding and open/closed cues at sound frames 59/189/856 are explicit adaptations, not recovered controller timing. |
| Action sequence | Original pickup/read/page-turn presentation → find prefix 61 → identify Amihama → return the book and restore gameplay. |
| Dialogue | Original `01TELA001`–`A003` voice/subtitle cues. No fabricated source line IDs. |
| Timing | Original AUTH 890-frame command track with its original movement/camera duration (about 30 seconds). No arbitrary success timer or interactive challenge. |
| Camera shots | Original AUTH camera track, rather than another manually staged shot. |
| Weather and lighting | Keep the current personal Dobuita environment, with no forced date/weather jump. |
| Audio | All three original voices and six unique original sound references from `A1_TELP.SND`. |
| Interactive challenge | None. The prior telephone passwords are the challenge; looking up the known prefix is a presentation. |
| Completion effects | Atomically save `story.s1.amihama-directory.completed` and `notebook.s1.amihama`; one stable harbor/bus lead page. No money, HP, inventory, calendar or guessed native-bank mutation. |
| Exit behavior | Stay in Dobuita at the previous arrival pose/camera with controls restored and the book returned to exploration. No forced harbor travel. |
| Skip, failure and replay | Natural completion or explicit cinematic skip saves the same outcome once. Cancellation/loading failure saves nothing; the same book remains reusable. Stale acknowledgements cannot settle a retry. A completed use declines without native fallback; reload retains the lead. |

Canonical producers are `build:phone-book-activity` and
`build:phone-book-audio`. The source AUTH.PKS SHA-256 is
`41a3323364259c806467b49be3cb7e1fdbf031517efb7b2e7c57527aed1e8b7c`;
the original 01TEL.AFS is
`211aab675b0b65ded671d7b5bda0d583fc5382061c4618ca0311522d3668b398`.
Source/output hashes and the prop-timing adaptation live in the generated
manifest. The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
(printed page 30) corroborates the lookup result and next bus objective.

Two shared boundaries are important: an NPC's invisible selection proxy must
not override a real hit on an interactive counter object, and borrowed props
must regain their original visibility/picking state when their presentation
owner releases them. Focused tests cover both. The real-browser continuation
(`NEW_YOKOSUKA_DIRECTORY_E2E=true`) verifies original voice playback,
cancellation/re-entry, natural completion, the notebook page, restored book
picking/player/controls, reload and completed-use decline. Captures were
inspected: the open book is textured and visible above the counter during the
reading shot. The initial standalone left-hand binding put it below the
counter; mesh-enabled/material assertions alone did not detect that failure.

An earned continuation (`NEW_YOKOSUKA_EARNED_DIRECTORY_E2E=true`) used the
Dobuita travel picker, walked to the tobacco shop and clicked the real book
from the counter edge. The walk stopped at an overly close test waypoint and
continued after reload; it was not an uninterrupted trip from Xia. Cancellation
saved no clue, then the original voiced reading finished naturally and the
Amihama notebook, unchanged letter/yen/HP, restored book and controls survived
reload. Earlier prerequisites were seeded. The rendered scene exposed a flat
white telephone: all five model texture IDs came from D000/OMG.PKF, while the
placement incorrectly used the map pack. The canonical
`tools/worlds/build_dobuita_object_textures.mjs` now extracts that original
pack and verifies all 11 OMG object models' texture references. The local
Dobuita bundle was rebuilt and a disposable checkpoint reran the full
directory event with the pink textured phone visible. Its new runtime pack and
scenery bundle are registered locally but not published to R2; they must be
published before deployment. The phone receiver is still not animated here.

The real server candidate-chain test also imports both directory scripts:
Story uses the authored event, while the legacy SA1071 lookup is now Free
roam-only. Passing a completed Story event cannot launch the legacy scene.
Assets/imports are local, not published to production or R2.

## Bus to New Yokosuka Harbor

Official import: `story-s1-harbor-bus`. The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
(printed pages 30–31) places this after identifying Amihama, before the first
harbor encounter with Goro. The original BUSS boarding presentation already
exists; this connects it to authored progression, not its native bus controller.

| Field | Implementation |
| --- | --- |
| Location | Existing Dobuita `BUS_` at the roadside bus stop near the tobacco shop. |
| Prerequisites | Story Ryo, opening complete, saved directory result; first harbor-arrival milestone unfinished. |
| Trigger | Click the visible bus inside a server-accepted boarding proximity region. |
| Player setup | Confirm boarding; the existing cinematic owner stages original Ryo and bus poses. |
| Characters | Ryo and the original bus-driver package actor. Other players are not moved. |
| Props | Existing world bus, with original moving-door cues. Borrowed visibility/picking/door state is restored on cancellation. |
| Action sequence | Board or stay → original boarding movie → save and load the shared harbor → original harbor arrival movie. |
| Dialogue | Authored confirmation labels; the chosen original boarding movie contains sound rather than spoken dialogue. |
| Timing | Original 325-frame BUSS variant A, then the 1,730-frame YBUSFLY variant D. No inferred timetable or pretend wait for a scheduled bus. |
| Camera shots | Original boarding and harbor arrival cameras. Exploration starts at the established browser bus destination. |
| Weather and lighting | Preserve personal date/time and current environment policy; no forced calendar or weather jump. |
| Audio | Original BUSS and YBUSFLY sound packs. No new voice lines or invented music. |
| Interactive challenge | Boarding confirmation, not a QTE. Staying leaves progression unchanged. |
| Completion effects | Atomically save `story.s1.harbor-arrival.completed`, an arrival-film pending flag, and the reviewed `mfsy` arrival pose. The film records its own completion only after playing or an explicit skip. No reward, fare, inventory or native-bank mutation. |
| Exit behavior | Shared New Yokosuka Harbor at `[130.5, 0, 140.6]`, yaw π, restored control. This spawn is an existing exploration adaptation, not an extracted original arrival shot. |
| Skip, failure and replay | Cancelled/failed boarding remains retryable. An interrupted arrival film retains its pending receipt and can retry at the harbor stop; completed or explicitly skipped films do not repeat. A loading failure retains the saved harbor location for reload. Old saves that already arrived do not acquire a new pending receipt. |

The arrival film uses the original camera, bus, actor trajectories, sound cues,
and recovered bus-door callbacks. The original owner chooses between multiple
arrival variants using a selector that has not yet been recovered; variant D
is an explicit approximation. One harbor worker's motion-bank binding is also
unresolved, so the worker uses the original walking motion already assigned to
that same worker later in the film instead of an unrelated incompatible motion.

The named `travel_story` effect uses the existing Yarn transaction, not a
second travel save. The reviewed destination catalog supplies server-owned
coordinates; the browser cannot select a replacement destination. Script
revision fencing rejects older periodic location flushes. The live connection
reserves its first arrival, rejects stale/foreign-room packets and publishes
the reviewed pose. Reconnect rejects an old room's first presence and restores
the location from the authoritative welcome. Mode switching preserves separate
Story and Free roam contexts.

The browser waits until the event's presentation releases ownership before
loading the committed destination. `entry:null` explicitly distinguishes a
browser-only transition from an exact original scene/area/entry request. Missing
fields on a claimed native transition still fail; no original entry number is
invented. Failed world loading cannot leave the world ready for gameplay.

`NEW_YOKOSUKA_BUS_E2E=true` resumes a directory checkpoint.
The test positions Ryo near the bus, then covers real bus picking, staying,
cancellation/re-entry, the complete boarding movie, saved location/flag/balance,
the automatic arrival movie, explicit skip, unlocked control and reload without
replay. The connected arrival test used an isolated character seeded with the
directory milestone; natural arrival playback and interrupted playback/retry
were also tested separately.

The later protected real-GPU continuation in `browser-bus-resumed-1.log`
closes the counter-to-bus navigation gap. Starting at an isolated phone/directory
checkpoint beside the tobacco counter, it uses ordinary keyboard walking and
camera steering around the original booth/wall collision endpoints to reach
an approach inside the unchanged client/server boarding bounds. The helper
records its starting directory state and any seeded predecessor scope; it does
not reset the player, directly travel or seed arrival receipts during this walk.
A real bus pick then covers staying, boarding cancellation, retry and natural
boarding. The automatic harbor film is cancelled, the page reloaded, and the
pending arrival is retried and allowed to finish naturally. Saved location,
arrival/pending/completed receipts, unchanged HP/yen/inventory, restored
controls and released actor ownership, and another reload without replay pass.
The run passed in about 3.3 minutes including the hardware-renderer check.
Earlier prerequisites remain seeded: this verifies the connected counter,
boarding and harbor sequence, not a fresh uninterrupted Story playthrough.
The earlier direct paths crossed original collision boundaries; no collision
removal or widened boarding region was needed to verify the walk.
Inspected captures show Ryo inside the original bus and the rendered harbor.
The test now waits for the loading cover to disappear: an earlier ready-only
check incorrectly passed while the loading UI displayed an error.

A further protected continuation on the same fresh character 5 passed in
`browser-earned-earned-bus-harbor-r2-04.log` (327.1 seconds including the
hardware-renderer check). Opening through the phone call had been earned;
directory, Amihama notebook and all bus/arrival receipts were initially unset.
The helper used the travel menu from the home interior to Dobuita, then ordinary
keyboard walking to the directory and the real TBK1 picker. Directory
cancellation, original voiced natural completion, notebook settlement and reload
passed before the bus walk. The actual departure was
`[-36.0351, 0.008876, 11.2381]`, about 2.14 metres from the first CMAL waypoint,
so that previously unaccepted first leg was included. The input attachment
records KeyW down/up on the canvas and 40 retained forward, unlocked movement
samples; one passes within 0.16 metres of CMAL. The walk reached
`[-44.8882, 0.003137, 8.4449]` inside the unchanged boarding bounds.

The same run passed staying, boarding cancellation/retry, natural boarding,
saved harbor/pending receipts, arrival-film cancellation/reload, natural arrival
completion and completed reload without replay. The final saved character is in
`mfsy` with unchanged HP 100/100, yen 2500 and `chinese_letter` quantity 1;
Goro completion is still unset. Both pending and completed film receipts remain
saved, with completed guarding replay. This extends the fresh earned
continuation while preserving the earlier isolated and explicit-skip evidence.
The home-to-Dobuita travel-menu shortcut and earlier helpers' shortened
approaches or supported skips remain limitations; it is not whole-route
completion or uninterrupted natural playback of every preceding stage.

Compiler/database tests cover proximity, cancellation, stale acknowledgements,
atomic settlement, late position writes and mode round trips. The PostgreSQL
race test confirms a location writer is blocked on the specific character row,
commits a newer destination/revision under that lock, then proves the writer
rechecks the revision after waking rather than using its older SQL snapshot.
An ordinary movement write at the current revision still succeeds. Live-hub tests
cover duplicate receipts and reserved/reconnected arrival fencing. Client tests
cover presentation-release ordering and failed load recovery. The broader
store suite has a legacy arcade-import fixture failure, reproduced using the
pre-change store code against the same isolated database; it is not weakened
or counted as passing. No changes are deployed or assets published.

## Goro's first harbor encounter

Official import: `story-s1-goro-harbor-encounter`. After the earned bus arrival,
approach the telephone booth in `MFSY`. The server checks the accepted player
position and saved arrival milestone before starting this private encounter.
Original E1046 dialogue identifies Goro (`GORO`) and Tetsuya Nagashima (`NGSM`)
as the blackmailers, and Hiroshi Murai (`MURI`) as their victim; a walkthrough's
ambiguous description must not reverse those roles.

The shared authored-scene player stages those original character models near
the extracted booth (`TBOX`, approximately `[119.20, 0, 121.75]`). Ten original
voice lines introduce the confrontation. The existing server challenge accepts
Left → A → B, matching the [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
(printed page 31). A wrong or late input allows retry or leaving, without a clue.
Successful input then plays the original MGQB paired winning clips and nine
original voice lines directing Ryo straight ahead and right toward Warehouse
No. 8. Only completing that presentation settles `story.s1.goro-harbor.completed`
and `notebook.s1.goro-directions`; no currency, HP, inventory, time or guessed
native flag is changed.

Cancellation releases staged actors, camera and controls and remains retryable,
including after a successful QTE but before the directions finish. Stale input
cannot settle another run. Reload retains the clue without replay; Free roam
and other characters' progress are unaffected.

`build:harbor-story-assets` verifies the original MGQB archive/member hashes and
selected complete motion records, preserving the full bank. The manifest records
source identity and adaptation boundaries. `build_story_investigation.mjs`
translates the reviewed Disc 2 dialogue into ordinary official Yarn and exports
only this route's nineteen voices when `--voice-route goro-harbor-encounter`
is supplied. Placement, cameras, held challenge poses and two-second input
windows are authored approximations; native DYNAMICS choreography is not claimed.

`NEW_YOKOSUKA_GORO_E2E=true` resumes an actually earned harbor checkpoint,
positions Ryo near the encounter, and walks into the approach region. It covers cancellation, wrong input/retry,
real timed success, rendered winning motion/directions, saved notebook,
restored controls and reload. Inspected captures show the original cast and
the paired throw rather than an invisible or air-hitting opponent. The backend
test uses the real Yarn compiler/PostgreSQL and proves that challenge success
alone cannot grant the clue. Audio starts in-browser; listening fidelity was
not assessed. Assets/imports remain local, not published or deployed.

## New Warehouse No. 8: refusal, window and invoice

The official Story routes cover both entrances, the optional desk inspections and the shared office conversation.

| Event | Trigger and result |
| --- | --- |
| `story-s1-warehouse-eight-refusal` | Approach the original `OTC8` shutter after Goro's directions. Shozo Kuga (`KEBG/KVG_L`) turns Ryo away in five SA1035 lines. Completing the conversation saves the alternative-entrance notebook page. |
| `story-s1-warehouse-eight-window` | Approach the rear after the refusal. Ryo voices E1009BA001 and can leave or climb. The MBUI climbing motion leads to the original upstairs `MS8S/0` arrival. |
| `story-s1-warehouse-invoice-address` and `story-s1-warehouse-invoice-label` | Pick either original FUT envelope on the office desks. Completing the FUT0 address line changes Ryo's response to FUT1 for the rest of this visit. |
| `story-s1-warehouse-eight-overheard` and `story-s1-warehouse-eight-office` | Walk to the upper corridor listening point from the rear window or Goro's ground-floor entrance. The ten-line workers' exchange ends with the shared clue, native bit 242 and travel to `MFSY/5`. |

The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
(printed pages 31–33) establishes refusal → rear crates/window → overheard
conversation. SA1035's original speaker tag identifies the refusing guard;
E1009B identifies workers `TMHN` and `TKSA`. Neither requires copying
their ambient schedules into a new story controller.

`build:harbor-story-assets` verifies the original MBUI archive/member hashes
and complete `AKI_HAIRU_MADO_SOUKO_0153` clip, retaining its motion bank. The
entering pose uses the original MFSY return entry 5 `[-18.5,3.6,153.6]`, with
facing reversed to enter. The `8MAD` object's origin lies between two separated
windows: it is not a valid climb alignment. A first rendered pass exposed that
mistake; the corrected capture shows Ryo climbing through the actual window.
The destination is the original MS8S default CHRS player placement at
`[-17,4.275,152.24]`, already used by the ordinary exploration door route.

The rear-entry choice condenses the original crate mechanics. Inside Warehouse No. 8, Ryo can open the office door and inspect either desk. Walking to the upstairs listening position at the original bearing starts the conversation from the player's camera. Ryo takes two seconds to reach the wall in Story, and players advance the dialogue.

Two counters also give players who miss that spot a way to find the scene from either entrance. After 14,401 active controller ticks, Ryo notices the upstairs light if his height is at most four metres. Above four metres, the same timer takes him straight to the office conversation. After 28,801 room ticks, the conversation can begin on either floor even if Ryo has stood still. The light hint plays E1009BA018 and leaves the clue available. Both timed ways into the conversation use the alternate camera 1101 entrance, followed by the same ten lines and the MFSY/5 return. The native notes and remaining presentation gaps are in the [warehouse reconstruction](story-goro-guard.md#upstairs-office-from-either-entrance).

Walking through the downstairs search area can also prompt Ryo to say he found nothing. Two smaller areas upstairs prompt him to comment on the lack of clues and to recognize an office. All three use the existing gameplay camera and Ryo's original standing motion. Each can finish once per visit. Hearing the upstairs-light hint first suppresses the downstairs search line. Finding nothing downstairs still permits the later light hint. A Radeon run walked from the window entrance, opened both upper door meshes and played both lines in place. The named door stayed inside MS8S while the investigation was active. See the [warehouse inspection runs](../../tools/evidence/warehouse-inspections-hardware-2026-11-25.json).

The real Yarn compiler and Go event tests exercise both entrance receipts, the spatial gate, cancellation, all ten lines, the shared clue and the terminal travel. The Radeon runs exercise the original climb, keyboard movement, mesh picks, room reset, Goro's film, worker poses and cameras, and the saved harbor exit after both routes. The full-duration downstairs run held W through the original timer. Shortened runs checked the idle deadline and alternate upstairs approach. The upstairs run measured Ryo's eye movement and reaction, played all ten recordings, and saved the harbor return. See the [entrance and invoice runs](../../tools/evidence/story-cutscene-warehouse-invoices-2026-11-25.json) and [timed warehouse runs](../../tools/evidence/warehouse-timed-director-hardware-2026-11-25.json).

## Old Warehouse District: daytime warning and nighttime access

`story-s1-old-district-day-gate` is optional advice after the warehouse-invoice
clue. Approach the compound during personal hours 08:30–19:00: original SA1039
voices identify guard Yasutomo Miyagi (`KEBB/KVB_L`), refuse access and suggest
returning at night. Original guard conversation motion accompanies authored
poses/camera near MFSY return entry 1. Completion saves the nighttime notebook
lead once. No daytime-advice flag is required to enter at night.

At 19:00–24:00, the same approach selects `story-s1-old-district-night-entry`.
The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
(printed pages 33–34) establishes the nighttime head-bump/flashlight Right QTE
before guard avoidance. The event reuses original E1008A010, complete MKSG
`M_0153.MOTN` head-bump and flashlight-taking clips, original `KAIS500G.CHRM`
and EVENT textures. If the window expires without a Right input, Ryo misses
and the player can retry or leave.
Right input within the window must still finish the catch presentation before the
ordinary Yarn transaction saves entry, notebook and destination together.
Cancelling after winning therefore cannot move the player or save arrival.

The destination is original MKSG CHRS default entry 0 `[17,0,-15]`, recorded
at MAPINFO `0x3d958`; source SHA-256 is
`8c26c6de22132f8b42a450b31fb3ad4f0a954948e794419319528ac63ce790ae`.
An initial rendered check exposed entry 2 `[67,0,-4.6]` facing the closed
compound exit. That legitimate source entry is not the right authored starting
point. Choosing the original interior CHRS placement is an adaptation, not a
claim that the native flashlight owner's exact travel was reconstructed.

The original MKSG director starts Ryo’s head-bump motion at source frame 133
and releases the flashlight at frame 380. Its coroutine `0x209dc` reads KCDT
from `EVENT.PKS/DYNAMICS.DYNM`. Each of its six channels has 81 keys over
frames 0–160. The original engine samples between keys, converts angles to
fixed turns and the room scales the position deltas by ten. The Right prompt
opens fourteen ticks after release. The room reads the input mask at
`0x2256e`, remembers Right at `0x225c8`, and checks for that press at tick
30 at `0x225d4`. An earlier press in another direction leaves time to
correct it. The client times the window and the server settles the result.

On success, the light continues in world space during Ryo’s reaching motion.
Fourteen ticks later, it transfers to his right wrist, control 18, using the
translation and three fixed-turn angles from the original FIXO call at
`0x215ea`. Ryo then plays the successful escape. When the window
expires without a Right press, the light finishes its fall near the floor. Ryo reaches,
misses and plays the original failed escape before the Story retry choices.

MKSG loads `E1KAIQTE.SND` in sound slot 4 at `0x3dd34`. Ryo plays track 1
at head-bump frame 360. The prop plays track 2 when released at frame 380.
A missed reach plays track 3 at its frame 75. A successful reach plays track
4 at the wrist handoff and track 5 at catch frame 92. The browser plays these
five renders on the Effects channel. They come from the Disc 2 AICA driver
running the original sequence commands. Rebuild them with
`npm run build:old-district-flashlight-audio`. The gate motions and prop
curves rebuild with `npm run build:harbor-story-assets`.

Story places this choreography at its existing harbor gate and uses the
authored close-up there. The flight carries one horizontal stage offset to
meet the player rig’s grip. Its sampled height and six motion curves come
from the original. The first alignment check put the rendered mesh centres
52 centimetres apart at the handoff. The two final Radeon runs measured 5.8
and 5.6 centimetres. The runs delayed selected server responses by 320 ms
and retained the staged camera and one visible flashlight through all 3,022
rendered frames. The first played all five world effects through their
natural ends, saved entry and reloaded the four-person patrol. The second
timed out with no input, retried, accepted a late Right after a wrong press,
and cancelled with the light in Ryo’s hand. Both active catch effects
stopped and the player regained control in the harbor. The source guard-station set, guard actions and full camera
and sound direction remain separate presentation work. See the
[flashlight hardware runs](../../tools/evidence/old-district-flashlight-hardware-2026-11-25.json).

Shared region dispatch now observes the actual personal game date, not the
debug lighting clock. An ineligible region does not consume its entry latch:
waiting at the same gate until 19:00 can start the night scene. The generator
rejects disagreements between these dispatch hours and authoritative Yarn
hours. Unit tests cover missing clock, exact boundaries, overnight windows,
re-entry and malformed metadata. The server still independently checks time
and accepted position; client scheduling is not authorization.

`NEW_YOKOSUKA_OLD_DISTRICT_E2E=true` resumes the genuinely earned invoice clue.
It uses test travel and positions Ryo near the gate rather than walking from the
warehouse. It verifies the original daytime cast/voice, cancellation/re-entry, real waiting
without another approach, wrong direction/retry, real Right input, original
motion, saved compound load, supported floor and the automatic ready-stealth
handoff after entry and reload without replay. `TestHarborWarehouseInvestigationAndNighttimeEntry` extends the
connected real compiler/PostgreSQL test through both gate variants, including
stale/cancelled acknowledgements, personal-hour boundaries and atomic arrival.
Night access is explicitly **not** stealth or Master Chen completion.

`build:harbor-story-assets` replaces the two smaller harbor exporters with one
pinned-source extraction path for all three banks and the flashlight. Existing
Goro/window motion bytes are unchanged; manifests record the shared producer.
Audio starts in-browser; listening fidelity was not assessed. No deployment or
R2 publication is performed.

The fresh character’s `harbor-r2-07` attempt earned the daytime advice,
wrong/correct QTE and compound entry before an obsolete idle assertion failed: the
automatic stealth challenge was already ready. `harbor-r3-01` resumed those
receipts without repeating the gate or changing the clock. It required the exact
`story-s1-old-district-stealth` owner, ready navigation and original four actor
tags before and after reload, while stealth and Chen receipts remained unset.
Ordinary exploration movement is correctly locked while that challenge owns
input. The subsequent `harbor-r3-02` patrol check passed cancellation/reload,
keyboard movement, cover, sprint and door use, then verified unlocked exploration
in MS08 and the saved result after reload. Together these retained reports
extend the same fresh save; they do not claim a second fresh gate replay or
original patrol fidelity.

### Connected guard avoidance

`story-s1-old-district-stealth` automatically continues an earned MKSG entry.
It extends the existing `start_challenge`/Yarn result boundary with a navigation
kind, not a second quest/save engine. The server owns movement, wall collision,
patrol phase, vision and door-use success. The browser supplies sequenced
movement/hide/sprint/use intents and renders private actor snapshots through
the same cinematic ownership used by Story combat.
Frequent input remains ephemeral; durable lease renewal is bounded to once per
second and tracing records the terminal outcome, not every movement snapshot.

Original MKSG MAPINFO has one COLI field (`0000`) containing 113 records: 98
code-0, seven code-9 and eight code-100 door records. Reuse the current parser
and browser-coordinate projection compile 406 static wall segments. The producer
pins the MAPINFO hash and rejects patrol routes crossing those walls. Run
`NEW_YOKOSUKA_SERVER_DIR=/path/to/server npm run build:story-navigation`, then
`scripts/check-server-contract.mjs --sync-scripting` to export the authoritative
catalog to the client. Original model identities are KEBB/KVB_L, KEBC/KVC_L and
KEBD/KVD_L; the collected flashlight uses the existing attachment loader.

Three ping-pong patrol paths, 2D vision cones, movement speeds and detection
balance are declared adaptations in `tools/scripting/story-navigation.json`.
Hiding is stationary beside an actual wall and reduces visibility distance;
it is not invisibility. There is no reconstructed native guard AI, escort
controller, flashlight beam or guard lip animation. Authored shots keep the
actors and camera in the clear corridor; they are not original camera tracks.

Only reaching and using the original Warehouse No.8 door position settles
`story.s1.old-district-stealth.completed` and the original MS08 CHRS entry 0
([26.5, 0, -2.3], native facing 310 degrees). Capture plays original E1006E009,
increments the existing named capture counter, advances the personal calendar
to the next morning and returns to MFSY's gate, clearing compound admission.
The flashlight milestone remains saved, so an earned flashlight catch is not
repeated on the next attempt. This retry rule is an authored simplification.
Cancellation, missing input/timeout and stale tokens do not win or charge a
capture penalty. All effects use the existing atomic Yarn settlement.

Connected real-browser checks walk the route using keyboard intent, crouch at
cover, use the real door, restore control and reload the saved warehouse. A
second check deliberately crosses a guard's sightline, verifies next-day gate
recovery, waits through the Story UI, re-enters and completes the route. The
isolated test fixture rewinds only this new milestone from an actually earned
compound checkpoint; it does not fabricate the earlier storyline or a win.
Screenshots are inspected separately from state assertions; audio starts but
listening fidelity is not claimed. Compiler/PostgreSQL checks also prove
interruption/cancellation, actual capture, replay fencing and per-character
isolation. Master Chen remains a separate subsequent event. No R2 publication
or deployment is performed.

## Master Chen's first meeting

Official import: `story-s1-master-chen-first-meeting`. The
[contemporary GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed page 35, describes the plate disturbance, meeting with Chen and Gui
Zhang, the Phoenix Mirror lead, and next-day 08:30 home return. Original A0154
dialogue corroborates the letter, Lan Di/Chi You Men and second-mirror beats.

| Field | Authored integration |
| --- | --- |
| Location / trigger | MS08, Old Warehouse No.8. Approach the shelves near original AUTH Ryo position [19.327665,0,-11.409147]. A proximity volume offers Inspect the plate / Leave it for now. This confirmation adapts the original A-button plate interaction, not its native object controller. |
| Prerequisites / setup | Personal Story Ryo, completed opening, earned patrol/door-use milestone and actual Chinese Letter possession. No exact weather/minute gate or externally shared story time. Borrow the cinematic camera/actors and lock ordinary interactions. |
| Actors / props | Original AKIR, TAIJ and KISY body motions/models; suppress ambient duplicates through shared ownership. Original NSR02YKG small dish follows SARA's AUTH movement. That model binding is an explicit approximation. Original MALS507 letter uses authored right-hand presentation/handover cues, not recovered callback transforms. |
| Sequence / timing | Play original SEQDATA0 (plate), 6 (arrival/letter), 1 (Lan Di), then 3 (Phoenix Mirror), each through the existing original activity runtime. Durations are approximately 4.68, 78.68, 44.02 and 61.02 seconds. Wait for each activity's real terminal cleanup before acknowledging it. The enclosing Yarn run owns the progression, not animation playback. |
| Dialogue / audio | Original A0154 voices, subtitles and AUTH timing; no replacement dialogue or invented IDs. The package renders 46 distinct voices and twelve SFX. Four exact incidental references are explicitly unavailable in the MS08-requested A1_CHIDE bank (switch, cloth turn, footstep and letter-pocket); no substitute audio. Music and detailed native hand/face callbacks are not reconstructed here. |
| Camera / weather | Original AUTH camera/movement tracks in the existing warehouse rendering, with personal season/weather preserved. No fabricated original camera IDs, new renderer, force-weather schedule or exact particle recreation. |
| Challenge | None: investigation/cinematic presentation after successful stealth, not a movie-completion combat win or QTE. |
| Effects / exit | Save `story.s1.master-chen.completed`, two stable notebook pages about Chen and the Phoenix Mirror search, next personal morning at 08:30 and the established Story bedside arrival together. No currency, mirror, letter duplication, guessed native flag or unrelated quest completion. |
| Skip / failure / replay | Leave declines without effects. Explicit cinematic skip advances through the same presentation sequence; cancellation, failed preparation, disconnection and stale callbacks do not settle partial progress. Completed meeting does not replay; reconnect loads the committed calendar/location/notebook. |

`build:harbor-meeting` uses the shared original activity/audio compilers. It pins
the entire MS08.PKS, texture pack, MAPINFO bindings and A0154 stream, then
validates the four AUTH structures and every resolved motion. Slots are
AUTH-extension ordinals with original filename/resource literals; authored
selection is not a claim of recovered room-owner branching. Generated manifests
record the source bytes and explicit unavailable audio. Raw outputs remain
ignored and registered through the runtime-asset publisher; no R2 upload is
performed during local Story implementation. Set `VGMSTREAM_CLI`, `DTPK_DUMP`
and a Python 3.12 `DTPK_PYTHON` for the existing audio toolchain, and use
`TMPDIR=/var/tmp` for local generation.

Compiler/PostgreSQL checks exercise missing prerequisites, outside bounds,
decline, cancellation after each earlier segment, stale acknowledgements,
ordered activity acknowledgements, combined calendar/home/notebook settlement
and replay fencing. These do not prove visuals. The connected browser check
resumes the actually earned MS08 checkpoint, approaches the plate, declines,
cancels a live presentation, completes the four segments naturally, and checks
home return/reload. That connected rendered check passes; its screenshots show
Chen and Gui Zhang in the original warehouse shots. Detailed hand/face fidelity
and listening fidelity are not claimed.

## Family lead to the antique shop

Official imports: `story-s1-ine-fuku-looking` (optional ordinary talk) and
`story-s1-family-mirror-lead` (courtyard approach). The
[contemporary GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed page 36, places Ine-san's hint before Fuku's confession by the tree and
the automatic conversation about the antique shop. The hint is not an invented
mandatory gate.

| Field | Authored integration |
| --- | --- |
| Location / trigger | Talk to the actual Ine-san in JOMO; then approach the courtyard tree in JHD0. The authored volume surrounds original SORA0 Ryo [-3.086535,0,-23.527935]. |
| Prerequisites | Personal Story Ryo, completed opening and earned first Chen meeting. No forced minute, weather or public-world date. |
| Actors / presentation | Original AKIR/FUKU SORA0 and SORA1, followed by AKIR/INE_ INEK. INEK's original positions place her on the exterior porch, not in the house. Shared cinematic ownership suppresses ambient duplicates. |
| Sequence / audio | Original bodies, cameras, voice/subtitle timing and sounds: approximately 9, 54 and 82 seconds. Reuse the MAPINFO-associated BGM085/BGM077 tracks; starting the music with each package is an authored timing approximation. |
| Optional hint | Original HUMANS F1005B062, F1005A054 and F1005B067, condensed without repeating equivalent lines. Saves a notebook hint only after ordinary conversation completion and stops being offered after the family scene. |
| Outcome | Atomically save the family milestone and antique-shop notebook clue. No item, currency, mirror, guessed native flag or calendar change. |
| Exit / retry | Restore the player's approach position and controls after the sequence. This adapts the original automatic porch relocation. Cancellation or failed preparation saves nothing and remains retryable; stale acknowledgements cannot finish a cancelled run. A completed scene does not replay. |

`build:hazuki-mirror-search` uses the shared original activity/audio compilers.
It pins Disc 2 JHD0 MAPINFO, SORA/INEK archives, 01SOR/01MIR streams and their
A1_FUKAY/A1_INEKO soundbanks. The AUTH-extension ordinals are borrowed directly,
with explicitly zero native pointer bindings; native-owner branching is not
claimed. Generated source receipts record exact archive and member hashes.
Forty original voices and fourteen SFX are available. The additional INEK cue
`01MIRA006.str` is absent from both the source AFS and IDX; its timing is retained
without substitute speech. BGM077 reuses the existing hash-pinned viewer render.
Raw assets stay ignored and locally registered; no R2 publication is performed.

The real compiler/database check continues the earned Chen character through
this event, testing accepted bounds, cancellation at every segment, stale
acknowledgements, exact scene order, once-only settlement and unchanged
calendar/location/economy. Another character without the Chen milestone is
rejected and does not receive the outcome. The connected browser check resumes
the earned home checkpoint, clicks the actual Ine-san, crosses the courtyard
approach, cancels/retries, completes all three scenes naturally, moves Ryo after
cleanup and reloads without replay. That rendered check passes; inspected
screenshots show Fuku by the tree and Ine-san on the porch.

The fresh continuation `route-r1-01` naturally finished this family sequence
and saved its lead before a post-film movement assertion recorded zero
displacement. The controller was idle/unlocked and no extra scene or notebook
was open, but the failed capture did not record effective gameplay input or
native presentation ownership. Its immediate cleanup cause remains unresolved.
`family-r2-01` resumed the earned exterior checkpoint without replay or position
reset. It recorded real forward input in the gameplay action snapshot and
0.359642 metres of both collider and actor movement, then verified unchanged
HP, yen and inventory, saved receipts and reload without replay. The helper now
waits for native presentation ownership as well as the movement lock to clear
and retains bounded focus/input/position evidence. That resumed success is
separate from proof of the original immediate post-cinematic cleanup.

## Bunkado sword handguard

Official import: `story-s1-bunkado-handguard`. The
[contemporary GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed page 37, describes the automatic shop conversation, Oishi-san's
handover and the family inheritance clue. Original A0132 dialogue corroborates
the safekeeping, eighteenth-birthday inheritance and Phoenix Mirror question.

| Field | Authored integration |
| --- | --- |
| Location / trigger | Enter DKTY through Bunkado's real Dobuita door. Physical door selector 35 is bound by the exact return to D000 Entry 7. The direct table's dispatchValue 25 is a different script-argument namespace and must not replace that physical association. |
| Prerequisites | Personal Story Ryo, completed opening and earned family antique-shop lead. Use ordinary shop entry; no invented weather/date gate or public NPC mutation. |
| Actors / props | Original AKIR and package-owned OISI/KOT_L. Original CHRT bindings identify TUBA/TUB0210G, HAKO/HOHS502G and TOKE/TOKT203G (mantel clock, not the previously guessed RABK201G book). Source-timed grips reuse these same AUTH objects: clock in Oishi-san's hands at frames 910–1130; box/handguard at 1630; handguard transferred to Ryo at 2760. Both actors use original detailed hands and compiled pose/component cues. Box-lid/node motion and two animated hand requests remain unimplemented. |
| Sequence / timing | Original TUBA SEQDATA1 arrival/handover (~98 s), SEQDATA2 remembrance (~20 s), then SEQDATA4 Phoenix Mirror question (~32 s). The childhood flashback is omitted. Original camera/body tracks, A0132 voices and A1_KOTTO sounds; MAPINFO-associated BGM052 starts with the package as an authored timing approximation. |
| Effects | Atomically grant one non-stackable, non-usable sword_handguard, save the handover milestone and add the notebook page. Presentation props alone are not inventory ownership. No money, time, destination, persistent HP or Phoenix Mirror reward. |
| Exit / retry | Shared presentation cleanup restores the shop arrival, avatar/camera and controls. Explicit skip may advance a scene; cancelling or failed preparation grants nothing. Last scene acknowledgement commits item and flags together; there is no separately cancellable post-completion grant stage. Reconnect loads the saved possession without replay or duplication. |

`build:bunkado-handguard` pins original TUBA.PKS, TUBA.PKF, DKTY MAPINFO,
MPK00.PKS/PKF, A0132.AFS and A1_KOTTO.SND. It uses the shared activity,
hand-pose/grip, audio and texture compilers and existing hash-pinned BGM052
viewer render. Twenty-two source voices and fourteen sound identities are
available. The retained [callback IR](../../tools/evidence/bunkado-handguard-callback-ir.json)
records owner `0x23ac8` calling `0x18da8`, `0x19edc` and `0x187d4` for
slots 0/1/2, bound to original AUTH ordinals 1/2/4. These are finite compiled
presentation cues, not a runtime native-script interpreter or proof of every
original story gate. Explicit zero pointer bindings remain. Generated receipts
retain archive/member hashes. Assets are locally registered, not published to R2.

The original `MHND` setup also recovers the wrist component; the shared guard
analysis admits a non-playing branch only when it returns without visual state
changes (audio cleanup is allowed). Unknown visual branches fail extraction.
The producer now rejects incomplete hand-texture metadata, and the all-package
presentation audit checks hand models, rigs and textures as well as faces/audio.
Oishi-san's original simpler mouth controller is retained; rendered speech
deformation works without adding an invented detailed facial rig.

Remaining limits: original `HMOT_SYG` requests at `0x195f0`/`0x198ea`, HAKO
node animation and the separate FUTA lid are not compiled; dynamic gaze and
the childhood flashback are omitted. Not every finger contact or expression
has been verified, and the existing package-start music timing is approximate.

Migration `009_story_mirror_items.sql` adds the handguard to the existing
inventory/economy store. Inventory and Collection now share one cancellable
server-inventory request, selecting ordinary items or capsule toys respectively.
Unknown artwork displays the real item name rather than invented art; available
icons use the existing transparent grey-slot presentation. The modal keeps its
scrolling, focus and close behavior.

Compiler/PostgreSQL checks continue the earned family character, reject an
unearned character, cancel each live scene, reject stale acknowledgements,
verify original scene order, atomic item/notebook settlement and repeat
refusal without changing the calendar/economy. The connected browser check
resumes the earned family clue, uses the real physical shop door from the
original exterior return placement, cancels/re-enters, completes all three
scenes naturally, checks actual inventory artwork/names and controls, then
reloads without replay or duplication. This check passes. Inspected shots show
Oishi-san, the handguard and the owned inventory; detailed finger fidelity is
not claimed. A saved unfinished shop arrival is allowed to start its automatic
event rather than being interrupted by artificial test travel.

The 2026-10-23 presentation recheck completes all three clips naturally and
cancels/replays the arrival, checking unchanged saved state and restored
avatar/camera/controls. All 22 original voice IDs play and both mouths deform.
Reviewed captures show Oishi-san holding the correct clock and Ryo holding the
transferred handguard. A separate connected browser recheck passes real-door
re-entry, no early grant, once-only item/notebook settlement, inventory display,
controls and reload without replay. This latest fixture explicitly seeds the
earlier family clue and Chinese Letter: it verifies Bunkado's boundary, not a
new end-to-end playthrough earning those prerequisites. The 109-package wiring
audit has no missing face, hand or audio assets; that is not visual sign-off for
the other packages.

## Gui Zhang's street encounter

Official import: `story-s1-gui-zhang-street`. The
[contemporary GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed page 37, places the encounter on the way home after Bunkado. It describes
a brief fight that cannot be lost, Gui Zhang's explanation and a rooftop
eavesdropper. Original KSBT cast, movements, cameras and A0167 voices corroborate
the presentation; the authored Yarn event owns its progression.

| Field | Authored integration |
| --- | --- |
| Location / trigger | Enter `s1.jd00.gui-zhang-street` in Sakuragaoka, near the original introduction's Ryo anchor. The approach volume is authored. |
| Prerequisites | Personal Story Ryo, completed opening, earned Bunkado handover and actual sword_handguard possession. No guessed public-calendar or weather gate. |
| Actors / props | Original AKIR, KISY / KIS_M (Chen Gui Zhang), and CHAI / CHA_M. Package-owned actors use the existing HUMANS models; they do not become shared street NPCs. |
| Sequence / timing | KSBT SEQDATA0 (~32 s), thirty seconds of actual client-timed nonlethal fighting, then SEQDATA1 (~69 s). Shared combat moves/basic AI are adaptations. Original final voice and rooftop camera show Chai; a movie acknowledgement cannot substitute for the fight. |
| Effects | Atomically save the encounter milestone and bodyguard notebook page. No item, yen, persistent HP/XP, calendar or destination change. |
| Exit / retry | Cancelled or interrupted attempts remain retryable; cancelled presentations grant no clue. Shared cleanup restores avatar, location, camera and controls. Committed reload does not replay the encounter. |

`build:gui-zhang-encounter` pins KSBT.PKS, JD00 MAPINFO, A0167.AFS,
A1_TAIKE.SND and A1_BDYGD.SND. The shared producers recover both AUTH members,
M_0167.MOTN, eighteen voices and eighteen sound identities. MAPINFO-associated
BGM116 / BGM024 reuse existing hash-pinned viewer renders; starting and looping
them with each scene is an authored timing choice. Borrowed AUTH ordinals have
explicit zero pointer bindings, not a claim of native-owner reconstruction.
Local runtime registration is complete; these assets are not published to R2.
Detailed hands, facial/cloth fidelity and exact battle choreography are not
claimed.

Compiler/PostgreSQL checks cover missing milestone/item, bounds, cancelled
introduction and combat, interrupted input, fresh retry tokens, stale readiness
and scene acknowledgements, cross-character isolation, once-only completion
and unchanged inventory/calendar/economy. The connected browser check continues
the earned handguard save, uses test travel and nearby positioning, walks into
the region, cancels/re-enters, sends real combat inputs, naturally finishes the
original explanation, then reloads the saved clue. A retry skips the repeated
introduction. Inspected shots show Gui Zhang and rooftop Chai. When no clear
opening angle keeps the opponent framed, the shared combat camera now prefers
an on-screen view over a longer view facing away. The debug panel crowds the
right edge and a nearby railing can intrude into the foreground in this narrow
street; these are not fully solved. Subsequent orbit remains under
player control. Region occupancy stays latched while presentation owns the avatar.

## Return-home handguard and family crest

Official imports: `story-s1-fuku-handguard-home` and
`story-s1-ine-family-crest`. The
[contemporary GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed page 37, places Fuku's referral on returning home and the crest
explanation in the altar room. Original FUKU HUMANS dialogue and A01136
corroborate both clues.

| Field | Authored integration |
| --- | --- |
| Location / prerequisites | Fuku's automatic JOMO return-home conversation requires the earned Gui Zhang milestone and actual handguard. After its completion, entering the authored altar-room volume near original A01136 Ryo's position starts Ine-san's explanation. |
| Actors / sequence | Private Fuku / Ryo foyer tableau with six original voiced lines, then original embedded JOMO AUTH at 0xb1d84 with AKIR / INE_. Fuku's staging borrows the original A0169 foyer poses at 35 seconds; held gestures and a close-up on the foyer side of the closed bedroom door are adaptations. Ine-san uses original body/camera tracks and M_01136.MOTN bank 17. |
| Timing / environment | Ordinary dialogue advances through the shared controls. Original crest presentation lasts about 53 seconds. Preserve personal date/weather; BGM077 starts with the crest scene as an authored timing choice. No QTE or combat. |
| Props / fidelity | Actual saved handguard possession gates both events. The family film uses the original JOMO TUB0210G.MT5 with embedded textures, original detailed YKB/INE hands and rigs, fourteen original hand-pose cues and eighty-three component cues. Original callback grip transfers and eight visibility flags are compiled as data. Initial visibility and the standalone tabletop interval at frames 325–395 are explicit browser adaptations; other detached intervals stay hidden. Fuku's separate foyer staging and cinematic sliding-door changes remain unreconstructed. A1_BUTU contains tracks 0–5; the AUTH's two door sounds reference absent tracks 6/7 and remain explicitly unavailable. Eight original voices and six other sound identities are recovered. |
| Effects / recovery | Each event independently commits one milestone and notebook page through Yarn. No item, currency, HP, calendar, destination or guessed native-state change. Cancellation/failed preparation grants nothing; cleanup restores the player's approach, avatar, camera and controls. Committed events do not replay on reload. |

`build:handguard-family` pins JOMO MAPINFO, COMMON02.PKS / M_01136,
A01136.AFS, A1_BUTU.SND, the loose JOMO `TUB0210G.MT5`, and six detailed
hand/rig files from Disc 2 `MODEL/HAND`. The prop is 45,548 bytes and is not
byte-identical to the antique shop's `TUB0210G.CHRM`; its original embedded
textures travel with this model. Presentation-only generation also updates the
runtime registry, so the checked-in manifest does not stand in for missing
binary outputs. The existing producers retain exact source/member receipts;
local registration does not publish assets.

The retained `tools/evidence/family-crest-callback-ir.json` identifies JOMO map
entry `0x88b70`, owner `0x6e62c`, and child callback `0x6f234`. The owner requests
`$TUB0210G.MT5` at string offset `0x9a094`, launches that callback, and starts
native ASEQ slot 15; the standalone package uses slot 0 and the exact activity
ID `01136/CREST.AUTH`. The shared extractors compile fourteen hand poses,
eighty-three hand-component cues, twelve FIXO attachment/reset operations,
and eight original visibility changes. Same-frame reset/install pairs collapse
to their final owner, producing eight runtime attachment cues without a second
prop. Ryo first holds the handguard at frame 210, Ine-san receives it at 396,
switches hands at 572 and 865, returns it at 898, and Ryo adjusts his grip at
1098 before detaching it at 1410. Native hidden intervals remain hidden even
when an attachment is active.

The original vector initializer adds components for flag `0x38000000`; the
FIXO reset evidence proves cleared fields, but not the entire native render
propagation into a released object's world pose. Therefore the builder retains
the raw vector operations and explicitly interprets their operands as an
absolute tabletop pose only for frames 325–395. This bounded placement is
ordinary generated data consumed by the shared attachment runtime; it is not
an emulation of native vector arithmetic. Initial visibility before the first
explicit native flag is an authored baseline. Detached intervals outside the
bounded placement are hidden. No claim of exact native detach choreography,
Fuku handguard handling, or sliding-door animation follows from this work.

The callback addition passes focused source/asset and shared-runtime checks.
On November 13, the protected GPU-browser run passed both its real Radeon
renderer preflight and the connected Story scenario. Evidence is retained at
`/run/media/brynn/PersonalArchive/ny-jimmy-story-JbHBjgbv/family-crest-20261113/natural/`.
Inspected natural-playback captures show the correctly textured original
handguard in Ryo's first grip, on the table, in Ine-san's right-hand pickup and
left-hand close-up, and back in Ryo's hand. The run used no timeline seeking or
diagnostic camera to produce those views; enabled-mesh assertions alone are
not the visibility evidence.

This recheck began with an isolated fixture seeded with the earlier Gui Zhang
milestone and handguard possession, and initially shortened house travel to
the altar-room door. The real Fuku referral covered cancellation/retry; the
actual altar door was picked and opened and Ryo walked through it. The family
film was cancelled around frame 650, Ryo moved out, the page reloaded, and a
new physical approach retried the scene. Natural completion saved the family
clue/notebook while retaining the handguard, restored movement/camera/avatar
state, and survived the final reload without replay. This is a connected
client/server check from stated prerequisites, not a fresh uninterrupted
main-route playthrough. A second protected Radeon GPU run, using a separate
task-owned PostgreSQL fixture, also verified explicit skipping of the upgraded
presentation, saved completion, retained inventory, restored controls and reload.
The real Yarn/server `TestMirrorSearchSettlesOnlyAfterCompletedEvents` check
passed against the isolated PostgreSQL instance, and the client/server contract
check passed. These checks retain the same stated prerequisite and travel
limits; neither fixture establishes a fresh uninterrupted Story playthrough.

Earlier compiler/PostgreSQL checks continue the earned handguard fixture, reject
unearned/out-of-bounds attempts, cancel dialogue and scene, reject stale
acknowledgements, and prove once-only independent settlement with inventory,
calendar and economy unchanged. The connected browser check continues the
earned Gui Zhang save, uses test travel home, cancels/re-enters the automatic
referral, positions Ryo near the original altar-room door at static placement
4, clicks it and walks through its opening,
cancels/retries the original crest scene and finishes it naturally. It verifies
saved independent notebook pages, the retained handguard, no mirror grant,
restored controls and reload without replay. Inspected captures show Fuku-san,
Ryo and Ine-san in the original room. Those earlier captures do not establish
the new callback-driven prop/hand presentation or exact facial fidelity.

Sliding collision binds to the moving leaf's frozen closed geometry center,
not the whole door origin at the join between two leaves. Only that leaf's
native boundary moves; the stacked panel remains solid. The regression fixture
places the root at the shared segment endpoint to exercise this distinction.
Opening a door does not make its entire model width passable: the player must
walk through the vacated strip, with clearance for the player cylinder.
The fresh opening-to-allowance browser regression also passes after this shared
collision change.

## Iwao's key and the dojo sword

Official imports: `story-s1-iwao-mysterious-key` and
`story-s1-dojo-sword-case`. The
[contemporary GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed pages 12–13 and 37–38, describes these pickups both early and during the
mirror search. Do not invent a family-crest prerequisite for the key or sword.

| Field | Authored integration |
| --- | --- |
| Location / trigger | Use the original ihko gray case inside IWWH in Iwao's room (`JOMO`), then the original KHKS long case in the dojo (`JHD0`). Both are use-only, with server-validated proximity; entering a region does not collect anything. |
| Prerequisites | Personal Story Ryo with completed opening. The sword case requires actual mysterious_key possession, not a client acknowledgement or notebook flag. |
| Sequence / choice | Normal drawer opening and contained-object picking, an explicit open/leave choice, a bounded owned inspection, then acknowledgement. One shared ordinary Yarn template expresses both pickups. |
| Presentation / timing | Original models and room placement. Newly authored, unvoiced inspection captions, held Ryo poses and close-up cameras; detailed lid/hand/pickup animation is not reconstructed. Dialogue uses the shared Space/X controls. Preserve personal weather/date; no forced music or time jump. |
| Effects | Migration 010 defines two non-usable, non-stackable quest possessions. Atomically grant mysterious_key or dojo_sword and its independent notebook/milestone. The sword possession represents personal access to the dojo sword, not physically carrying it throughout the shared world. Retain the key. No money, HP or mirror grant. |
| Failure / replay | Leave, cancellation, failed preparation and stale acknowledgements grant nothing. Restore the prior approach, avatar, camera and controls; saved completion prevents repeat grants. |

Authored use labels are generated from the route source and consumed by the
existing object classifier, which gameplay and scenery preparation share.
Quest props therefore retain picking ownership without a second registry or
quest-state store. Native drawer/door mechanics take precedence. Contained
objects cannot start ordinary interactions through a closed/opening drawer;
that local presentation check does not claim server-authoritative drawer state.

The source receipts pin original JOMO/JHD0 MAPINFO and retain the object tags.
Compiler/PostgreSQL checks exercise proximity, leaving, cancellation during
inspection, stale acknowledgement, actual key possession, independent
once-only inventory/notebook settlement and character isolation. A connected
rendered check clicks the real drawer, then its contained case and the dojo
sword case; it verifies leaving, live cancellation/retry, owned inventory,
reload, duplicate prevention and restored controls. Inspected captures show
the original cases and the key in Iwao's open drawer. The sword's inventory slot
uses the project's reconstructed sword artwork, not a recovered original icon;
detailed pickup animation is not reconstructed.

Empty control meshes are excluded from placement bounds. Including Babylon's
default zero-size box for these nodes shifts drawer bounds toward the world
origin, despite the rendered drawer being correctly placed. Both placement
auditing and containment now use the shared geometry-only bounds helper.
Picking excludes contained props while their drawer is closed/opening, using
the same availability rule as interaction dispatch.

## Dojo scroll and switch puzzle

Official imports: `story-s1-dojo-handguard-switch` and
`story-s1-dojo-sword-switch`. The
[contemporary GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed pages 38–39, establishes the two puzzle actions and subsequent basement
descent. These are ordinary authored use events, not native-controller execution.

| Field | Authored integration |
| --- | --- |
| Location / trigger | Use original KAK2 (left scroll, z=-21.937), then KAK1 (right scroll, z=-22.947), on the dojo wall opposite its entrance. Server-accepted use-only bounds cover the real objects; merely walking nearby never solves a switch. |
| Prerequisites | Personal Story Ryo and completed opening. The left action requires actual sword_handguard possession; the right requires the completed left action and actual handguard and dojo_sword. Ordering follows the walkthrough, not a claim about all native alternative orders. No invented crest, weather or calendar gate. |
| Sequence / choices | Prompt, explicit lift-and-fit or leave choice, owned close-up and acknowledgement. Both reuse the ordinary Yarn pickup/inspection template. They grant no new item. |
| Presentation | Original scrolls, recess and SKAB hidden wall. Scroll removal is condensed to visibility; a declared 2.15-unit sideways wall translation clears its original two-meter visual width. Held Ryo, camera and unvoiced captions are authored. Detailed scroll rolling, mounted handguard/sword meshes and hand animation are not reproduced. Date/weather/music remain unchanged. |
| Effects | Each switch and notebook page settle independently through the existing server transaction. Possessions remain as personal access, with no currency, HP, time, basement arrival or mirror reward. |
| Failure / replay | Leave, live cancellation, preparation failure and stale acknowledgement settle nothing. Temporary object transforms restore before returning avatar/camera/controls. Saved flags prevent repeat grants or repeated transforms. |
| Personal world / recovery | The existing Story runtime derives object presentation from server flags. It applies on world load/reload and restores on character/mode changes and teardown. There is no second writable save store or shared global room switch. Moving hierarchies transfer to the existing dynamic spatial-index owner rather than retaining stale frozen bounds. |

Compiler/PostgreSQL checks cover out-of-bounds and premature-right rejection,
leave/cancel/stale replies, once-only independent settlement and unchanged
inventory/economy/calendar. The connected browser check uses real scroll picks,
verifies leave and live cancellation restores, retries and acknowledges both,
then reloads the saved room. Inspected captures show the original recess and
the revealed space behind the moved wall. Shared presentation tests cover
failed preparation, malformed/missing/ambiguous targets, cancellation cleanup,
character isolation, mode restoration and non-accumulating offsets.

Switch completion alone does not grant basement arrival or a mirror. The
separate confirmation/travel events below now connect admission and return;
the basement investigation below is independently gated and does not award a
mirror from descent alone.

## Basement admission and return

Official imports: `story-s1-basement-descent` and `story-s1-basement-return`.
The contemporary guide's printed page 39 establishes descending through the
opened dojo passage. Room geometry and collision come from original Disc 2
YDB1; no native room-controller execution is required.

| Field | Authored integration |
| --- | --- |
| Location / trigger | Walk into the accessible dojo-side approach to the opened SKAB panel. A separate north-corridor approach inside YDB1 offers return. Neither immediately travels: both require an explicit confirmation. |
| Prerequisites | Story Ryo and completed opening; descent requires the saved sword-switch completion, and return requires a saved basement visit. No global weather/calendar gate. |
| Sequence / timing | Owned standing close-up and newly authored unvoiced caption, then descend/return or leave. The shared ordinary Yarn confirmation template finishes its temporary presentation before queuing one reviewed destination in the existing settlement transaction. No timed challenge or forced clock jump. |
| Room / props | Load only original S2_YDB1_MAP and MAP01, retaining the furnished room. Do not stack every CHRM member at origin: separately controlled props need reviewed placements. No new asset binaries or publication are required for these existing catalogued maps. |
| Arrival / return | Existing entry evidence has no typed/default AKIR arrival for YDB1. Its declared authored arrival is [-2,-0.005111,6], on original MAP01 support west of the partition; normal rendered movement confirms access toward the main room. Return uses original JHD0 entry 6 [9.5,0.96,-22.5], outside the descent volume. The client world spawn derives from the same authoritative destination export. |
| Effects | Save destination and idempotent visit/notebook flags atomically. No inventory, yen, HP, time or Phoenix Mirror grant. Both reward-free routes are repeatable, so leaving cannot permanently lock exploration. |
| Failure / recovery | Leave, cancelled caption, failed preparation and stale replies do not travel. Existing receipt/presence fences reject old-room and invented first-arrival coordinates; duplicate receipts do not restart travel. Reload reconstructs the saved world and controls. |
| Fidelity limits | Accessible approach and confirmation condense the script-owned doorway/ladder. Cameras, captions and basement arrival are authored. Climbing, flashlight/candle/power interactions, exact original darkness and detailed prop inspection are not implemented. |

Story routing now derives reviewed destination rooms alongside the NPC area's
existing mapping. An empty room therefore does not need fabricated ambient NPC
data to run events. Conflicting area mappings still disable dispatch rather
than guessing an alias or trusting a browser-supplied area.

Compiler/PostgreSQL checks cover proximity, leave/cancellation/stale replies,
atomic exact destination, repeat visits and unchanged inventory/economy/calendar.
Realtime checks cover both destinations' stale-room/first-arrival fences,
duplicate receipts, rooms without ambient NPCs and mapping conflicts. The
connected browser check walks to the approach with ordinary input/collision,
cancels/leaves/retries, enters YDB1, walks from z=6 past z=3 with supported
ground, cancels/retries return, revisits and reloads without replay. Inspected
captures show the original room geometry, furniture and return presentation.
This is not verification of every basement prop, illumination rule or secret.

## Basement investigation and Phoenix Mirror recovery

Official imports: `story-s1-basement-floor`, `story-s1-basement-shelf`,
`story-s1-basement-axe`, `story-s1-basement-wall`, and
`story-s1-phoenix-mirror`. The contemporary
[GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
printed page 40 supplies the floor marks, shelf/discolored wall, near-entrance
axe and hidden mirror order. Optional photograph, White Leaf and Stab Armor
discoveries are not prerequisites for that mandatory path.

| Field | Authored integration |
| --- | --- |
| Location / triggers | YDB1, admitted through the earned dojo puzzle. Real mouse use of the floor beside the shelf, movable shelf, entrance-side axe, original west-wall face and revealed mirror. Walking does not complete these use-only events. |
| Eligibility | Personal Story Ryo, completed opening and saved basement visit. Floor clue unlocks shelf movement; the shelf and actual `basement_axe` possession unlock the wall. The committed wall reveal and owned axe gate mirror recovery. Axe pickup may happen before the shelf. The server independently checks accepted player proximity; clicked points are presentation, not save authority. |
| Time / weather | No invented time, date or weather gate. No forced calendar jump, HP change or yen charge. Existing personal room/calendar remains in effect. Flashlight/candle/electrical-light interactions and original darkness are omitted adaptations, not claimed recovered behavior. |
| Cast / props | Original Ryo and YDB1 room/furniture, ONOS500G axe, KABE/ANAR001G wall-hole and HOKY/PNX02M1G mirror. TANR0B4G is an original cabinet-sized model assigned the movable-shelf role here; its precise native identity/placement is unproven. No unplaced archive member is stacked at origin. The axe is on the accessible side of the entrance partition; wall interaction aligns with the original rendered face at x=-8. |
| Action / timing | Each shared ordinary Yarn event shows an authored caption, explicit act-or-leave choice, bounded presentation and receipt. Original `M_0138.MOTN` selections provide shelf pull (400 frames), axe pickup (220), wall strike (120) and taking the mirror (644). The shared presenter waits for these non-looping motions at 30 fps. Floor inspection uses a held pose. Only acknowledging the receipt and successful cleanup settles the outcome; motion completion alone grants nothing. |
| Audio / camera | Captions are newly authored and unvoiced, never mislabeled as original speech. Poses, fixed cameras and attachment grips are authored; source AUTH camera choreography is not required. No unsupported voice, music or sound cue is invented. |
| Mechanical presentation | Shared cancellable object transforms move the shelf sideways, hide a collected axe and show the hole/mirror after the wall action. Mechanical translation, wall damage/debris, repeated strikes and safe/lid handling are condensed. The hole is a surface overlay, not a claim that the whole original collision wall was removed. The mirror is on its accessible room side. |
| Durable effects | Existing server transaction saves independent clue/shelf/axe/wall flags, stable notebook pages and one each of `basement_axe` and `phoenix_mirror`. Both are nonusable, stack-one personal key items. Saved flags derive object visibility/position after reconnect and reload; there is no second writable browser story state. |
| Exit / continuation | Restore the prior gameplay actor/camera/controls after every action. Use the existing repeatable basement return to reach the dojo. The original automatic return is condensed to this explicit choice. The separate [Fuku/Chen follow-up](#return-to-master-chen) is not silently completed by the mirror receipt. |
| Leave / skip / failure / replay | Leave, live cancellation, failed motion/prop preparation or stale acknowledgements settle nothing. Completed discoveries cannot award again. Temporary shelf/prop transforms restore on cancellation; character/mode/world changes restore the other personal view. Ordinary line advance is not an animation skip or a challenge answer. No QTE/combat outcome is hidden in this search. |

The floor and wall use small authored point volumes on actual rendered MAP
geometry through the existing object dispatcher. Their personal flags gate
picking; Yarn, accepted-player bounds and genuine inventory gate settlement.
This avoids fake clickable geometry, attaching a wall action to the moved
shelf, or creating another quest engine. Surface matching is restricted to
the reviewed model and area, and ambiguous/malformed definitions fail loudly.

`tools/cutscenes/build_basement_story_assets.mjs` pins the original compressed
MPK00 source and selected member hashes. It uses the canonical
`tools/assets/sync_models.py` TEXN/IPAC extractor for browser texture records and
checks every held prop's external texture ID. The source PKF is gzip-compressed;
passing that archive directly to the runtime's flat texture reader produces
white props and is not a supported substitute for extraction. Selected MOTN
loading intentionally does not decode an unrelated unsupported clip in the
same bank. All new motion/prop/texture output remains ignored local data with
registered immutable runtime-asset metadata; publication is a separate,
explicitly authorized release step.

The real compiler/PostgreSQL connected-chain test covers wrong order, missing
axe, accepted proximity, leave, cancellation after presentation, stale run
acknowledgements, independent once-only discoveries and another character's
ineligibility. The rendered earned-save continuation exercises actual scene
clicks, leave/cancel/retry for every search action, natural selected motions,
inventory/notebook settlement, control restoration and saved presentation on
reload. It is not proof of exact hand grip, original scratch artwork, optional
discoveries or every basement illumination rule.

The axe inventory artwork is a 256px transparent render of the original
`ONOS500G.CHRM` and packaged YDB1 textures through the production MT5 loader.
Its thumbnail camera and lighting are authored; it is not a recovered original
inventory icon. The [artwork catalog](../../artwork/inventory/catalog.json)
records the source hashes, selected render and camera. Focused asset/bundle
checks and a separate real-browser inventory check passed on desktop and
390px mobile layouts. This isolated UI check uses a catalog-backed inventory
fixture; the added earned-pickup assertion awaits the fresh Story continuation.

## Return to Master Chen

Official Yarn imports: `fuku-phoenix-mirror`, `harbor-bus-revisit`,
`master-chen-return-call-dobuita`, `master-chen-return-call-home`,
`master-chen-return-call-harbor`, `old-district-revisit`, `master-chen-mirror`.
The contemporary [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed pages 40–41, establishes the referral, repeat password call, guard
recognition, Chai's theft/Left response and Hong Kong warning. This chapter
does not depend on recreating the native warehouse controller.

| Field | Authored integration |
| --- | --- |
| Locations / triggers | Return from YDB1 and approach Fuku-san in the JHD0 dojo. Use the existing Dobuita bus and one of three telephones. Approach the MFSY compound gate, use its ordinary Warehouse No. 8 door, then approach the MS08 meeting. Each consequential action has an explicit accept/leave choice. |
| Eligibility | Story Ryo, genuinely recovered `phoenix_mirror` and corresponding milestone. Fuku's completed referral gates the second call; its shared appointment gates recognized entry. The server checks accepted position and actual item possession. First-visit guard refusal is excluded after the original Chen meeting, even if the player never heard it. |
| Calendar / weather | Preserve the personal calendar and environment. Do not invent a nighttime-only return, bus fare, currency reward or next-morning teleport. The public clock and other players' saves are unchanged. |
| Presentation | Fuku uses existing original HOUO activity 9 and its exact reviewed bindings. The warehouse uses original MS8A AUTH ordinals 6,0,1,2,3, then explicit challenge result selects failure 4 or success 5 followed by 7. Original camera/body tracks, A0159 voices and A1_HONKN sounds are reused. |
| Cast / props | Original Ryo, Chen, Gui Zhang and Chai, archive-local detailed hands, shared Ryo/KIS/SYU talking faces and Chai's original simpler mouth. Original CHRT binds KAGA to PNX02H6G and CLE1/CLE2 to B570501G/B570502G. AUTH moves the one mirror except for explicit original FIXO hand bindings; no duplicated prop or permanent guessed wrist override. Native gaze, impact debris and every original expression remain incomplete. |
| Phone / travel | Reuse the existing password dialogue and validator, ordinary telephone motion and reviewed arrival destinations. Dobuita, home and harbor share one appointment milestone. Bus and recognized compound entry are repeatable reward-free travel; first discovery remains a separate one-time event. Receiver choreography and the guard recognition caption/tableau are authored. |
| Challenge | A client-timed two-second Left prompt after the crane setup, with the outcome reported to the server. Original scene completion cannot count as input success. Wrong/missing input plays original failure and offers retry/leave. Retry retains the player's earned mirror. The held prompt pose/camera is authored, not a recovered native QTE callback. |
| Effects / notebook | Set independent referral and appointment flags/pages. Only the successful challenge followed by completed final presentation atomically settles the meeting, mirror legend, Mad Angels and Hong Kong notebook pages. No new mirror, yen, HP or date grant; no possession is consumed on failure. |
| Exit / interruption | Restore the previous gameplay actor/camera/controls and remain in the warehouse. Leave, cancellation, failed preparation and stale acknowledgements do not settle the chapter. Completed referral/call/meeting cannot replay or award again; committed outcomes survive reload. The separate home continuation below owns Fuku, sleep and bank effects. |

### Source assets and declared limits

`npm run build:mirror-meeting` uses the shared original activity, TEXN and audio
compilers. It checks the original MS8A PKS, MAPINFO, PKF, A0159.AFS and
A1_HONKN.SND hashes. MS8A AUTH references motion bank **17** (`M_0159.MOTN`),
not the first meeting's bank 16. All 59 bank sequences decode; 29 are referenced
by these presentations. The original camera/body sequences are reused, but
their story order and success/failure selection are authored from the guide
and motion identities. The retained [MS8A callback evidence](../../tools/evidence/mirror-meeting-callback-ir.json)
pins MAPINFO and proves owner `0x4e2c` selecting callbacks `0xaf0`, `0x10f4`,
`0x160c`, `0x200c`, `0x272c`, `0x2d8c`, `0x38b4`, and `0x3e14` for AUTH
ordinals 0–7. Zero resource pointers still mean AUTH-ordinal loading, not
execution of the original room-owner state machine.

The shared hand/prop compilers retain the original setup and timed poses.
KAGA attaches to Chai's **left** controller 12 at slot 2 frame 0, then returns
to AUTH at slot 3 frame 0. Ryo's right-controller-18 grip starts at explanation
frame 723 and releases at 2262; the final conversation attaches at frame 0
and releases at 3630. Other shots use original AMOV, including the deliberately
off-screen `y=-1` mirror during the crane-button shot. No manually chosen
handover offset remains. The shared terminal-path analysis distinguishes
post-ASEQ fade/countdown cleanup from initial hand setup. Original resident
resets are documented as handled by release of this runtime's private actor
leases, rather than miscompiled as frame-zero poses.

Four exact voice references (`A0159A005`, `A0159C003`, `A0159A026`,
`A0159A010`) are absent from the original AFS and IDX. The audio manifest records
them as unavailable rather than substituting invented speech. The remaining
voices and effects are extracted normally. Configure `DTPK_PYTHON` with a
Python runtime supporting `aifc` and `VGMSTREAM_CLI` for audio generation.
All extracted binaries remain ignored; generated manifests and immutable
runtime-asset records are tracked. R2 publication is a separate release step.

The real compiler/PostgreSQL earned-chain test covers decline, cancellation
between presentation parts, stale receipts, correct/wrong password choices,
repeat travel, wrong Left-challenge input/retry/success, atomic notebook
settlement, unchanged item/economy/calendar state and cross-character isolation.
The rendered continuation is `NEW_YOKOSUKA_MIRROR_RETURN_E2E=true` on the
isolated earned-save fixture. The single-browser run passed in 6.4 minutes:
ordinary basement exit/Fuku approach, leave/live cancellation/re-entry and
natural HOUO ending; real bus/harbor-phone picks, password cancellation/wrong
answer/correct call; recognized guard admission and actual warehouse-door
use; meeting decline/cancellation, natural original segments, wrong Right
input, retry with Left, natural final presentation and saved reload without
replay. Inventory, yen and HP remained unchanged. Captures visibly show Ryo,
Fuku, Chen, Gui Zhang and Chai with the original scene cameras. This does not
prove exact mirror grip/handovers, crane debris, every face callback or audio
fidelity by listening.

The 2026-10-23 presentation-only recheck completes all eight clips naturally,
cancels/replays the explanation, and verifies restored avatar/view/position,
zero actor leases and unchanged saved flags/inventory/yen. Native shots and
diagnostic close-ups show Chen's authored mirror movement, Ryo's grip and
Chai's left-hand grip; original face geometry changes over voiced frames for
Ryo, Chen and Gui Zhang in the final conversation. The mirror releases and
hides at its original ending cue. This is not proof of every finger contact,
Chai's speaking face, native gaze, debris or listening fidelity; the earlier
connected-flow evidence above remains separate from this presentation check.
A separate 4.5-minute connected recheck uses a fresh isolated fixture seeded
with the mirror, prior referral/appointment/admission and earlier milestones.
The actual meeting approach, decline, live cancellation/re-entry, original
clips, wrong-input failure/retry/success, natural final ending and saved reload
pass. Completion/notebook wait for the ending; inventory, yen and HP remain
unchanged and controls return. This fixture does not re-earn or re-verify the
upstream mirror search, bus, telephone or compound-entry prerequisites.
The presentation review is the `mirror` set of
`NEW_YOKOSUKA_STORY_FACES_E2E`; the connected continuation uses
`NEW_YOKOSUKA_MIRROR_RETURN_E2E`. Run either against an isolated eligible save,
one browser at a time. Seventy-three focused compiler/ownership/hand/activity
tests pass; deterministic regeneration preserves the verified package. The
109-package wiring audit reports no missing registered/restored face, hand
or audio assets. That wiring audit is not a visual certificate for other scenes.

## Home and travel funds

The [ticket journey guide](story-ticket-journey.md#home-and-travel-funds) specifies
the next connected chapter, its exact original assets, once-only funds and
declared timing/staging adaptations. Its verification state is recorded in the
checklist above rather than inferred from successful asset generation.

## Nozomi's park invitation

The optional invitation uses the original 700-frame `01SKIA` telephone film
in disc 1 JOMO `MAPINFO.BIN` at `0xbd5c8`, with its original seven English voice
lines and `M_01SKI.MOTN` performance. Original owner `0x6dcc4` selects native
slot 44 and callback `0x6dfe4`; the shared telephone adapter restores the
handset, including grip changes at frames 30, 180 and 399 and release at 655.
Two original DNOZ films and their dedicated park geometry follow. The footage
uses Nozomi's original `NZM_M` model and the source hands, faces and audio.

The [walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404)
places the call near 7 p.m. before the handguard, ending at 11:30 p.m. The
Story version requires the Chen phone lead, uses a broader 7–11 p.m. window,
and asks the player to answer near the telephone. It returns Ryo to that home
position and updates the personal clock only after both films complete; the
exact ringing window and curfew handoff are adaptations. An isolated rendered
Story run with the Chen lead seeded exercised the actual approach, decline,
call and park cancellation/retry, natural completion of both original films,
23:30 settlement and reload. More than 20 original voice clips played and
Nozomi's visible speech vertices changed; precise gaze remains unverified.

## Nozomi's later park conversation

The original DNOZ `SEQDATA2` and `SEQDATA3` films, English recordings,
hand/face cues, BGM068, `NZM_M` model and dedicated park scenery play after an
authored Sakura Park approach in personal Story. The server checks an evening
on or after December 26 and the Master Chen mirror meeting. Guides agree on the
calendar window but disagree about whether the earlier confession is necessary;
the adaptation deliberately does not require it. Player confirmation, exact
trigger volume and return position are adaptations; completion advances the
personal clock to 11:30 p.m. and saves the event once.

With the date and mirror meeting seeded, a rendered run checked normal park
approach, decline, cancellation in each film, retry and unskipped completion.
Original voices played and Nozomi's visible mouth vertices changed; clock,
progress and gameplay controls survived completion and reload.

The separate Eri conversation is available outside You Arcade after the mirror
meeting, from December 26 during the evening, before the park visit. It uses
Eri's original model and the original voiced F1227 conversation; the arcade
approach, poses, camera and exact eligibility are approximations. Finishing it
adds a notebook note without completing or requiring the park visit. A rendered
test walked into the scene, exercised cancellation and retry, checked the saved
note across reload, and continued into the park encounter on the same isolated
character. The mirror prerequisite and personal date were seeded for that test.

## Naoyuki and Ichiro visit Ryo

The actual home visit is `01FRE`, not `01GAK`: the latter contains a separate
conversation with Fuku. JOMO's original two `01FRE` films supply the camera,
movement and body animation, with their matching English voices and sound bank.
The displayed Naoyuki and Ichiro bodies are byte-identical to the originals in
JOMO's `HOUMON.PKS`. Facial animation has not yet been verified.

[A contemporary walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/15613)
places the visit the evening after Nozomi's later park conversation, introduced
at Bar Yokosuka. The original DBYO controller at `0x1ab44` plays the twelve
`SA1018` lines involving Akemi, Saijo, Yoko and Ryo, then transitions to JOMO.
The Story version uses the original recorded lines and same home transition,
with private scene actors, authored poses, camera, entry bounds, calendar gate
and home arrival. The home visit also remains independently available at an
authored hallway approach; the exact native selector and scene choreography
remain unresolved. Its confirmation and return pose are adaptations.

Isolated rendered tests seeded the park milestone and previous day, then
checked the voiced bar conversation, cancellation, retry, transfer home and
following visit. The reviewed bar shot does not establish whether Yoko is
visible from the held camera, and native changing gestures are not reproduced.
A separate home test checked both original films, cancel/retry
in either, normal full playback, original voices, unchanged inventory and money,
restored controls and saved completion on reload.

## Optional Yamanose football encounter

Disc 1's original
`SCENE/01/JU00/JQSO.PKS` (SHA-256
`956fd7b8441f3538c3a99a59aae840f522dc8238089ba202fc15d98d0b3db87f`)
contains `DYNAMICS.DYNM`, ball model `FBB0201G.CHRM` and motion bank
`M_01113.MOTN`. The matching `JQSO.PKF` includes a `CHARA.CHRT` binding from
`FBB_` to that ball model. The motion bank has separately named Ryo and child
success/failure sequences; those names do not establish exact timing, placement,
camera, trigger or audio. The archive contains no AUTH cinematic to reuse as a
complete film.

The [walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404)
identifies a next-day daytime encounter and an A-button catch with different
success and failure outcomes. The Story implementation uses original E1014A
voices, JQSO motions and ball model. A walkable road trigger, camera, positions,
ball path, two-second input window, simplified voice order and omission of the
weather gate are authored approximations, not decoded native behavior. The
optional encounter does not block naming the kitten. The catch and miss have
separate personal flags; cancellation saves neither. Original physics, exact
contact and complete cinematic choreography remain unverified.

## Later kitten events: source leads

Original source inspection identifies separate scenes rather than one
generic kitten film. Naming, feeding, recovery, the later roof/medicine
films and adoption are connected to personal Story progress:

- Disc 2 `JU00/CATA2.PKS` (`5d028873e0f399c4a0d5b829dc6bfee08e397ad71b7e91d2c9c57659bf292c34`), `SEQDATA3.AUTH`, is the 1,650-frame healed-leg encounter. The original `01CAT3.AFS` (`8bb32231ed5cfff895996d16d4267e02522e1fdff5a775392b439f397ee39b0f`) subtitles identify Yasuo and Kayoko celebrating the kitten's recovery. Its `CHARA.CHRT` binds `NBOX` to `DANM400G`; `M_01CAT.MOTN` is byte-identical to the first encounter's motion bank.
- The same archive's `SEQDATA0.AUTH` is a distinct 1,617-frame shrine scene in which Ryo speaks to the kitten and Nozomi arrives. `JU00/MAPINFO.BIN` (SHA-256 `3a565890be5cf3a746119b63e8b5aac4cdc5396f8ea8ea3d0f35ba9fb79264c5`, record `0x4d794`) associates `01MUT`, `CATA2`, `BGM018.SND` and `A1_RYODK.SND`. The original `01MUT.AFS` provides twelve voiced lines. It is not the later missing-kitten search: the separate `E1041.AFS` has Megumi's disappearance report and the search/reunion dialogue. An isolated rendered run clicked the actual kitten, declined and cancelled before retrying the original film, heard its original voices and music, observed Nozomi's mouth vertices move, and verified the saved receipt after reload. Ryo, the kitten and Nozomi were inspected in rendered shots; detailed hand contact remains unverified. The next-day gate, interaction, confirmation and cutoff are authored, not recovered native eligibility. The pack's local runtime assets require publication before deployment.
- Disc 3 `JU00/CATA3.PKS` (`087f76f8e8a8d8e2dc1dbc61cb3998bcb1f9c41eda133ee6a12667690fdb0642`) contains the 1,157-frame kitten-on-the-roof scene and the 870-frame Nozomi/medicine continuation. Their `01CJP.AFS` (`0288c4c5317409b3f9df94ee1b5aaf6f4772ea9c379400aba7e66b781fa31e29`) subtitles establish the subject of each. Its `CHARA.CHRT` binds `DRUG` to `NANHIL0G`.
- The naming conversation is not those films: the Megumi `F1120` dialogue has original lines for Mimi, Sasuke, Chibi and Tama. She rejects Sasuke; the [walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404) says the others are accepted and places the optional encounter the following day after the football event. If it is missed, the guide says the name defaults to Tama. Our authored route offers those original voiced choices on a direct click; it records Sasuke only as rejected. The separately playable football event is not required for naming, and later adoption dialogue defaults an unnamed kitten to Tama.

The first-kitten event now records its personal completion day; the naming
route opens the following day. Older completed saves lack that receipt and are
eligible without inventing a date. Megumi's authored daytime shrine resident
is local to a Story viewer and uses her original standing idle. It does not
change the shared scheduled NPC. A lower-priority original-voiced check-in is
repeatable without progress or rewards, including on the first day. After a
seeded dojo prerequisite, one isolated character completed the first kitten
encounter, talked to Megumi twice that day, waited until the following morning,
cancelled and retried naming, chose Tama, and reloaded. A separate old save
without a first-visit date also passed. Real-Yarn checks cover all four
suggestions and the rejection, date, mode, bounds and cancellation gates.
The first visit also unlocks the original `knib` dried-fish and `kmil` milk
models in the Hazuki kitchen as personal, one-time pickups. The normal
inventory transaction saves one of each only after the choice is acknowledged;
the original prop hides for that Story character and restores for other
characters and Free roam. The milk is behind the original refrigerator door.
On a later visit, talking to Megumi offers whichever food is held, consumes only
the acknowledged choice and records one feeding on that personal day. A
second same-day visit falls back to ordinary voiced conversation.

After two feedings on separate personal days, visiting Megumi the following day
offers the original recovery film. Only its acknowledged ending saves healing;
leaving or cancelling remains retryable. Afterward, a repeatable voiced
conversation keeps Megumi usable without asserting adoption. The two available
foods, once-per-day rule, two-feeding threshold, next-day wait, confirmation
and Megumi trigger are intentionally simple authored approximations, not
recovered native health or trigger rules. There is no hand-to-kitten feeding
animation, food shop or refill yet. The newly extracted
post-recovery voices and the recovery-film assets are local runtime assets and
must be verified and published before any future deployment of this branch.

After recovery and Jimmy's interrogation, a daytime Story player can click
Megumi and choose to watch the original CATA3 rooftop film followed by Nozomi's
medicine scene. The original `SEQDATA0.AUTH` and `SEQDATA1.AUTH` supply the
actors, movements and cameras, `01CJP.AFS` supplies 22 voices, and the original
`CHARA.CHRT` binds Nozomi's `DRUG` prop to `NANHIL0G`. The exact weather gate,
exact weather and original temporal eligibility are still unresolved. The two prerequisite flags, daytime hours and confirmation are
explicit adaptations; completing both films sets one personal receipt and
grants no item, money or adoption.

The separate missing-kitten search uses the original name-specific `E1041.AFS`
report and reunion dialogue. After recovery and the Chen mirror meeting, talking
to Megumi records the search; the original kitten model moves locally to an
authored position near the lower stairs and laundry described in the
[walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/6804).
Megumi's waiting dialogue remains available, and clicking the kitten stages
Nozomi's discovery and a cut back to the shrine. Acknowledging the complete
reunion returns Ryo there and records the result and notebook entry. Cancelling
either scene leaves the kitten missing and the search retryable. An active
search must finish before the rooftop event; a player who never starts the
optional search is not blocked. The original E1041 selection program, exact
weather and placement, meowing, pickup, walk back, camera and gestures are not
recovered. The scene uses authored held poses and a cut, not a claimed native
animation. `E1041F008` is referenced by the original controller but absent from
the inventoried English audio archive, so it is not replaced with another voice.
New local voice assets require publication before deployment.

An isolated rendered run seeded through healing and Chen cancelled and retried
the report, reloaded while the kitten was still missing, heard Megumi's
name-specific reminder, clicked the kitten near the stairs, and inspected both
staged views. Cancelling discovery or reunion left the search open; a completed
retry saved the shrine return and notebook entry through another reload. The
test uses repositioning to shorten travel and does not verify an unseeded
walkthrough or every actor gesture.

In an isolated rendered test seeded through healing and Jimmy's interrogation,
a real Megumi click reached the event. Decline and cancellation during either
film saved nothing; replay completed the second film and survived reload.
Rendered frames showed the kitten on the roof and Nozomi holding the medicine;
multiple original voice clips played, and Megumi's generic and Nozomi's
body-matched detailed mouth vertices changed during speech. Money, inventory
and movement controls were preserved. This does not prove exact native weather,
all finger contacts or original music, nor an unseeded full playthrough. The
new locally extracted assets require publication and verification before a
future authorized deployment.

After the roof visit and job lead, a daytime Story player can click Megumi on a
later personal day to hear her original name-specific adoption conversation.
Mimi, Chibi and Tama are preserved; if naming was missed or Sasuke was rejected,
the conversation uses and records Tama. A saved roof date enforces the next-day
wait; older saves without one remain eligible. Only completion records adoption.
Megumi and the original kitten model then leave the shrine for that Story viewer,
without changing other characters or Free roam; the box remains. The specific
prerequisites, click, hours and day delay are approximations, not recovered native
eligibility. A rendered isolated run seeded through healing, Jimmy and the job
lead played the roof and medicine films, waited to the next day, heard the
original default-name voice, cancelled and retried adoption, and checked shrine
visibility and progress after reload. Separate rendered runs covered Mimi and a
rejected-name fallback; Yarn tests also cover Chibi and old saves. These do not
establish a complete unseeded playthrough. The new voice assets must be published
and checked before deployment.

The CATA2 recovery film is packaged through the shared AUTH pipeline with
its original 20 voices, 22 effects, motion bank, camera, child models and
kitten. A local rendered presentation-only review completed and separately
cancelled the film, restoring control without changing saved progress; the
source shot at frame 800 shows both children, Ryo and the kitten. A second
rendered run observed both children's visible mouth geometry changing while
their original voices played. Detailed hand and box interaction remain
unverified. The source files and sound bank were hash checked. A subsequent
isolated full-stack browser run, seeded only through the first encounter and
naming, picked both real kitchen objects, declined and cancelled each pickup,
reloaded their saved inventory and personal prop visibility, cancelled a
feeding, fed on separate personal days, confirmed the same-day fallback,
cancelled and retried the original recovery film, and verified natural ending,
saved healing, reload and post-recovery voiced conversation. Test positioning
shortened walking and a test travel call changed zones. The same run does not
prove an entirely unseeded playthrough or native care rules.

### Childhood meal memory

The kitchen's original `sykj` meal object offers a Story-only, once-per-character
memory after the opening. The interaction reach and once-only gate are an
authored approximation; the original eligibility and cutoff are not recovered.
Only successful completion records `story.s1.childhood-meal.completed`, so
cancellation does not consume the memory. This does not affect Free roam or
another player's kitchen.

Disc 1 JOMO `MAPINFO.BIN` contains the exact slot-2 A0122 camera, movements and
six voice cues at `0x9d7cc`. Its `NINJIN.PKS`/`.PKF` supply the young Ryo,
Iwao, tableware, food and textures, and `COMMON01.PKS` supplies `M_0122.MOTN`.
The source owner at `0x645f8` launches callback `0x64ca0`, whose hand poses and
two hand-held objects are translated by the shared compilers. Setup `0x65cf6`
hides the present-day meal; cleanup `0x65e72` restores it. The package leases
that same object and restores it on completion or cancellation. Head-gaze
targets, some native food-visibility changes and the associated music are not
established; the scene must not be considered fully source-identical.

In a rendered, isolated server/database run seeded through opening and first
allowance, an actual pick of the kitchen model started the film; cancellation,
prop restoration, retry, natural completion and saved receipt after reload
passed. Screenshots show both actors and the original food; all six original
voice elements emitted their browser `playing` event during natural playback.
A separate fresh
walkthrough has not been verified. Package assets are locally generated and
must be verified and published before any future deployment.

### Cherry-tree memory

After the first allowance, entering the reachable grounds near the cherry
tree offers the original SAKR training memory once per Story character. The
entry volume, prerequisite and once-only receipt are authored approximations;
the native trigger and cutoff have not been recovered. Only completion saves
the receipt; cancellation remains retryable. Other players and Free roam do
not receive this character's event.

The shared SAKR pipeline supplies the original camera, movements, faces,
native hand cues and A0128 dialogue. `build_cherry_memory_stage.mjs` reuses
the exact `SAKR.PKS` maps and actors in an isolated cinematic lease while the
player remains in JHD0, rather than switching the shared game world. The
original YD01 preview and its packaged activity remain separate. The live
outdoor sky and weather are retained; exact memory weather is not recovered.
Package assets must be checked and published before any future deployment.

In an isolated rendered run seeded through the first allowance, walking into
the approach started the film. Cancellation left no receipt and retry worked;
the original film then played to its natural ending, with multiple original
voice elements reporting `playing`. The visible tree, actors and sky were
inspected; the Story receipt survived reload, and the prior position,
first-person view and movement controls were restored. This is not proof of a
fresh end-to-end playthrough or of the original eligibility/weather rules.

### Dojo friendship memory

After the first dojo scene, using the original horizontal GART principles
plaque offers the HIHY memory once per Story character. Its clickable reach,
prerequisite and once-only receipt are approximations; original eligibility
and cutoff remain unverified. It is a separate interaction from the two
vertical KAK1/KAK2 scroll switches, and cancellation does not settle the event.

The existing original HIHY package retains `SEQDATA5.AUTH`, `M_0125.MOTN`,
Iwao's archive-local body, young Ryo's matching original model, 13 A0125B
voices, faces, scroll and original camera. The native owner hides Fuku while
the film plays; the shared actor suppression lease restores him afterward.
The owner's separate `POK2`/`POS2` prop visibility cues and precise finger
detail remain unverified. The personal room's original map remains in use;
the native resource-selection pointers and gameplay-return lease are shared
with the existing cutscene preview.

A seeded, isolated rendered run clicked GART, inspected the plaque and actor
frames, cancelled and retried, then played the original film to its end. Voice
elements reported playback; the receipt survived reload and position, camera
mode and movement restored. The scroll-puzzle flags, inventory and money were
unchanged. This is not an unseeded full-playthrough or exact native gate proof.

### Kame Shibukawa and the Yamamoto house

In Story, approaching Kame in Sakuragaoka begins her request after the first
dojo scene. She then waits personally beside the Sakura Park swing while the
player finds and clicks the original Yamamoto nameplate. Returning to her
starts the original-voiced conversation and an authored cut to their arrival
outside the house. These flags and her temporary placement belong only to the
individual character; Free roam and other players keep their own NPC view.
Cancellation leaves each step retryable, and no money or item reward is added.

Disc 1 JD00 `MAPINFO.BIN` owner `0x613c0` supplies the street positions and
ECAM `6003` first camera key; Kame's original swing callback is `0x5f2ac`.
JD00 `MAPINFO.BIN` SHA-256 is
`8582ed57e13593d7622d24216ef8f93e5393b13fffd2132f70500f9e6ce2a43b`.
The original JD00 `YAMN` nameplate and 22 selected English voice lines from
`E1044.AFS` are used. The original eligibility, weather/date cutoff, seated
swing pose, detailed gestures and full walking route are not recovered. The
approach volume, first-dojo gate, standing park pose and arrival cut are
explicit approximations, not claims of native behavior.

A rendered isolated run seeded through the first dojo crossed the street
trigger, cancelled and retried it, clicked Kame and the actual nameplate,
cancelled and retried both the sign and final encounter, and saved the
completion and arrival location across reload. Captures of the encounter,
sign and arrival were reviewed; inventory and money were unchanged. Test
positioning shortened travel, so this is not an unseeded full playthrough.
Voice files are locally generated runtime assets and must be published and
verified with their manifest before a future authorized deployment.

### Show Yamagishi the Phoenix Mirror

On Disc 2, talk to Shigeo Yamagishi in Sakuragaoka park while carrying the
Phoenix Mirror. His normal resident schedule brings him to the park. The source
talk owner checks YAMA, park bounds, 08:30–19:00 (end exclusive), an eligible
STEP, and clear flag 817. Imported native saves can supply item bit 290 and
the original progression flags. Older Story saves use the held mirror and
authored progression milestones. Accepting the confirmation plays the original
film. Declining or cancelling leaves it available. Completing it retains the
mirror and records both native bit 817 and the named Story completion flag.

Disc 2 JD00 `INYO.PKS` supplies `SEQDATA7.AUTH` and `M_01INY.MOTN`.
The 2,742-frame film uses all 22 English voice clips from `01INY.AFS`, its
original camera, body motion, tea cup and Phoenix Mirror. JD00 MAPINFO callback
`0x5cd04` attaches the mirror to Ryo at frame 556, Yamagishi at 678 and Ryo
again at 2336. The same script hides it at 2642. Its wrist offsets are static
MAPINFO vectors. The generator also recovers Yamagishi's original hand models,
skeleton and textures. Native gaze tracking remains unverified.

A Radeon Story run selected the actual resident, played all 22 voices, and
measured the mirror 0.155 m from Ryo's wrist, 0.142 m from Yamagishi's, and
0.155 m from Ryo's after the return. The prop disappeared after the source
hide cue. Decline, cancel, replay, natural completion, retained item, native bit
817 and reload also passed. Rebuild with
`node tools/cutscenes/build_yamagishi_mirror_pack.mjs`. Focused checks are in
`tests/YamagishiMirror.test.js` and server `internal/scriptevent/yamagishi_mirror_test.go`.
