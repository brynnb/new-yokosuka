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
| Gui Zhang confrontation | `MFBT/TLYA.PKS`, original1,945-frame introduction, `M_TLYA.MOTN` bank16, `01TLYA`, `A1_KBTMM`. Thirty seconds of the existing server-timed nonlethal practice, then original `MFBT/KISY/M_01_H.MOTN` mutual-collapse motions. | Save only independent practice and counter approach after acknowledgement. No Gui Zhang defeat: the guide explicitly says there is no winning/losing outcome. Shared basic combat, practice duration, held collapse roots and camera are adaptations. |
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
Yarn event, server combat simulation, original-model actor adapter and music
director; it is not another quest engine or a reconstruction of native AI.

| Field | Integration |
| --- | --- |
| Admission | Story Ryo, completed opening and saved `story.s1.final-pipe.completed`. Approach/recovery bounds include the original encirclement arrival and the existing clear practice floor in MFBT. Explicit **Fight the Mad Angels** / **Leave it for now**. No additional weather or exact-minute gate. |
| Arena / cast | Original MFBT geometry; declared relocation to the already rendered clear floor at browser `[-23.4,0,65.8]`. Original Ryo/Gui Zhang, eight ordinary model slots and the three named bosses. The model pool is prepared once, with no 70-rig load or per-wave asset fetch. |
| Original assets | Disc3 `MPK00.PKS` supplies seven resident small bodies; `BATTLE70.AFS` supplies BTC_S and its texture pack. Source hashes and exact member/output identities are pinned in the generated manifest. Existing Chen/rescue model assets supply Gui Zhang and bosses. `MAPINFO.BIN` names BGM120; use its existing viewer rendering through the shared music director. Looping the finite three-minute rendering is an adaptation. |
| Actual challenge | Ten cohorts contain67 ordinary opponents and three bosses, all requiring actual server-simulated knockouts. Enemy health/damage, cohort composition, two active attackers, basic AI and shared moves are authored balance. Ryo and Gui Zhang retain health between groups. Gui Zhang cannot be knocked out in this adaptation; Ryo can. The existing short recovery remains available. |
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

The70-man battle and bosses are connected and rendered as described above.
The later Terry
QTE/interrogation, final Chai encounter, departing gifts and departure remain
separate missing outcomes.
No future outcome should be inserted into an earned checkpoint. Plane mesh
visibility, exact collapse staging and tighter hand/pipe choreography remain
presentation review items, not proof of missing or completed battle outcomes.
