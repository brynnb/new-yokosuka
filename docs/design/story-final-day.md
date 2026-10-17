# Final day and departure

This chapter continues the separately saved [ride home and rest](story-nozomi-rescue.md#ride-home-and-rest).
The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed pp.63–65, establishes meditation, Tom's invitation, dismissal from Alpha
Trading, Tom's training/farewell, the evening confrontation and departure.
Ordinary authored Yarn events own progress; original films cannot award combat
or training success. Original controller reconstruction is not a prerequisite.

## Morning presentation sources

All three presentations use the existing Disc3 chapter pack builder and shared
AUTH player. Archive hashes pin original source identity; actors, motions,
cameras and available audio remain original. Model/prop associations are
declared authoring decisions, not recovered native controller dispatch.

| Event | Original source | Important retained data |
| --- | --- | --- |
| Dojo meditation | `JHD0/MSOU.PKS`, `92d841582c87eda667d2f377bbbc3cadbb2618fa4a414651bcee72182a8d14ec` | `SEQDATA1.AUTH`, 1,150 frames; `M_01MSO.MOTN` bank16, Iwao's `IWA_M`, sword/scabbard `SINS501G`/`SAYS500G`. No authored speech. |
| Tom's lunch invitation | `MFSY/TOMOGORI.PKS`, `cce64a24b1d50d80efd0e008a7e714b6811e5c7db4063df0e043d2de840dcc09` | `SEQDATA1.AUTH`, 713 frames; `M_01TOM.MOTN` bank16, original `AMG_L` Tom body, `01TOMA.AFS` and `A1_TOMNA.SND`. |
| Yada's dismissal | `MFSY/MARU_KUB.PKS`, `ffc7a9549dca0d9fe6f683f7884e8239a511bfc74f5d8cac7281962674552cb5` | `SEQDATA2.AUTH`, 1,720 frames; `M_01KUB.MOTN` bank17, existing Yada body, original Alpha room, `01KUB.AFS` and `A1_KUBI.SND`. |

Generate one selected presentation using
`node tools/cutscenes/build_harbor_job_pack.mjs --profile final-meditation --audio`,
or profiles `tom-lunch-invitation` and `yada-dismissal`. Generated manifests
record individual source, voice, sound and output identities. No asset
publication is implied by local generation.

## Connected morning event definitions

| Field | Dojo meditation | Tom's invitation | Alpha dismissal |
| --- | --- | --- | --- |
| Personal prerequisites | Story Ryo, completed opening and independently saved final-morning rest. | Saved meditation. | Saved lunch invitation. |
| Location / trigger | Walk into the established dojo-floor volume in `JHD0` / Hazuki Grounds, then choose **Meditate** or **Not yet**. | Arrival/approach around original TOMOGORI Ryo browser `[106.778,0,14.119]`; **Talk with Tom** / **Leave it for now**. | Existing tested Alpha doorway approach `[25,0,71]`; **Speak with Yada** / **Leave it for now**. |
| Cast / props | Ryo, original Iwao body, original sword and scabbard; prop associations are authored from archive identity. | Ryo and original archive-local Tom body. | Ryo, existing Yada body, original Alpha room leased for presentation. The door remains an original reference without separate moving geometry. |
| Sequence / audio / camera | Original 1,150-frame ASEQ and 39.2-second movement/camera coverage, 17 original effects, no voice commands. | Original 23.78-second camera/motion, seven original English voices and ten effects. | Original 57.35-second camera/motion, fourteen original English voices and eight effects. |
| Time / weather | Preserve weather. On acknowledgement, advance to 10:15 only if earlier; otherwise preserve current date/time. Transfer to original Tom approach. | Keep personal clock/weather. Acknowledgement transfers to the tested exterior Alpha approach; original automatic walking is condensed to saved travel. | Keep personal clock/weather. Restore exterior approach; do not strand Ryo inside unloaded room geometry. |
| Challenge / outcome | No challenge or invented insight flag. Save only meditation and reviewed travel/time. | Save only invitation and lunch-promise notebook page. No actual lunch, training or farewell result. | Save only dismissal and its notebook page. No salary, compensation, inventory grant or farewell result. |
| Cleanup / cancellation / replay | Each film uses the shared return-state, camera, actor and control leases. Cancel/preparation failure saves no own outcome and permits retry. Natural ending or supported explicit skip must be acknowledged before settlement. Completed events do not replay; already earned preceding outcomes survive cancellation/reconnect. | Same ownership and settlement rules. | Same ownership and settlement rules. |

The original automatic morning routing is deliberately condensed. A late or
reconnected personal save is not locked out by a missed 10:15 appointment and
does not jump to the following day just to reach it. No original calendar bit,
native controller state, weather or unrelated NPC schedule is fabricated.
Incidental ghost compositing, separate door callbacks and soundtrack selection
are not reconstructed by this chapter.

## Tom's lesson and farewell

These are two independent authored events after the saved dismissal. The lesson
is optional; accepting, refusing or stopping it all permit saying goodbye, but
only successful player input followed by an acknowledged ending grants mastery.

| Field | Optional Tornado Kick lesson | Farewell |
| --- | --- | --- |
| Prerequisites / trigger | Story Ryo, opening and Yada dismissal saved. Approach Tom in `MFSY` at personal11:30 or later; **Have lunch with Tom** / **Leave it for now**. | Lesson decision saved, whether learned or declined. Same Tom approach; **Say goodbye to Tom** / **Leave it for now**. |
| Original presentation | `M0W1/SEQDATA0` offer, `1` refusal, `2` acceptance, `7` double-kick demonstration, `8` success or `9` stop. Each explicitly selects its original activity rather than playing all alternatives sequentially. | Standalone `M0W1/SEQDATAB`, 2,849 frames. The combined training/farewell alternative `SEQDATAA` is deliberately not used: it would conflate learning and departure. |
| Actual gameplay | Existing server-owned challenge: **Up, Up, A, A** (forward, forward, kick, kick). Incorrect input or timeout offers retry or stopping. Waiting for or skipping a movie cannot win it. | No challenge or mastery award. The original farewell must finish or be explicitly skipped and acknowledged. |
| Poses / camera / sound | Original `M_0001.MOTN` bank16; hold the last demonstration poses and camera while input is active. A win plays four seconds of `AKI_DEKIRU_TORNADO_KICK_B_0100` before the original success scene resumes at its frame120. Original lesson speech comes from `E1021.AFS`, effects from `E1_TOMWZ.SND`. | Original actor motions/cameras, English `01TOMB` speech and `E1TOMWZA.SND` effects. The film requests `01TOMBB013.str`, absent from all three checked English `01TOM` archives; the manifest declares it unavailable instead of substituting another line. |
| Settlement | Success saves `story.s1.tornado-kick.learned`, its notebook page and the independent lesson-decision completion. Refusal/stopping saves only the declined decision. No money, item or later story grant. | Saves its own completion and notebook page, advances the personal clock to22:00 only if earlier on the same date, and removes ambient Tom from that player's Story view. It never rewinds a late save or awards training/battle outcomes. |
| Cancellation / replay | Cancelled preparation, film or practice saves none of this event's effects. Retry gets a fresh input token. Completed lesson decisions do not replay automatically. | Cancelling keeps the saved lesson but saves no farewell, nightfall or disappearance. Reload retries the uncompleted farewell; acknowledged completion does not replay. |

Source identity is pinned by `MFSY/M0W1.PKS`
(`339c4c542124a89434144981f88a7068f474a678d84ca6558baece6627c6eda1`)
and its PKF (`a06e7d5b5dd1ae6a3ce75d9bf9987a92eb0018fe4d1fd37d9473c2b6e026c4d9`).
The chapter builder profiles are `tom-lesson` and `tom-farewell`, followed by
`node tools/scripting/build_final_day.mjs` for the presentation-only challenge
poses. Generated manifests pin each voice, sound, motion and output.

The exact original `AMG_L` Tom body is reused from the lunch-invitation pack.
The source radio actor remains reference-only because the resident hotdog truck
already supplies the visible radio. Bottle assets are retained; detailed hand,
radio and native training-controller callbacks are not reconstructed. The
two-step sublesson is condensed into the existing challenge rather than a new
training-physics system. Held roots, generic two-second input windows and idle
between inputs are documented approximations. These packs do not claim a
recovered farewell music selection.

Personal disappearance is a read-only projection of existing saved server
flags. The server-owned `story_actor_presence.json` is exported to the client;
both event eligibility and scheduled-actor visibility use it. `TOM_` identifies
Tom in Dobuita and the harbor; `TOMH` is Toshimichi Fukui and is not an alias.
Owned cinematic actors, Free roam and other players' views remain unaffected.
No shared NPC record or second progress store is mutated.

Only `s1.wait.*` clock targets become standalone menu scripts. Private chapter
transitions such as final-morning rest and final night remain effects of their
own events, not independent waits. Catalogue tests guard this boundary and
slug uniqueness; a real isolated-database test verifies11:30 settlement,
cancellation, duplicate rejection, cross-character isolation and stale-save
protection, including fractional-hour world facts.

## Night confrontation

GameSpot's contemporary guide, pp63–64, orders the plane farewell, Gui Zhang's
nonlethal spar, a **Right** pipe-counter input, then their alliance before the
70-man battle. These are distinct saved events; none awards that later battle.
The existing MFBT map supplies the original battle streets.

| Event | Sources / presentation | Outcome and adaptation |
| --- | --- | --- |
| Tom's plane | `MFSY/GBTM.PKS`, original932-frame `SEQDATA0.AUTH`, `HIKOUKI` model, `01TOMC` speech and `A1_TOMBY` effects. Original bank0 sequence101 reuses canonical raw `MOTION.BIN`; the last ASEQ command is not the duration. | Confirmed after personal22:00 and saved farewell. Acknowledgement saves only plane/arrival at the original first TLYA root in MFBT. Ordinary travel condenses the automatic native transition. |
| Gui Zhang confrontation | `MFBT/TLYA.PKS`, original1,945-frame introduction, `M_TLYA.MOTN` bank16, `01TLYA`, `A1_KBTMM`. Thirty seconds of the existing client-timed nonlethal practice, then original `MFBT/KISY/M_01_H.MOTN` mutual-collapse motions. | Save only independent practice and counter approach after acknowledgement. No Gui Zhang defeat: the guide explicitly says there is no winning/losing outcome. Shared basic combat, practice duration, held collapse roots and camera are adaptations. |
| Terry's pipe / alliance | Original KISY ready/rescue motions, then `TLYB/SEQDATA2` (410frames, bank17) and `TLYC/SEQDATA3` (1,020frames, bank18). `01TLYB`/`A1_TERYB` and `01TLYC`/`A1_KAKOM` audio; original pipe model `PIPS501G` from `MFBT/TERY`. | Server QTE **Right** must succeed before rescue/retreat/team-up. Wrong/expired input retries with a fresh token. Acknowledged ending saves only counter and original battle-floor arrival, not enemies defeated, Terry interrogation or departure. |

All use the chapter pack builder. Its source pins record original archive,
motion, texture and speech identities. MFBT's `KIS_M`, `KMA_L` and `ACS_M`
bodies are byte-identical to the already reviewed Chen/rescue assets, so those
assets are reused rather than copied into another character pool. TLYC's six
original thug bodies remain package-owned. `01TLYCA004.str` and
`01TLYCC001.str` are requested by the original scene but absent from its English
archive; neither is replaced by a similarly named line.

MFBT MAPINFO (SHA256 `c0c01fc2871a282504dcb07b41bebbed5f1d8cb6ffa7927fca8c6d2b635aef48`)
explicitly groups `TLYA` with `a1_kbtmm.snd`, `TLYB` with
`a1_teryb.snd`, and `TLYC` with `a1_kakom.snd`; sound-bank selection is not
inferred from a matching number of samples. Its BGM013 and BGM084 references
reuse the viewer's exact published audio renderings. The counter has original
motions but no standalone AUTH: roots are borrowed from TLYB's initial shot,
with authored held poses, a wide camera, a two-second input window and hand/pipe
binding. TLYB's later chase close-up crops these earlier rescue motions, so it
is not reused as their camera.
Original gestures/callbacks, interleaved spar shots and exact native combat
choreography are not claimed.

Cancel, preparation failure or an unacknowledged ending saves no own result;
previously saved steps remain earned. Completed steps do not replay on reload.
The real compiler/engine verifies all three independent outcomes, missing
prerequisites, Free roam, cancellation, cancelled endings, actual30-second
practice, interruption/retry, fresh QTE tokens and wrong/expired Right input.
Exact allowed effects exclude time changes, money/items and later victories.
All three import through the official CLI in the isolated test database.

The 4.7-minute connected hardware-rendered check resumes the earned farewell:
cancel/reload/natural plane film and MFBT arrival, original introduction,
cancelled spar/reload, actual guarded keyboard practice, separate spar save,
cancelled counter/reload retaining that save, wrong/expired input and fresh
retry, accepted Right, original retreat/encirclement, cancelled ending/reload,
and natural final ending. Both BGM013 and BGM084 actually advance during their
scenes. Reload preserves the same-date battle-floor arrival, releases controls
and replays nothing; ¥22,836 and eight inventory entries are unchanged. The
plane-farewell captures show Ryo and sky; aircraft visibility has not been
separately established from those captures.

A further3.8-minute connected continuation from the separately earned plane
save verifies the corrected wide counter camera and Story/exploration boundary.
Captures show all three counter actors and the attached pipe, their changed
rescue poses, original encounter cast and crowd, and no local practice HUD.
The map's old exploration encounter is now inactive in Story mode instead of
running alongside server-owned fights. Unit checks preserve local practice
when switching back to Free roam on the same map. No future outcome was
inserted into either earned checkpoint; both isolated saves are backed up.

## Seventy-man battle

The contemporary guide (printed pp64–65) establishes **70 opponents including
three bosses**, with Gui Zhang fighting beside Ryo. `story-s1-seventy-man`
continues the separately saved pipe counter/alliance. It uses the existing
Yarn event, client combat simulation, original-model actor adapter and music
director; it is not another quest engine or a reconstruction of native AI.

| Field | Integration |
| --- | --- |
| Admission | Story Ryo, completed opening and saved `story.s1.final-pipe.completed`. Approach/recovery bounds include the original encirclement arrival and the existing clear practice floor in MFBT. Explicit **Fight the Mad Angels** / **Leave it for now**. No additional weather or exact-minute gate. |
| Arena / cast | Original MFBT geometry; declared relocation to the already rendered clear floor at browser `[-23.4,0,65.8]`. Original Ryo/Gui Zhang, eight ordinary model slots and the three named bosses. The model pool is prepared once, with no 70-rig load or per-wave asset fetch. |
| Original assets | Disc3 `MPK00.PKS` supplies seven resident small bodies; `BATTLE70.AFS` supplies BTC_S and its texture pack. Source hashes and exact member/output identities are pinned in the generated manifest. Existing Chen/rescue model assets supply Gui Zhang and bosses. `MAPINFO.BIN` names BGM120; use its existing viewer rendering through the shared music director. Looping the finite three-minute rendering is an adaptation. |
| Actual challenge | Ten cohorts contain67 ordinary opponents and three bosses, all requiring actual client-simulated knockouts. Enemy health/damage, cohort composition, two active attackers, basic AI and shared moves are authored balance. Ryo and Gui Zhang retain health between groups. Gui Zhang cannot be knocked out in this adaptation; Ryo can. The existing short recovery remains available. |
| Reinforcements / bosses | Stable render tags carry a server spawn revision; new fighters reset position/health/action state, not the encounter token or friendly health. Unused roots are hidden, not moved underground. Shingo, Pedro and Satoshi arrive in cohorts4,7,10 with a brief held stance and camera framing. These are **not** their original entrance films or individualized movesets. |
| Presentation | Original models, existing named original motions and player-controlled combat camera. The existing dialogue panel shows actual defeats out of70 and the current group. After all70 KOs, a two-person original-asset tableau and explicitly authored unvoiced caption acknowledge the result. Preserve personal weather/date. |
| Settlement | Only acknowledged victory sets `story.s1.seventy-man.completed`. No yen, item, calendar jump, Terry interrogation, Hong Kong clue, parting gift or departure is awarded. The later Terry QTE is a separate event. |
| Exit / failure / replay | Shared cleanup restores avatar/camera/controls and stops only this fight's temporary music. Defeat/timeout permits a fresh-token retry. Cancellation, lost preparation or a cancelled ending saves no battle win; preceding alliance remains earned. Completed wins do not replay automatically. Partial enemy counts are ephemeral, not a second save store. |

`node tools/scripting/build_final_battle.mjs` extracts/pins bodies and builds
ordinary scene data, followed by the existing combat and investigation
generators and `scripts/check-server-contract.mjs --sync-scripting`. It does
not infer spawns or AI from arbitrary archive order. Original MAPINFO's simple
character-placement record contains Ryo, not a recovered70-man roster.
The unused generic `M_EXBS.MOTN` bank is not required to implement the fight.

The shared rescue-cast producer previously swapped Terry and Satoshi's bodies.
The project's extracted character table explicitly maps Terry/TERY to ACS_M,
Satoshi/STSI to KMA_L, Shingo/MRSK to PPL_L and Pedro/PEDR to JNC_L. The
canonical producer now uses those associations for **all** its consumers;
there is no battle-only model override. This is character-table provenance,
not a claim of recovered native battle dispatch.

Focused simulation/compiler tests verify all70 actual KOs and all three
bosses, preserved friendly health/token, slot lifetime resets, no friendly
fire, malformed-wave rejection, missing prerequisites, Free roam, decline,
partial cancellation, timeout/retry, stale token, cancelled victory ending
and exactly one independently acknowledged flag. Frontend tests verify
pooled visibility, snap rather than corpse interpolation, boss framing without
orbit lock, authoritative counters and owned music cleanup. Arrival animation
clocks also reset at each new lifetime, rather than inheriting the fight's age.

The4.4-minute connected hardware-rendered check resumes the genuinely earned
alliance. It verifies declining, actual partial combat, cancellation/reload,
fresh-token retry, all ten groups and all three bosses, real keyboard movement,
guard/kicks, circling and natural health recovery, the victory acknowledgement,
independent saved completion and reload without replay. Original BGM120 is
actually fetched/playing; ¥22,836, eight inventory entries and the personal
date remain unchanged. Captures show original battle bodies, Ryo/Gui Zhang,
the victory tableau and restored gameplay. Crowded arrival shots can partially
occlude a boss; these are not claims of exact original entrance choreography.
A separate run exercised actual defeat without awarding victory. The earned
database is backed up; no future flags or challenge outcomes were inserted.

The corrected Terry/Satoshi package associations are asset/contract checked;
earlier recorded rescue/night-film captures predate that correction. The new
battle renders Satoshi's corrected model, but does not reverify every shot of
the earlier films. No assets have been published or uploaded.

## Terry and the last night

The contemporary guide's printed p65 places a final **A** response after the
70-man victory, Terry's interrogation, a discussion with Gui Zhang, home at
05:21 and sleep until08:30. Three separate authored Yarn events now implement
those boundaries using the existing challenge, scene and atomic save systems.
None grants gifts, Swallow Flip, the later Chai battle or departure.

| Field | Terry's last attack / interrogation | Gui Zhang / home | Departure rest |
| --- | --- | --- | --- |
| Admission / trigger | Story Ryo, completed opening and independently saved70-man victory. Confirm **Confront Terry** within the tested MFBT battle/recovery floor. | Separately saved interrogation. Same recovery floor; confirm **Speak with Gui Zhang**. | Saved post-battle discussion/home return. Existing rendered bedroom bedside bounds; **Sleep until 8:30 a.m.** / **Stay awake**. |
| Original presentation | `MFBT/TERY.PKS`: `SEQDATA0` approach (575frames), `SEQDATA1` success (997), `SEQDATA2` interrogation (1,200). Banks25/16, original Ryo/Gui Zhang/Terry bodies, pipe, movement and cameras. | `MFBT/TLYE.PKS`: 1,520-frame `SEQDATA2`, bank32, original `MAP_TLYE.MAPM` pier and its texture pack. Original actors/cameras/voices. | No film or invented dream. The original sleep/wake transition is condensed to a confirmed ordinary personal-clock save. |
| Challenge / timing | Actual server-owned **A**, with the existing generic two-second window. Existing keyboard mapping is Enter for A and Shift for B. A completed film or continue acknowledgement cannot win it. Wrong/expired input plays the original losing motion fragment, then retry/leave. | No challenge. Natural completion or supported explicit skip must be acknowledged. | No challenge or animation-completion reward. The explicit sleep choice owns settlement. |
| Source poses / props | Hold exact approach-end motion samples via the existing named-motion `elapsedSeconds`. The source success film begins Ryo/Terry's clip at frame272; a nine-second original winning fragment precedes it. Original failure clips last220/164frames. Held roots, wide camera, frozen Gui Zhang, hand/pipe binding and retry choreography are authored, not recovered QTE callbacks. Detailed pipe hand transfer is not claimed. | The gameplay MFBT layer excludes `MAP_TLYE`. Reuse the same package-owned scene-object loader and lifetime as the original Alpha room; no second renderer or permanent world mutation. Its original roots/camera are not invented gameplay spawns. | Preserve ordinary avatar/camera/room ownership; no bags, farewell gestures or next chapter are fabricated by the clock transition. |
| Audio / environment | Original `01TLY` / `01TLYD` speech and `A1_PIPEQ` / `A1_TLYD` effects. MFBT MAPINFO explicitly names these resource clusters and BGM120. Preserve personal date/weather. | Original `01TLYE`, `A1_TLYE` and BGM106, explicitly grouped in MFBT MAPINFO. Preserve date/weather during presentation. The finite viewer music rendering loops as an adaptation. | No new audio or weather override. |
| Durable result | Only acknowledged successful interrogation saves its independent milestone and the Hong Kong notebook page. No time, travel, money or item grant. | Only acknowledged ending atomically saves its own milestone, the next05:21 and the established bedside destination. Late saves never rewind; an already passed/exact target uses the following date. | Independently save the next08:30 and bedside destination with the rest milestone. Early05:21 saves wake on the same date; late/exact08:30 saves use the next date. |
| Cleanup / replay | Failure, cancellation, failed preparation or a cancelled successful ending saves nothing from this event; earned70-man victory remains. Retry gets a fresh token and rejects stale input. Completed interrogation does not replay. | Cancellation restores the battle-floor context and hides/releases leased pier geometry. Saved interrogation remains; no home return occurs. Reconnect retries only an uncompleted event. | Stay/cancel before selection changes nothing. Completed rest does not replay or repeatedly advance the date. Earlier outcomes remain earned. |

The canonical chapter pack builder pins the original TERY archive
(`108f7026e765552e93a8b3d6974d60a682aba59390cb9933b4bdfa313c9edc07`)
and TLYE archive
(`470c9c4ef3ac227ed6ed3c9ffa9328816b948dec88dcefba8a88e3f58e2896fc`).
Each generated manifest records exact source members, motions, textures,
speech/effects and output hashes. The geometry descriptor generalizes the
existing Alpha-room path without changing its generated assets.

The successful Terry film requests `01TLYB007.str` and `01TLYB008.str`, absent
from all six checked English01TLY archives. They remain explicitly unavailable,
with no replacement voice or fabricated subtitle. Four approach voices,
four available success voices, twelve interrogation voices and thirteen
Gui Zhang voices are extracted normally. The QTE authority does not depend
on reconstructing the original controller or recovering absent English audio.

Focused real-compiler/engine tests cover admission, Free roam, incomplete
opening, wrong bounds, completed events, decline/cancel, wrong/expired A,
fresh retry/stale token, cancelled endings and exact independent effect sets.
Clock checks include same-date targets, exact passed targets and year-boundary
rollover without rewind. Asset checks pin original banks, unavailable voices,
leased geometry, held source samples and selected outcome durations.
The 5.4-minute sequential hardware-rendered continuation resumes the genuinely
earned 70-man victory. It verifies decline/reload, original approach playback,
live cancellation, the held A prompt, wrong B input, expiry, fresh retries,
actual A input and the original outcome/interrogation films. Cancelling that
ending grants no clue; the retry finishes naturally and saves only the
interrogation and Hong Kong notebook page. Separate pier cancellation/reload
and natural completion verify the original actors and geometry, advancing
BGM106 playback and successful music responses. Only then does the character
arrive home at the next 05:21. Stay-awake/reload and the separate sleep choice
verify the 08:30 save. Final reload restores bedside gameplay without replay.
Money remains ¥22,836, the same eight inventory entries remain, and no final
Chai, gift, training or departure result is inserted. The earned database is
backed up independently of the prior battle save.

Rendered checks exposed two presentation defects. The original opening camera
position/FOV now replaces an arbitrary QTE offset that placed the lens inside
a container; its target is reframed toward the held cast. Standalone package
cleanup now hides cached room fixtures after completion, cancellation and
failed preparation while retaining outer-program ownership between shots.
This is shared by the Alpha-room and pier paths; regenerating the three Alpha
profiles leaves their original asset manifests unchanged. Captures verify the
QTE cast/pipe, original interrogation, pier conversation and restored bedroom.
Held-root outcome fragments still approximate spacing, contact and detailed
pipe hand transfers; the captures are not proof of exact original choreography.

## Family departure

| Field | Authored event |
| --- | --- |
| Prerequisites / trigger | Story Ryo, opening and independently saved departure rest. At the established bedroom bedside, confirm **Leave for the harbor** or **Stay in Yokosuka for now**. No exact-hour or calendar lockout. |
| Original presentation | Disc3 `YDMA/MAPINFO.BIN`, embedded TRCK `0x56dc`, 39,616 bytes, 2,328 frames / 77.62 seconds. Original `M_0180.BIN` bank22, Ryo/Fuku/Ine camera and movement tracks, seven `A0180` English voice cues and ten `A1_KSTAB` effects. |
| Actors / gift | Original Fuku and Ine bodies are byte-identical to the shared assets already used. Fuku delivers a gift from both of them; Ine's farewell is silent. `ABAG` uses the original `RBGS503G.MT5` bag with its original movement curve. Bag association, deformation and detailed grips are adaptations, not recovered native callbacks. |
| Scenery / lighting | Ten renderable `YDMA.PKS` maps and original `YDMA.PKF` textures are temporary package fixtures. The eleventh resource, `MAP08`, contains 89 untextured shapes omitted by the shared visual loader; its collision/trigger purpose is not inferred. It is pinned as source evidence, not a required visible object. Existing isolated-stage ownership hides/restores bedroom scenery and borrows daytime preset 0. This is a cinematic stage, not a new saved world or second renderer. Native conditional layer/weather control is not reconstructed; the personal calendar/weather state is unchanged. |
| Music / timing | YDMA MAPINFO names BGM107 and `A1_KSTAB`. Reuse the existing viewer rendering through the shared music director. Starting music at the film boundary and looping its finite rendering are authored cue choices. Original camera, motion and voice timing remains intact. |
| Challenge / settlement | No challenge. Acknowledged natural completion or supported explicit skip atomically saves only `story.s1.family-departure.completed`, its notebook page and the established harbor bus arrival. The original source does not identify the gift's contents: no named possession or cash amount is invented. No Swallow Flip, Chai victory, letter or ship departure is awarded. |
| Exit / cancellation / replay | Following Dobuita walking/commuting is condensed to existing saved travel. Cancellation or failed preparation restores bedroom scenery, Ryo and controls, with no farewell or harbor outcome. Retry reuses the shared asset cache safely. Completed reload does not replay or duplicate a gift/reward. |

Original source pins: YDMA MAPINFO
`7dc07d2539f818589896f8a0642d8e9aa586c579e53e0088c6a8312d5d3aaf87`,
selected AUTH `8c2cac4b9757ad79d905affbc679d14160a07cff9a8ac4a0bd1dd842eed6c855`,
motion `0d3483e4cf3fa8638d86e1f5812eb75e5fa41f2da62ff00054a2fd6ec0adbc83`,
YDMA.PKS `ac19788f08f8f6df0c6fc967252660f389aa835dfa1da17e77cd5ed7e7ab72a8`.
The canonical home/ticket chapter builder's `family-departure` profile pins
textures, speech/effects and individual generated outputs too.
The contemporary guide's broad description of two parting gifts does not
override the original scene's single delivery on behalf of both people.
No separate invented Ine-san speech is added.

Compiler and asset checks cover admission, late saves, decline, cancellation,
acknowledgement and the exact independent effects. Two sequential connected
rendered continuations (2.9 and 2.7 minutes) resume the genuinely earned
departure-rest save, without inserting later flags or dates. They verify
decline/reload, ten enabled original scenery fixtures, live cancellation,
restored bedroom/scenery/controls, retry and the film's natural ending.
BGM107 actually advances with successful audio responses. Only then are the
farewell, notebook page and harbor arrival saved; completed reload neither
replays the film nor locks controls. The personal date, ¥22,836 and the same
eight inventory entries remain unchanged, with no final Chai or ship result.

Reviewed captures show Fuku-san and Ryo at the original gift exchange,
Ine-san's silent final prayer, the restored bedroom after cancellation and
Ryo's harbor arrival. The initial captures missed the relevant actor shots;
the second continuation captures them at approximately 16 and 72 seconds.
These establish visible actors and scenery, not exact gift-object contact,
bag deformation, facial animation or native conditional snow/layer behavior.
The earned family-departure database is backed up separately from the prior
rest checkpoint. No source assets have been uploaded.

## Swallow Flip

Connected earned-save gameplay is rendered and verified. A separate short
presentation review confirms the grounded bag and restored gameplay.

| Field | Authored lesson |
| --- | --- |
| Location / admission | After the independently saved family farewell, confirm **Meet Master Chen** at the tested harbor bus approach. Ordinary Story travel saves arrival at the first original `M0W0/SEQDATA0` Ryo root in `MEND`. A separate confirmed lesson begins there. Incidental walking is condensed; admission grants no mastery. |
| Prerequisites / time | Story Ryo, completed opening and saved harbor admission. No exact-hour or date lockout. Preserve personal weather, date and time rather than resetting the public world. |
| Cast / props | Reuse original Master Chen and Gui Zhang bodies. Original `MEND/MODELS` bag and iron piece follow source scene-object tracks. The carried alternate bag root remains reference-only: without native hand/swap callbacks it otherwise draws a second floating full bag. Keeping the grounded original bag, associations and detailed contact are explicit staging adaptations. |
| Films / audio | Original `M0W0/SEQDATA0` introduction, `1` form demonstration, `5` successful flip, `6` praise and `8` learned exit, with `M_01CHY.MOTN` bank16, `E1016` English speech and `A1_CHINW` effects. Original MAPINFO names BGM064; use the exact Disc3 viewer rendering, not the different same-numbered Disc2 bank. These are branches, not a playlist of every source alternative. |
| Challenge | Original back+X then A is adapted to the existing sequential **Down, X, A** challenge, with two-second windows. Keyboard J represents the original X/punch and preserves physical X for cancellation. Touch buttons send the same server-owned codes. Native free-spar parry timing and simultaneous back/punch are deliberately condensed. Wrong/expired input offers retry or stopping without mastery. |
| Presentation | Hold original demonstration-end actor poses in a wide authored camera during input. Actual accepted success plays the original flip and praise, then offers further practice or the original learned exit. Movie completion/skip alone cannot pass the challenge. |
| Settlement / exit | Only successful input followed by acknowledged exit saves lesson/mastery and its notebook page. No money, inventory, future Chai/QTE/letter/ship outcome or clock change. Remain on the harbor departure map. |
| Cancellation / reload | Cancelled preparation, films or prompts save no lesson outcome and restore prior gameplay/camera/controls. Cancelled entry travel remains at the bus approach. Already saved arrival survives lesson cancellation; completed mastery must not replay on reload. |

Source archive `MEND/M0W0.PKS` is
`393506f002d2a7360856b4af44e918c8df2c55166bec93a18d657136eb0509c2`.
Its original speech confirms the introduction, form and timing explanation.
The flip's `E1016C005.str` is present with an empty subtitle. A preliminary
text-only lookup mistook the empty field for a missing resource; the canonical
audio extraction and original archive entry prove otherwise. Retain its audio
without inventing subtitle words. All 36 requested voices resolve.
The ordinary MEND world uses existing extracted scenery through the shared
world loader. Initial layer selection uses MAP.PKS/base scenery and one
daytime ground alternative; native conditional scene initialization is not
claimed. Original ship/alternate ending layers are excluded from this floor.
The shared harbor water-plane policy now includes MEND for both game and viewer;
this avoids an unrendered sea beyond the dock without inventing a separate
departure-only water implementation.

The 5.2-minute sequential hardware-rendered continuation starts from the
genuinely earned family-farewell database. It verifies decline/reload, ordinary
confirmed MEND admission, saved dock/reload and real ground support. Original
introduction cancellation restores gameplay without mastery; retry plays the
introduction and demonstration naturally with advancing BGM064 playback.
Wrong and expired inputs require fresh retries. Real Down/J/Enter input plays
the original successful flip and praise. Cancelling the exit still grants
nothing; retry with explicitly skipped introduction/demonstration must pass
the actual challenge again before the natural exit saves mastery and notebook.
Final reload restores controls without replay. Date, ¥22,836 and eight inventory
entries are unchanged, and no final Chai or ship outcome is inserted.

Reviewed captures show the original Chen/Gui Zhang/Ryo cast, the form
demonstration, all three actors in the held challenge shot and Ryo's successful
throw. Original close camera/contact detail is not claimed to be pixel-exact.
The ordinary dock arrival and earned-save database are preserved independently
of the preceding family checkpoint. All 36 source voices and 34 effects resolve;
no source assets have been uploaded.

A separate 34.5-second renderer-only review after the earned lesson confirms
one grounded original bag, all three actors and restored dock controls. It
leaves saved flags, money and inventory unchanged; it is not another narrative
win. Shared environment tests verify the MEND water-plane policy for both
consumers; these captures do not establish the water's appearance from every
camera angle.

## Final Chai

Connected earned-save gameplay is rendered and verified, with independently
saved battle and counter outcomes.

| Field | Final fight | Last attack |
| --- | --- | --- |
| Location / prerequisites | Original MEND dock after independently saved Swallow Flip. Confirm **Stop Chai**; no exact-hour/date gate. | Original questioning-end waterfront pose, after independently saved final fight. Confirm **Face Chai's last attack**. |
| Presentation / cast | Original `CHAIAUTH/SEQDATA3` beam ambush, shared original Chen/Gui Zhang and Chai bodies, source iron-piece movement, `M_0184.MOTN` bank16. Actual fight follows. Original `SEQDATA0` questioning plays only after actual knockout. | Original `SEQDATA1` second attack, held source end samples in a wide authored camera, actual **Down/A/A/B** and original short `SEQDATA6` water-fall ending. Selection of that short ending is authored, not a recovered native QTE branch controller. |
| Gameplay | Shared client combat and moves; Chai must actually reach zero health. Player100/Chai160 health, basic AI, speeds and arena padding are explicit balance adaptations, not the original low-kick/leaping moveset. Defeat, timeout and cancellation grant no victory; retry starts a fresh attempt. | Existing server-owned four-input challenge; two-second windows and fresh retries. Wrong/expired input offers retry or leaving, not success. Finishing/skipping the lead-in cannot win it. |
| Audio / weather | Exact English A0184/A0184B ambush and A0184D questioning, A1_SAIB/A1_MOMOR effects. MEND names BGM032 and BGM067; choosing BGM032 for this encounter and its film cues is authored, not recovered cue timing. Preserve personal calendar/weather. | Original A0184D speech and A1_MOMOR effects; same authored BGM032 cue policy. Preserve calendar/weather. |
| Settlement | Only actual knockout plus acknowledged questioning saves `story.s1.final-chai.completed`, its notebook and original questioning-end waterfront arrival. No counter, money, item, date change, introduction letter or ship outcome. | Only all four accepted inputs plus acknowledged ending saves `story.s1.final-chai-counter.completed` and its notebook. Prior battle survives cancellation/reload. No letter or ship departure. |
| Cleanup / recovery | Shared presentation, combat and travel ownership restore camera, actors and controls. Cancelled/failed preparation or ending remains retryable. Completed battle does not replay or require another knockout. | Same ownership; failed/cancelled attempts remain retryable without erasing the saved battle. Completed counter does not replay. |

Source `MEND/CHAIAUTH.PKS` is
`996524cfb8bdb5996b27b05e1de01af5df3c969824d888a18da639afbd32ce19`.
Original `MEND/MODELS` Chai is byte-identical to the shared `CHA_M` body; no
new character identity or donor model is needed. The ambush requests generic
`01m046000038.str`, unresolved in the selected English archives and published
dialogue catalog. It remains explicitly unavailable, without an aliased cry
or invented subtitle. The shorter original archived ambush is selected rather
than the longer raw SEQDATA3 variant requesting additional absent English IDs.
Detailed beam/body contact, native QTE timing and combat AI are not reconstructed.

The 2.9-minute sequential hardware-rendered continuation resumes genuinely
earned Swallow Flip. It checks decline/reload, ambush cancellation, partial
keyboard combat/cancellation/reload and a real knockout followed by cancelled
questioning without a saved victory. A fresh real knockout and the natural
original questioning then save only the battle, notebook and waterfront
arrival. Counter decline and cancelled preparation retain that battle through
reload. Wrong and expired input require fresh retries; actual Down/Enter/Enter/
Shift input precedes both the cancelled winning film (no outcome) and the
naturally completed winning retry. Reload preserves both separate outcomes,
correct dock ground and released controls without replay. Date, ¥22,836 and
eight inventory entries remain unchanged; no introduction letter or departure
is inserted. Original BGM032 playback advances with a successful audio response.

Reviewed captures show the beam ambush, Chai/Ryo in actual partial combat,
original questioning and both actors in the held input shot with visible
harbor water. A separate 10.5-second renderer-only check after the earned
counter confirms the original late falling pose beyond the dock edge and
restored gameplay without changing saved progress, money or inventory. The
subsequent capture is already back in gameplay; it does not prove a splash or
exact water-entry effects. Detailed contact, fingers and native facial/particle
callbacks remain presentation limits, not substitutes for the actual fight
and input. The earned save is backed up separately from the preceding lesson;
no source assets have been uploaded.

Real compiler/engine tests require actual simulated knockout and all four
inputs, with separate acknowledged endings. They cover admission, decline,
cancelled preparation/fights/films, real defeat, timeout, fresh retries and
stale challenge tokens. A repeated stale A cannot consume the second A.
Exact settlement assertions exclude future story, economy or date changes.

## Chen's introduction letter

Connected earned-save gameplay is rendered and verified.

| Field | Letter event |
| --- | --- |
| Location / prerequisites | Verified MEND waterfront approach, after the separately saved final Chai counter. Story Ryo, opening complete; no exact-hour/date lockout. Confirm **Speak with Master Chen** or **Not yet**. |
| Original sequence | `CHAIAUTH/SEQDATA4.AUTH`, 2,638 frames, SHA256 `800404401da84f36fe6c1db6a71e635f49adfd433a9ac902d7b0fe00d316425c`; shared `M_0184.MOTN` bank16. Original Chen, injured Gui Zhang, Ryo, receding Chai and bag movement/cameras. The model association for BAG0 is authored; envelope hand callbacks are not reconstructed. |
| Dialogue / audio | All eleven requested `A0184C` English records, including an empty-subtitle voice, and original `A1_MOMOR` effects. Dialogue names Tao Li Shao and an enclosed address; no address is invented. BGM067 appears in the original MEND resource cluster; its film-entry cue is authored. |
| Time / environment / challenge | Preserve personal calendar, weather and the shared MEND scenery/water. No challenge: original conversation playback is not a battle or ship result. |
| Settlement | Acknowledged natural completion or supported explicit skip atomically grants one `letter_of_introduction`, `story.s1.chen-introduction-letter.completed` and `notebook.s1.tao-li-shao`. Distinct from Iwao's earlier Chinese letter. No currency, time jump, destination or ship/S2 outcome. |
| Exit / failure / replay | Restore the prior dock pose, camera and controls; the original end walk is condensed. Cancellation or failed preparation grants nothing and is retryable. Prior battles/counter remain saved. Completed re-entry/reload cannot replay or grant a second letter. No dedicated letter icon is claimed; the existing inventory shows the item's name and description. |

Generate with `node tools/cutscenes/build_harbor_job_pack.mjs --profile chen-introduction-letter --audio`.
Original `A0184C.AFS` is pinned by
`857f3a7e3df67fbfcfcf464fcae753613cdb81c97fcfb8042568e5e66c89627d`;
source/output identities are retained in the generated manifests. No original
controller reconstruction, alternative quest state or asset upload is required.

The 2.3-minute sequential hardware-rendered continuation begins from genuinely
earned counter completion. Decline/reload, the original conversation,
cancellation without a letter, retry, advancing BGM067 playback, the natural
ending, visible inventory entry and completed reload all pass. Only one letter
and its two flags are saved. The eight existing inventory entries, including
Iwao's Chinese letter, and ¥22,836 remain unchanged; the personal date is not
advanced. Database inspection independently finds exactly one letter-grant
economy record. Controls return on the tested waterfront floor with no replay,
ship or S2 outcome. The earned save is backed up independently.

Reviewed captures show Chen and Ryo in the original Tao Li Shao shot, its
original subtitle, the named inventory entry and restored dock gameplay.
They do not establish an envelope mesh, exact finger contact or every injured
Gui Zhang shot. The first browser run completed the narrative but failed on
role-based Inventory discovery; a short completed-save check and the full
rerun use the actual existing button ID. This is the documented persistent
[Settings accessibility limitation](../implementation/README.md#settings-input-and-modal-lifetime-limitation),
not a letter save or movement-lock failure. No global ARIA override or Settings
input remount was added. Ten focused asset tests and the real compiler/engine
checks cover original identities, all available speech, admission, decline,
cancellation and the exact one-letter/two-flag acknowledgement.

## Nozomi's amulet memory

Connected earned-save gameplay is rendered and verified.

| Field | Authored recollection |
| --- | --- |
| Location / prerequisites | The tested MEND waterfront approach after the independently saved introduction letter, with actual possession of that letter. Story Ryo and opening complete; no time/date lockout. Confirm **Remember Nozomi's farewell** or **Not yet**. |
| Original presentation | `MEND/NZOM.PKS`, original `SEQDATA0.AUTH` (4,187 frames), `M_01JN.MOTN` bank21 and archive-local `NZM_M` Nozomi. Its original `MAP.MAPM` and textures are temporary room fixtures; the existing isolated-stage lease hides/restores the resident dock. No second world loader or substitute street is added. |
| Dialogue / audio / camera | All 27 original English `01JIN` voice records, seven unique original A1_NOOMA effects and original motion/camera timing. Dialogue explicitly gives the amulet and discusses Hong Kong and Canada. The MEND resource cluster names BGM070; beginning it at film entry is authored cue timing. |
| Time / environment / staging | Remember the farewell before the separate ship ending rather than at the original departure's flashback point. This is an explicit staging adaptation, not an earlier-calendar visit or a recovered trigger. Preserve personal date/weather/time; the temporary scene uses the established daytime light preset. Detailed amulet/envelope meshes, finger contact, facial callbacks and exact historical lighting are not reconstructed. |
| Challenge / settlement | No challenge. Only acknowledged natural ending or supported explicit skip saves `story.s1.nozomi-amulet.completed`, `notebook.s1.nozomi-amulet` and one `nozomi_amulet` through existing atomic inventory settlement. Do not replace/duplicate the introduction letter or award money, time, travel, ship or S2 progress. |
| Exit / cancellation / replay | Restore the prior dock, avatar pose/camera and controls. Cancelled/failed preparation or playback grants no amulet and permits retry. Already earned letter and battle/counter saves survive. Completed re-entry/reload cannot replay or grant another amulet. No dedicated inventory icon is claimed. |

Generate with `node tools/cutscenes/build_harbor_job_pack.mjs --profile nozomi-amulet --audio`.
The stage compiler is shared with the earlier family departure; its deterministic
regeneration must leave that earlier manifest unchanged. Original resources and
output identities are pinned in the manifests, with no source-asset upload.

The three-minute sequential hardware-rendered continuation resumes the genuinely
earned introduction-letter save. Decline/reload, original Nozomi/shrine playback,
cancellation restoring the dock with no amulet, retry, advancing BGM070 playback,
the full natural farewell, visible inventory entry and completed reload without
replay pass. The nine existing possessions, including both earlier letters,
¥22,836 and personal date remain unchanged. Only one new amulet and its two
flags are saved; database inspection finds exactly one corresponding item-grant
record, no departure flag and quantity one for both letters and the amulet.
Controls return on the tested dock floor; temporary shrine scenery does not
remain after cancellation or completion. The earned save is backed up separately.

Reviewed captures show Nozomi's archive-local body at the original shrine,
Ryo/Nozomi in the handover gesture, restored dock after cancellation, the named
inventory possession and restored gameplay after reload. The actual amulet
mesh is not present in the handover capture; hand-object/facial callbacks,
historical lighting and a dedicated inventory icon remain explicit fidelity
limits. Neither rendered gesture nor movie completion can count as ship
departure. Compiler/engine tests share the earlier keepsake boundary and require
the independently earned letter flag and actual letter possession, then the
exact one-item/two-flag acknowledgement. Cancellation grants nothing and keeps
the letter. No new state store or native-controller reconstruction was added.

## Boarding and sailing

This is one confirmed ordinary Yarn event after the independently saved letter
and amulet. Earlier training, battles or keepsakes cannot substitute for the
ending. The generator translates the definition; no new quest engine or native
ending controller is introduced.

| Field | Definition |
| --- | --- |
| Prerequisites / trigger | Personal Story Ryo, completed opening, saved Chen letter and Nozomi amulet milestones **and actual possession** of both items. Same verified waterfront approach, **Sail to Hong Kong** / **Not yet**. No exact-hour or late-date lockout. |
| Sequence | Original `TRAPAUTH1` boarding, then a reviewed selection of `ENDAUTH1`, `7`, `8`, `9` in the same canonical multi-shot program used by the ride home. Music, cast and scenery retain one lease between sailing shots. File order is not proof that every extra/family/flashback alternative belongs in one playlist. No invented English dialogue. |
| Actors / motions | Original Ryo boarding `M_0180.MOTN`, not the smaller resident `M_0180.BIN`; sailing uses external `M_01156.BIN`, bank16 indices13 (Ryo) and8 (Chen), the original ship `B05K206G` and bird `KMH02A3G`. Only selected motion values are parsed; an unrelated unused wing sequence still fails parsing and is not concealed by a fabricated replacement. |
| Scenery / camera | Boarding uses the resident dock. Sailing borrows the original ENDMAP geometry through the shared isolated-stage/fixture lease, hiding the resident hull. `MAP03` is selected, with real alternate `MAP04` explicitly hidden rather than mislabelled non-visual. Original cameras/root movement are retained. The final ship-only shot uses the existing NPC-only actor lease to hide and restore the gameplay avatar. |
| Sound / lighting | Original five boarding effects from `A1_SHUKO.SND`, three sailing effects from `A1_END.SND`; no speech is requested. Original resource-cluster BGM095 is reused, with authored film-entry cues. Broad daytime stage lighting is authored; personal date/weather are not rewritten. |
| Completion | Acknowledged boarding and completed sailing program save `story.s1.departure.completed`, `notebook.s1.departure` and `s1.departure.ship-deck` together. No new item, money, personal date jump, S2 arrival or S2 story outcome. Supported explicit skip may finish the noninteractive sailing program; cancellation/preparation failure cannot. |
| Exit / recovery | A saved, grounded epilogue aboard the original ship in its local frame, rather than a return to shore. Free roam retains its separate exploration context. Cancellation or preparation failure at any shot preserves the earned dock checkpoint and permits retry without duplicating prior keepsakes. |

Source identity is pinned by the generator and generated manifest:

- `MEND/TRAPAUTH.PKS`: `7999c35b3d0caf136f56aba260beaa01c6c6d257e2e3a17ba4f857430f3c1373`.
- `MEND/ENDAUTH.PKS`: `e2c64bb5800b4e1fcc383db5e93855a10f4086b41f2f7356f41528e366815cac`.
- `MEND/M_01156.BIN`: `600154cdb0e421f1335bcbc2acb4a06acfe930515c8e77e57d87438927ccd7d7`.
- `MEND/ENDMAP.PKS`: `a2471208d4295d930f75b5583555b4c09f41c84ea844ce78672a4eb4368a2da4`.

Generate profiles `ship-boarding` and `ship-sailing` with the existing chapter
builder and `--audio`, then run the existing activity-preview compiler and
`python3 -m tools.scripting.build_native_event_program_pack --refresh-activity-previews`.
That narrow canonical refresh updates only authored AUTH programs and runtime
shards, preserving the unrelated native closures and their source receipt; it
does not reparse the 857-MiB research IR. Native route/IR changes still require
the ordinary full compiler. The shared stage helper now returns explicit visibility
states; home farewell and Nozomi continue to use that same path. A direct motion
source is validated/copied with its exact provenance; voiceless films do not
require a fictitious speech archive.

The terminal `s1-voyage` world uses **only** original `S3_MEND_B05K206G.MT5`.
Its X/Z derive from the last ENDAUTH8 Ryo root transformed into the last ship's
local frame. The cinematic root is above the deck (`11.47348` local Y), so
ordinary idle arrival is projected onto the actual deck (`6.277687`), not left
floating. Water is also normalized from the source frame. This frozen local
epilogue is an explicit adaptation, **not** an extracted arrival record. A
declared custom-geometry world uses its visible terrain/collision, not the
source harbor's unrelated dock COLI. The existing world loader, spatial index,
collision and avatar controller are reused.

Extra passengers' bank2/201, wing animation, exact original flashback
interleaving, smoke/wake effects and native ending music callbacks remain
unreconstructed. They do not become fabricated gameplay outcomes. S2
continuation is outside this S1 ending; the later feasibility audit must say
which S2 presentation and narrative inputs are actually available.

### Boarding and sailing verification

The real Yarn compiler/engine checks both keepsake flags and possessions,
incomplete opening, Free roam, wrong bounds, completed events, decline,
cancellation before boarding/ending acknowledgement and exact allowed effects.
The new shipboard destination also participates in the existing real-time
arrival-fencing test: stale dock packets cannot overwrite its first arrival.

The 3.5-minute connected hardware-browser test
(`NEW_YOKOSUKA_SHIP_DEPARTURE_E2E=true`) resumes the genuinely earned amulet save.
It declines, cancels original boarding, reloads/retries, renders deck and moving
ship shots, cancels during Chen's farewell, then reloads/retries and finishes
all original selected shots naturally. It verifies actual BGM095 playback and
that its playhead advances continuously between sailing shots. Reviewed
captures show Ryo boarding, the original ship/harbor, Chen, Ryo on deck and the
horizon shot. The final two flags and grounded `s1-voyage` arrival save together.
¥22,836, all ten inventory entries and the personal date remain unchanged;
ordinary movement, stable deck support, completed reload without replay and
the actual sidebar Free roam/Story round trip pass. No future flags, dates or
destinations were inserted into the earned QA character. That database is backed
up separately from the pre-departure save. No assets have been published.

A separate 56-second browser continuation with `NEW_YOKOSUKA_SHIP_SKIP_E2E=true`
starts from another earned pre-departure clone, cancels/reloads the program,
uses real X input to skip boarding and sailing, and repeats grounded save,
reload and mode-switch checks. It runs without the temporary standalone
player-ownership override: the ordinary multi-shot lease owns the complete
cast and correctly hides Ryo in its ship-only child shot.

Testing exposed two shared lifetime bugs, now covered by regressions. Native
transactions must acquire/release the controller's existing movement token,
not snapshot and restore another owner's derived locked boolean during late
cancellation. Session replacement must use a browser-sendable close code:
`1000`, not `1008`. The latter was observable during real mode switches;
the completed continuation has no browser errors.

## Verification and remaining work

The real Yarn compiler/engine checks the three events independently: missing
prerequisites, Free roam, incomplete opening, wrong bounds, completed events,
decline, cancellation before/during film and successful acknowledgement.
Early, exact10:15 and late saves prove that only early meditation advances the
clock, without a date rewind or extra-day jump. Exact allowed effects exclude
money/items, training and future story results. The real official import CLI
also validates/publishes all three events in the isolated QA database. The
content generator now rejects out-of-range trigger priorities before producing
invalid import metadata.

The 4.3-minute earned-save browser continuation passes real world loading and
the dojo approach, decline, cancelled meditation/reload/retry, its natural
ending, same-date10:15 Tom arrival, cancelled/retried/naturally completed
invitation, immediate Alpha arrival, cancelled/retried/naturally completed
dismissal, both notebook pages and completed reload without replay. Controls
are released, ¥22,836 and eight inventory entries are unchanged, and no later
training/farewell/finale outcome is inserted. Source cameras show Iwao's close-up,
Ryo's invitation shot and both Ryo/Yada inside the original Alpha room.
A separate 40.7-second renderer-only check confirms Tom's original body and
cart, both Tom and Ryo together, explicit cancellation and restored pose/controls
without changing earned flags. It does not count as another narrative win.

Presentation limits remain explicit: the morning dojo lighting is dark and
the vision uses ordinary original actor presentation rather than reconstructed
ghost compositing. Detailed room-door callbacks and soundtrack selection are
not claimed. No replacement speech or missing-voice alias was needed: all 21
requested English voices and 35 effects resolve. No assets have been uploaded.

Compiler/engine tests cover lesson eligibility, refusal, cancellation at each
boundary, wrong/expired input, retry tokens, stopping, successful input and
cancelled success acknowledgement. Farewell tests cover learned and declined
lessons, cancelled/declined farewell, exact allowed effects and late clocks.
Asset checks verify original branch identities, generated output hashes,
available audio, the one explicitly unavailable farewell voice and practice
motion/camera data. Personal-visibility tests cover reversibility, independent
player state, Free roam, the distinct `TOMH` actor and owned cinematics.
The 4.5-minute connected hardware-rendered browser continuation resumes the
earned dismissal. It verifies the real11:30 wait, decline/reload, natural offer,
acceptance and demonstration, visible original Tom and practice prompt,
cancelled practice/reload, wrong input, expired input, fresh retries, actual
winning input and the natural success film before mastery settlement. A
separate cancelled/retried farewell preserves mastery, then all original
farewell shots finish naturally. Captures show Ryo, Tom and the hotdog truck;
saved nightfall is the same date at22:00, the notebook is updated, money/items
are unchanged, controls are restored and completed reload neither replays the
films nor restores ambient Tom. No finale outcome is inserted. The earned
isolated database is backed up separately from the preceding morning save.

The 70-man battle, Terry QTE/interrogation, post-battle home/rest chain, family
farewell, harbor admission, Swallow Flip lesson, actual final Chai fight and
separate Down/A/A/B counter are connected and rendered as described above.
Chen's introduction letter is also connected and rendered as described above.
The amulet memory and independent ship departure are also connected and
rendered as described above. The S2 feasibility audit and whole-route review
remain goal work; this does not claim exhaustive optional-content coverage.
No future outcome should be inserted into an earned checkpoint. Plane mesh
visibility, exact collapse staging and tighter hand/pipe choreography remain
presentation review items, not proof of missing or completed battle outcomes.
