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
original camera, body motion and eleven voice lines. Money and door reference
actors currently have no rendered geometry, and separate hand/face callback
detail is not reconstructed. These are explicit prototype presentation limits.

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
intro scenes and uses the normal X-skip for each. It checks that the server has
not recorded completion early, rejects an early gameplay connection, verifies
the actual bedside arrival and saved 08:55 handoff, then walks
through the bedroom doorway with normal input/collision and no hallway reset.
It waits for natural allowance completion, checks the one-time payment and
notebook page, and reloads to verify the saved avatar, position, controls and
absence of replay/payment. The test clicks the rendered door if it is closed;
an already-open door retains its pose. Source-program initialization, natural
timing of the four intros, audio fidelity and mid-event network loss are
separate checks, not claims made by this test. Do not run it against production.

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
| Exit / failure | Stay in Hazuki grounds with camera and controls restored. Explicit X-skip completes the presentation; failure/cancellation leaves the event retryable. Repeat entry cannot settle twice. |

### Provenance and limitations

The [Notebook Guide](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/14458)
places the men-in-black objective after entering the dojo following Ine-san's
allowance. The [Japanization Guide](https://shenmuesubs.sourceforge.net/howto/shenmue1/addons/S1_JPG_083.pdf)
identifies SA1116 as Ryo asking Fuku-san about the attackers and A0125 as his
resolve to avenge Iwao. The original JHD0 owner `0x3aec8` supplies the eleven-line
order and selects the MSKA ending. Source hashes remain in
`tools/evidence/mska-native-lifecycle.json` and the generated audio manifest.

`tools/cutscenes/build_first_dojo_assets.mjs` reads the original AFS subtitles
and speech, decodes the eleven voices and measures their durations. It does
not execute or translate the room controller. `AuthoredActivityLeadIn` feeds
that bounded staging into the same scene presentation/ownership system used
by the original ending. The original MSKA selector preview remains unchanged.

The connected local browser check passes through the opening, allowance,
reload, dojo trigger, natural scene completion and the saved seventh notebook
page. A subsequent captured lead-in verifies Ryo and seated Fuku-san together
with inward-facing poses and the authored camera. Poses are held rather than
recreating the original conversation gestures. Voice playback fidelity was not
assessed by listening to the automated run.

The notebook page is a lightly adapted investigation prompt. Exact native
notebook flags and the original leave-home restriction are not implemented.
Do not describe the first conversation as fully animation-faithful.

### Connected progression checklist

| Sequence | Current state |
| --- | --- |
| Opening → bedside → first allowance → saved continuation | Rendered/full-stack verified, including explicit intro skips, natural allowance completion, one-time payment and reload. |
| First dojo visit → men-in-black notebook objective | Connected browser/full-stack progression and notebook verified; server gate/cancellation/settlement tested. Authored two-person lead-in rendered; held poses remain an approximation. |
| Yamanose kitten / first black-car lead | Connected rendered approach, introduction skip, food choice, natural fish ending and saved notebook verified. Real server/compiler tests cover both food settlements, cancellation/retry and clue isolation. Tofu visuals and prop fidelity remain unverified. |
| Sumiya / Yamagishi → Nozomi → Tom | Connected browser clicks, visible actors/facing, initial voice playback, saved clues and restored controls verified for all four. Real server/compiler tests cover cancellation/retry, personal eligibility, NPC presence, Yamagishi hours and cross-character isolation. Conversation-specific gestures remain an approximation. |
| Three Blades → Liu family → Liu Senior's sailors lead | Connected browser continuation verified through Ajiichi, daytime referrals, Liu Barber and Liu Senior. The nighttime cook/Yong/Wu referral is now also rendered and connected; all referrals converge on the same Liu clue. |
| Nighttime sailors → Heartbeats alley | Personal waiting, Saijo's voiced lead and the alley's failure/retry/success path verified in the browser. Timed input is server-validated; defensive choreography remains approximate. |
| Heartbeats interior → Charlie notebook lead | Connected real-door/browser check verifies voiced lead-in, failed QTE/retry, successful B,A,B,A inputs, clue settlement, restored Ryo/camera/controls and no replay on re-entry. Rendered cast uses held standing poses; attack choreography is not implemented. |
| Charlie inquiries: Ono → jacket shops; optional Kinuyo → Nagai office → shopkeepers | Seven connected, rendered original-voiced talks and notebook leads verified after the bar-earned checkpoint, including personal daytime waiting, unlocked controls and reload. |
| Arcade-area ambush → tattoo-parlour lead | Connected rendered introduction/trap, real five-opponent fight, loss/retry, original interrogation and saved notebook verified. Server/compiler/PostgreSQL tests cover calendar/region gates, cancellation, timeout, pre-clue rollback and personal settlement. Combat balance and interrogation staging are adapted. |
| Tattoo parlour / Chinese letter | Missing connected authored progression. |
| Harbor warehouses / Master Chen / Phoenix Mirror | Missing connected authored progression. |
| Hong Kong ticket / Chai / harbor job and Mad Angels | Missing connected authored progression and job/combat outcomes. |
| Nozomi rescue / final battles / departure | Missing connected authored progression and challenge outcomes. |
| Shenmue II reuse and missing-input audit | Pending the connected S1 foundation. |

Individual previews and recovered program inventories do not promote rows to
playable or verified. Run `NEW_YOKOSUKA_DOJO_E2E=true` with the fresh-opening
browser test to extend it through the dojo. That bounded check uses real world
loading and walks across the dojo trigger, but resets near its entrance rather
than proving the entire walk from the residence hallway.

## Megumi and the kitten: first black-car lead

Event ID: `s1.ju00.first-kitten`; official Yarn import: `ju00-first-kitten`.

| Field | Event definition |
| --- | --- |
| Location / trigger | Approach the Yamanose shrine (`JU00`). The authored volume surrounds the original CATA1 entry position; server-accepted presence supplies the bounds check. |
| Prerequisites | Personal Story mode, opening and first dojo complete; first kitten encounter not complete. No forced weather, date change or exact-minute gate in this adaptation. |
| Actors / props | Reuse CATA1's Ryo, Megumi, kitten, box, fish/tofu, motion, attachments and cameras. No new actor or prop renderer. |
| Sequence / challenge | Play `SEQDATA0.AUTH`, then show a real food choice through Yarn. Dried fish selects `SEQDATA1.AUTH`; tofu selects `SEQDATA2.AUTH`. These are alternative endings, not a three-clip sequence. No QTE or fight. |
| Timing / audio | Original AUTH cues, `01CAT1` voices and BGM051. Each clip currently acquires/releases its presentation around the choice; seamless original interstitial gestures and music continuity across the choice are not claimed. |
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
care/naming are still unimplemented. Sumiya now supplies the alternate witness
lead in the authored conversation catalog below. This first encounter is not
proof of the later kitten systems.

Use `NEW_YOKOSUKA_KITTEN_E2E=true` with `NEW_YOKOSUKA_DOJO_E2E=true` to extend
the allowance browser check. It loads Yamanose normally, resets near the shrine
to bound test duration, walks into the event, skips the introduction explicitly,
chooses fish, waits for natural branch completion, and checks saved clues and
the notebook. It does not prove the entire walking route between zones or the
tofu branch's rendered appearance.

The connected local run passed with Ryo and Megumi visible, a real food-choice
panel, and the earned ninth notebook page. The current handoff visibly returns
to the gameplay camera for the choice before the selected clip starts; seamless
interstitial presentation is follow-up polish. The early fish-shot capture does
not establish that the fish/kitten props animate correctly throughout. Keep that
separate from the verified server outcome and do not call this a frame-faithful
recreation. The test uses the authoritative isolated server and local assets;
these events and audio have not been published to production.

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
| `nozomi-black-car`, Nozomi (`HRSK`) in Dobuita (`D000`) | Opening and Yamagishi conversation complete; not complete. | F1239 | Tom argued with the occupants. |
| `tom-black-car`, Tom (`TOM_`) in Dobuita | Opening and Nozomi conversation complete; not complete. | F1038 | A man in a deep-green Chinese coat; ask the Chinese community. |

All four require Story mode and authoritative presence of the corresponding
NPC in this player's zone. The existing personal schedule supplies placement;
other players' NPCs are not changed. No item, yen, native-flag guess, calendar
jump or weather override is added. These are ordinary conversations with no
QTE or combat.

Click the scheduled NPC to start. The shared presenter locks movement, faces
the NPC toward Ryo, displays the original English subtitle and plays its
original voice. Voice completion or Space advances a line. It preserves the
gameplay camera rather than inventing original shot timings. It does not
reproduce specific conversation gestures or lip animation. Completion adds
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
original allows Nozomi to supply her clue without another witness's referral;
this first authored route orders Yamagishi → Nozomi → Tom explicitly. Other
witnesses, optional enquiries and native-dialogue consistency outside these
translated routes remain incomplete. The player may still explore freely.

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
resetting nearby to bound travel time. The first voice must play; Space
advances the remaining lines. This does not establish full natural audio or
animation fidelity.

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

[Shotgunnova's walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404)
sections 1.05–1.07 and scenes 1-17–1-19 corroborate the sequence, the spouses'
roles and the business hours. Original message text, speaker IDs and voice
references come from HUMANS.AFS, with hashes in each generated import.
Question sequences are condensed; gameplay cameras and ambient gestures are
retained instead of claiming the original conversation direction. The cook
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

The local rendered continuation passed using the same character whose opening
investigation clues were earned in the prior browser run. It restored the saved
Story context, loaded the actual interiors, clicked all five residents, verified
their initial voice playback, used Space for the remaining original lines,
confirmed `2:65` in the durable save, and found Liu Senior at the source park
position. The sixteenth notebook page and unlocked controls were verified.
The test resets nearby to bound travel and retains the gameplay camera; it
does not claim original multi-person camera direction or gesture fidelity.

For focused rechecks, `NEW_YOKOSUKA_STORY_RESUME_ID` and
`NEW_YOKOSUKA_STORY_RESUME_TOKEN` select a previously earned isolated test
character. The test requires Tom's saved lead and resumes unfinished witness
conversations without creating story flags or advancing the clock. The normal
variant still connects the whole sequence from the earlier allowance check.
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
the next calendar day. This does not implement the original bed interaction,
curfew destination, daily allowance or deadline scenes.

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
Questions are condensed; cameras and ambient gestures retain the ordinary talk
presentation. Source actor presence remains required for every participant.
The hours compiler handles intervals that cross midnight, though ordinary
Story waking time still rolls past the late-night closing hours.

The isolated browser continuation verified declining/confirming waiting,
all three residents and initial voices, the earned Heartbeats notebook page,
restored movement, and next-morning time without losing clues or money. Real
Yarn/PostgreSQL tests cover cancellation, repeat, stale checkpoints and other
characters; realtime tests cover private receipts and stale-mode rejection.
Use `NEW_YOKOSUKA_NIGHT_STORY_E2E=true` with a saved connected test character.

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
Desktop mapping is Shift/Enter; onscreen A/B buttons also work. Two-second
windows and restarting on any miss are declared adaptations. The server
starts timing only after readiness, issues a fresh token per prompt, checks
receipt time and order, ignores an old token and rejects ordinary Continue as
a way to bypass input. Movies and explicit scene skips cannot award success.

Failure offers retry or departure and grants no flag. Correct inputs settle
`story.s1.heartbeats-alley.completed` once through Yarn; no item, money or HP
effect is added. Cancellation, timeout, missing preparation and disconnect
must leave the attempt retryable. The browser failure/retry/success check uses
ordinary walking into the region and keyboard responses, then verifies the
durable flag and unlocked movement. It starts near the entrance to bound travel.
Use `NEW_YOKOSUKA_ALLEY_QTE_E2E=true` with the connected saved fixture.

Current presentation limits: prompts follow the original beer staging after
returning to the gameplay camera. The original defensive choreography,
between-input recovery animation and gamepad button routing remain unfinished.
The indoor B/A/B/A encounter below now consumes the same challenge primitive.

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
| Challenge | Four timed inputs, B/A/B/A, through the same server-validated prompt system as the alley. Shift/Enter or onscreen buttons. Readiness starts timing; old tokens, movie completion and Continue cannot win. Two seconds per input and strict restart are adaptations. |
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

The inquiries below continue this clue. The parking-lot ambush continues their
evening lead; tattoo-parlour and Chinese-letter progression remain missing.

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
separate calendar gate and server-controlled fight described below.

The talk gates above are pragmatic authored daytime windows plus actual
personal NPC presence. They are not a recovered native business/selector table.
The shared waiting catalog now also offers 10:00 and 13:00 targets, through the
same confirm/cancel, atomic personal clock settlement and private NPC refresh
as evening/morning waiting. This remains a wait-anywhere adaptation; it does not
implement sleeping, curfew or daily allowance collection.

### Verification and input ownership

`NEW_YOKOSUKA_CHARLIE_INQUIRIES_E2E=true` resumes a character that earned the
bar clue in the earlier browser flow. It advances the actual personal clock,
clicks all seven rendered residents, observes initial voice playback, advances
the remaining lines with supported Space input, checks notebook leads and
unchanged money, then reloads the saved Ryo, office location, date and progress.
Travel is shortened by placing the test player near the real scheduled residents;
this is not proof of walking every route or listening to every recorded line.
Real PostgreSQL/Yarn tests separately cover gates, closing times, missing
participants, cancellation/retry, repeated settlement and other-character
isolation.

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
| Fight | Ryo against Smith Bradley (`SMTH`), Harry Thompson (`HARY`), Tony Abrams (`TONY`), Takeshi Sera (`SERA`) and Jones Henders (`JONZ`). Start from the trap's decoded final AMOV positions. Shared basic punch, kick, throw and guard controls; at most three attackers act simultaneously. |
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
  Guard is simplified, only three basic moves are exposed, and paired throws,
  enemy-specific combos, root-motion choreography and combat sound cues remain
  presentation gaps. The arena uses bounded movement and fighter separation,
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

`NEW_YOKOSUKA_AMBUSH_E2E=true` continues the earned Charlie-inquiry checkpoint.
It walks across the real trigger, renders/skips both original introductions,
loses to the actual server-controlled opponents, retries with physical guard/kick
inputs, questions Tony with original voice playback, verifies the notebook and
unchanged persistent health/money, then checks repeat entry and reload. Travel
to the approach is shortened; this is not a proof of the entire walk from the
previous shop or every combat move's choreography.

The real compiler/PostgreSQL test executes the canonical generated import with
server-simulated intents. It checks missing-date migration, same-day/daytime/
out-of-region rejection, another character's inability to advance the run,
timeout, cancellation before and after victory, atomic clue/date settlement,
repeat protection and stale post-completion inputs. Headless result tests do
not establish visual fidelity.
