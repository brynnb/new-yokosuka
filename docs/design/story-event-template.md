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
| Find the tattoo parlor → same-night artist visit | Connected Saijo/Kurita original-voiced clues and real upstairs door entry verified. Rendered two-person visit, cancellation/re-entry, saved tomorrow clue and reload verified; same-day/hour/presence gates and atomic visit-date settlement tested through the real compiler/database. Camera, held poses and omitted grab gesture are adaptations. |
| Charlie's parlor QTE → cartel appointment | Connected real browser check verifies original-voiced cast, wrong direction/retry, Left/A success, Charlie's rendered identity, conversation and saved notebook. Server/compiler/database tests cover calendar/presence gates, cancellation before/after winning and atomic appointment-day settlement. Held staging and omitted knife/throw choreography are explicit adaptations. |
| Nozomi after the parlor | Connected optional same-day encounter: original YBHN cast/cameras visibly verified, cancellation/re-entry, natural ending, notebook and reload without replay pass in the real browser. Not a prerequisite for the letter. |
| Next-day dojo spar → Ine-san invitation → Chinese letter | Connected browser check verifies real timed practice, original Fuku/Ine scenes, visible envelope handoff, cancellation/re-entry, natural letter ending, notebook and saved reload. Server/compiler/database tests prove practice authority and atomic once-only possession. Meditation and forced wake-up travel are omitted adaptations. |
| Fuku-san at the gate | Connected rendered walk-in, cancellation/re-entry, original voices/body/camera, natural ending and saved reload verified. Requires the saved Chinese letter and actual possession; no duplicate handoff. Shared prop-frame repair and presentation verification are described below. |
| Gao Wen rescue / translator referral | Connected browser check verifies original-voiced cast, real three-opponent loss/retry/win, failed A-QTE attempt/retry, original kick/ball/hostage presentation, grandmother referral, notebook, restored controls and saved reload. Compiler/database gates, cancellation, stale input and personal isolation pass. Roadside staging/ball trajectory/basic AI are explicit adaptations. |
| Xia Xiu Yu / Chinese-letter translation | Connected real-door entry, original TOKI actors/voices/cameras, cancellation/re-entry, natural ending, two notebook pages, restored arrival/camera/controls and saved reload verified. Compiler/database possession/presence/hours, stale acknowledgement, repeat and personal-isolation checks pass. Letter attachment/fold data is reused; complete hand/finger fidelity is not claimed. |
| Telephone passwords / Warehouse No. 8 lead | Both real-phone clicks, original initial voice playback, wrong answer/leave, cancellation after the first correct answer, retry, saved warehouse notebook, restored controls, reload and no native fallback verified in the browser. All four reciprocal pair orientations, proximity, stale replies, shared once-only settlement and personal isolation pass compiler/database tests. Receiver/dial choreography remains approximate. |
| Telephone directory / Amihama | Real TBK1 use, original successful 01TEL camera/body/voices, visibly textured open book, cancellation/re-entry, natural completion, saved Amihama page, restored book/player/controls, reload and repeat decline verified. Compiler/database proximity, stale acknowledgement, once-only settlement, personal isolation and legacy candidate-chain checks pass. Book hand binding/swap timing are explicit adaptations. |
| Bus / first harbor arrival | Original BUSS boarding connected to a physical bus click after the earned Amihama lead. Stay, cancellation/re-entry, natural boarding, atomic harbor location/milestone, controls and saved reload verified. Timetable, fare and original harbor arrival movie are not reproduced; existing browser spawn is reused. |
| Goro's first harbor encounter | Connected approach, original voiced cast, cancellation/re-entry, wrong input/retry, actual Left/A/B success, original winning motion, directions/notebook, controls and saved reload verified. Real compiler/database tests cover earned arrival gate, accepted bounds, stale input, cancellation after winning, once-only effects and personal isolation. Placement/cameras/held challenge poses are authored. |
| New Warehouse No. 8: refusal → rear window → overheard clue | Connected rendered approach, original voiced guard, cancellation/re-entry, climb decline/retry, correctly aligned original entering-window motion, exact office arrival, cancelled conversation/reload, saved Old Warehouse District notebook and restored controls verified. Real compiler/database tests cover bounds, stale acknowledgement, cancelled/declined climb without travel, atomic original arrival, once-only effects and personal isolation. Crate physics and walkway search are condensed. |
| Old Warehouse District daytime gate / nighttime entry | Optional original voiced guard, cancellation/re-entry, waiting in the same area until 19:00, failed Right QTE/retry, original head-bump/catch motion, saved original inside-district arrival, ground support, restored control and reload verified. Compiler/database tests prove personal-hour boundaries, cancelled successful input without travel, exact atomic arrival and no fabricated stealth/Chen success. Shot, held prompt and flashlight binding are authored. |
| Old Warehouse District guard avoidance | Connected original-geometry movement, patrols, cover and actual door use; rendered cancellation/reload, capture/next-morning recovery, re-entry, success and saved MS08 arrival verified. Real compiler/database tests cover interrupted input, real detection, atomic recovery and character isolation. Routes, vision/balance and framing are authored, not recovered guard AI. |
| Master Chen / Phoenix Mirror | Missing connected authored progression beyond the earned MS08 arrival. |
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
evening lead; the same-night tattoo-parlour visit is connected. Charlie's later
confrontation and Chinese-letter progression remain missing.

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
| Characters / setup | Hold Ryo, Takashiro, Tony and Smith for the introduction, then switch to Ryo/Charlie. Reuse shared actor ownership, model loading, camera and input locks. An owned out-of-shot HORS is hidden during the confrontation and restored afterward. |
| Dialogue / timing | Eleven original A0136A voice/subtitle pairs cover the frightened sailors and artist's directions. Then a real Left/A QTE; only winning reaches thirteen selected original A0136 lines and the next-day 3 p.m. appointment. Voice endings or supported Space advance conversation lines; Space cannot answer a challenge. |
| Presentation / props | Original AUTH records at MAPINFO `0x23ce4` and `0x281e0` anchor actor positions. Cameras and standing holds are authored. Curtain interaction, a rendered knife, dodging, throwing and arm-grab choreography remain omitted; this is not an exact original QTE presentation. No new gameplay item is granted. |
| Challenge | Closed server catalog `s1.tatq.charlie`, Left then A. Keyboard uses ArrowLeft then Enter; touch buttons use the same prompt tokens. Two-second server windows and strict restart are adaptations. Wrong input/timeout offers retry or leave; ordinary Continue or a client win claim cannot succeed. |
| Calendar / environment | Preserve personal weather, season and ordinary room music/ambience; no forced lighting or date jump. Event ownership pauses the personal clock. Record the successful conversation's personal day, rather than resetting the public world time. |
| Settlement / exit | After scene cleanup, atomically commit `story.s1.charlie-tattoo-confrontation.completed`, `notebook.s1.charlie-cartel-appointment` and `story.s1.charlie-parlor.day`. Appointment eligibility can derive the following day from that ordinal. Restore exact room-entry avatar/location/facing/camera and controls. Money, persistent HP and experience stay unchanged. |
| Skip / failure / replay | Space skips lines but never the QTE. Cancellation, failed preparation and unfinished post-win conversation grant no appointment or partial date. Completed encounters do not replay; reconnect reads the committed state. Failed attempts remain retryable. |

The original [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
and [Shotgunnova walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404)
support the day/time gate, Left/A order and appointment. Original
`SCENE/01/STREAM/A0136A.AFS` and `A0136.AFS` are hash-pinned by the generator.
`TATQ/QTE.PKS` supplies the scene-specific `BIS_L`/`BIS_F` body/face and its PKF
supplies textures. That sole bespoke humanoid is correlated with CHRL and was
visually verified as Charlie; a direct native model-allocation trace is not
claimed. `build_tatq_story_assets.mjs` reproduces and explicitly registers those
ignored assets. The M_0136 waiting clips were inspected/rendered, but their
first-frame poses were not suitable as a standalone scene; generic original
standing motion is an intentional replacement, not a fallback alias.

`NEW_YOKOSUKA_CHARLIE_QTE_E2E=true` continues the earned ambush/parlor checkpoint.
It uses actual personal waiting, real door entry or an already-starting resumed
room event, original voice playback, a wrong direction, retry, real Left/Enter
inputs, the clue conversation, unchanged HP/money and the notebook. Full-stack
tests also prove same-day exclusion, missing artist/early-hour rejection,
later-day first arrival without the optional artist flag, cancellation before
and after winning, atomic day/clue settlement, repeat protection and another
character's isolation. Detailed choreography and mobile controller/gamepad
input have not been visually verified.

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

## Next-day dojo practice and the Chinese letter

Two official Yarn imports connect this sequence: `cartel-dojo` in the grounds,
then `chinese-letter` in the house. Normal house travel is between the two
settled events; no transient Yarn session is expected to survive a world reload.

| Field | Implemented adaptation |
| --- | --- |
| Location / trigger | Walk into the Hazuki dojo-floor region in `JHD0`. After the invitation, enter the house (`JOMO`) through normal travel; its automatic entry selects the letter event. |
| Prerequisites / personal time | Story Ryo, opening and Charlie confrontation complete; dojo encounter incomplete; a later personal day than the parlor appointment, 08:30–23:30. Optional Nozomi concern is not a prerequisite. The letter requires the saved invitation and is retryable on later house entries. |
| Actors / practice | Ryo and Fuku-san use the existing cinematic actor ownership and shared combat moves. Thirty seconds of server-timed, nonlethal practice: both can move, attack and defend, but neither is knocked out. Valid heartbeat/input sequencing is required; stalled or cancelled preparation is not completion. The result is `practiced`, distinct from a fight's `success`. |
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
restored Ryo/location/controls pass. Test travel is shortened; walking every
connecting route and the natural endings of both dojo movies are not proved.
The compiler/PostgreSQL test separately verifies same-day/region gates,
cancellation before/after practice, atomic invitation, cancelled handoff,
one item/economy grant on completion, repeat refusal and character isolation.

Migration `008_story_items.sql` adds the letter definition. Its possession is
authoritative and server-saved; the existing general inventory artwork grid is
still a display catalog, not a full possession-aware story inventory interface.
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
| Timing | Voice completion/ordinary advance controls dialogue. The server simulates the fight and a two-second A prompt. The kick tableau waits for the longest loaded non-looping original motion: Gao's 418 frames (13.93 seconds). Ryo's 243-frame kick moves after frame 120. This is motion timing, not recovered native camera timing. |
| Camera shots | Authored two-person/wider cameras and the existing gameplay combat camera. No claim of original KOJI camera/controller execution. |
| Weather and lighting | Preserve the character's personal Sakuragaoka/Dobuita environment. Daytime rescue availability 08:30–23:30 and referral 08:30–19:00 are adaptations; no forced date, weather or 14:30 teleport. |
| Audio | Original E1049/F1060 voice assets; retain the normal zone music as an adaptation. Scene-specific soccer/strike sound effects are not yet reconstructed. |
| Interactive challenge | Three live fighters using existing movement, guard, hand/kick/throw controls and server health/hit calculations, followed by the closed-catalog A QTE. Health, speed, arena bounds and basic AI are authored balance, not the original free-battle engine. |
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
| Props | Existing placed telephone. Original receiver pickup/dial/hangup choreography is not yet reproduced. |
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
inspection. Its placed phone currently renders flat white, so material fidelity
is not established. Complete handset animation is not claimed. Local original
voice files are registered and hash-checked, not published to R2.

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
| Action sequence | Board or stay → original boarding movie → one authoritative harbor arrival → load the shared harbor. |
| Dialogue | Authored confirmation labels; the chosen original boarding movie contains sound rather than spoken dialogue. |
| Timing | Original 325-frame BUSS variant A. No inferred timetable or pretend wait for a scheduled bus. |
| Camera shots | Original boarding camera. Harbor exploration starts at the established browser bus destination. |
| Weather and lighting | Preserve personal date/time and current environment policy; no forced calendar or weather jump. |
| Audio | Existing BUSS original sound pack. No new voice lines or invented music. |
| Interactive challenge | Boarding confirmation, not a QTE. Staying leaves progression unchanged. |
| Completion effects | Atomically save `story.s1.harbor-arrival.completed` and the reviewed `mfsy` arrival pose. No reward, fare, inventory or native-bank mutation. |
| Exit behavior | Shared New Yokosuka Harbor at `[130.5, 0, 140.6]`, yaw π, restored control. This spawn is an existing exploration adaptation, not an extracted original arrival shot. |
| Skip, failure and replay | Cancelled/failed boarding remains retryable. A completed/explicitly skipped movie settles once. Loading failure after settlement retains the harbor save for reload. Completed boarding does not repeat. |

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

`NEW_YOKOSUKA_BUS_E2E=true` resumes the genuinely earned directory checkpoint.
It covers real bus picking, staying, cancellation/re-entry, natural boarding,
saved location/flag/balance, unlocked control and reload without replay.
Inspected captures show Ryo inside the original bus and the rendered harbor.
The test now waits for the loading cover to disappear: an earlier ready-only
check incorrectly passed while the loading UI displayed an error.

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

`NEW_YOKOSUKA_GORO_E2E=true` resumes an actually earned harbor checkpoint and
walks into the approach region. It covers cancellation, wrong input/retry,
real timed success, rendered winning motion/directions, saved notebook,
restored controls and reload. Inspected captures show the original cast and
the paired throw rather than an invisible or air-hitting opponent. The backend
test uses the real Yarn compiler/PostgreSQL and proves that challenge success
alone cannot grant the clue. Audio starts in-browser; listening fidelity was
not assessed. Assets/imports remain local, not published or deployed.

## New Warehouse No. 8: refusal, window and invoice

Three ordinary official Yarn imports continue Goro's directions. They use the
existing scene player and atomic travel/flag settlement, not a warehouse engine.

| Event | Trigger and result |
| --- | --- |
| `story-s1-warehouse-eight-refusal` | Approach original `OTC8` front shutter after Goro. Original Shozo Kuga (`KEBG/KVG_L`) and five SA1035 voice lines turn Ryo away; save the alternative-entrance notebook page. |
| `story-s1-warehouse-eight-window` | Approach the rear after the refusal. Original E1009BA001 thought, then choose climb or leave. Leaving/cancellation saves no entrance or destination. Completing original MBUI entering-window motion atomically saves the entrance milestone and original `MS8S` arrival. |
| `story-s1-warehouse-eight-overheard` | Automatically continue after earned office entry. Nine original E1009B lines discuss the wrongly addressed invoice and second Warehouse No. 8. Save the Old Warehouse District clue only after that conversation finishes. |

The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf)
(printed pages 31–33) establishes refusal → rear crates/window → overheard
conversation. SA1035's original speaker tag identifies the refusing guard;
E1009B identifies offscreen workers `TMHN` and `TKSA`. Neither requires copying
their ambient schedules into a new story controller.

`build:harbor-story-assets` verifies the original MBUI archive/member hashes
and complete `AKI_HAIRU_MADO_SOUKO_0153` clip, retaining its motion bank. The
entering pose uses the original MFSY return entry 5 `[-18.5,3.6,153.6]`, with
facing reversed to enter. The `8MAD` object's origin lies between two separated
windows: it is not a valid climb alignment. A first rendered pass exposed that
mistake; the corrected capture shows Ryo climbing through the actual window.
The destination is the original MS8S default CHRS player placement at
`[-17,4.275,152.24]`, already used by the ordinary exploration door route.

Cameras and held conversation poses are authored. The climb choice replaces
pushable-crate/incremental-climbing mechanics; Ryo is aligned onto the existing
platform for the entering animation. The invoice conversation starts at the
upper arrival rather than requiring the original walkway search. Staff voices
are offscreen. Environment, personal date/time, currency, inventory and HP are
preserved; no guessed native flag or reward is added.

Each unfinished event remains retryable; stale acknowledgements cannot settle
a new run, and completed events decline. The real compiler/PostgreSQL test
earns all three outcomes from one earlier Goro prerequisite, proving cancelled
or declined entry never moves the player and that office travel/milestone settle
together. The other character receives no clue.

`NEW_YOKOSUKA_WAREHOUSE_E2E=true` resumes the genuinely earned Goro checkpoint.
It walks into each authored approach, cancels/retries the guard, declines/retries
the window, waits for the original motion and actual office load, cancels the
overheard conversation and reloads its saved office continuation, then earns
the notebook clue with restored controls/economy. Inspected captures confirm
the guard, aligned climb, upper walkway and notebook. Audio starts in-browser;
listening fidelity was not assessed. No assets or scripts are deployed publicly.

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
and EVENT textures. Wrong/late input allows retry or leaving without travel.
Genuine Right success must still finish the catch presentation before the
ordinary Yarn transaction saves entry, notebook and destination together.
Cancelling after winning therefore cannot move the player or save arrival.

The destination is original MKSG CHRS default entry 0 `[17,0,-15]`, recorded
at MAPINFO `0x3d958`; source SHA-256 is
`8c26c6de22132f8b42a450b31fb3ad4f0a954948e794419319528ac63ce790ae`.
An initial rendered check exposed entry 2 `[67,0,-4.6]` facing the closed
compound exit. That legitimate source entry is not the right authored starting
point. Choosing the original interior CHRS placement is an adaptation, not a
claim that the native flashlight owner's exact travel was reconstructed.

The harbor-gate close-up, held final head-bump pose, two-second input window,
right-hand flashlight attachment/appearance cue and omission of its falling
trajectory are authored. The original guard-station choreography is not
recreated. Personal environment/calendar are retained; this does not change
the project's 21:00 lighting policy. Currency, inventory and HP are unchanged.

Shared region dispatch now observes the actual personal game date, not the
debug lighting clock. An ineligible region does not consume its entry latch:
waiting at the same gate until 19:00 can start the night scene. The generator
rejects disagreements between these dispatch hours and authoritative Yarn
hours. Unit tests cover missing clock, exact boundaries, overnight windows,
re-entry and malformed metadata. The server still independently checks time
and accepted position; client scheduling is not authorization.

`NEW_YOKOSUKA_OLD_DISTRICT_E2E=true` resumes the genuinely earned invoice clue.
It verifies the original daytime cast/voice, cancellation/re-entry, real waiting
without another approach, wrong direction/retry, real Right input, original
motion, saved compound load, supported floor/restored control and reload
without replay. `TestHarborWarehouseInvestigationAndNighttimeEntry` extends the
connected real compiler/PostgreSQL test through both gate variants, including
stale/cancelled acknowledgements, personal-hour boundaries and atomic arrival.
Night access is explicitly **not** stealth or Master Chen completion.

`build:harbor-story-assets` replaces the two smaller harbor exporters with one
pinned-source extraction path for all three banks and the flashlight. Existing
Goro/window motion bytes are unchanged; manifests record the shared producer.
Audio starts in-browser; listening fidelity was not assessed. No deployment or
R2 publication is performed.

### Connected guard avoidance

`story-s1-old-district-stealth` automatically continues an earned MKSG entry.
It extends the existing `start_challenge`/Yarn result boundary with a navigation
kind, not a second quest/save engine. The server owns movement, wall collision,
patrol phase, vision and door-use success. The browser supplies sequenced
movement/hide/sprint/use intents and renders private actor snapshots through
the same cinematic ownership and server-pose renderer used by Story combat.
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
