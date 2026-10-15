# Hong Kong ticket journey

This chapter uses ordinary authored Yarn events and the shared scene player.
The server owns funds, personal time, location and notebook settlement. Native
room-controller reconstruction is not required. The [coverage checklist](story-event-template.md#connected-progression-checklist)
distinguishes rendered checks from missing content.

## Home and travel funds

Official imports: `post-chen-home`, `hong-kong-savings`, `fuku-travel-advice`.

The contemporary [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed pages 41–42, orders the home update, mirror dream, morning withdrawal
and family discussion before travel-agency inquiries.
[Shotgunnova's walkthrough](https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404),
scenes 2-39 through 2-42, independently describes those steps and gives the
exact ¥36,502 award. That amount is reference-backed, not a claimed recovered
native bank-account computation.

| Field | Authored integration |
| --- | --- |
| Locations / triggers | Return to the Hazuki interior (`JOMO`) after the earned second Chen meeting. An authored foyer/hall volume offers the original Fuku update. Ryo's bedside offers explicit sleep; entering Fuku's real bedroom offers travel advice. Merely loading another player's scene grants nothing. |
| Eligibility | Story Ryo, completed opening and mirror meeting, genuinely owned Phoenix Mirror. Saved home update gates sleep/withdrawal; saved withdrawal gates the bedroom discussion. The server independently checks accepted player bounds. |
| Sequence / timing | Original embedded A0160 update (~21.68 s); existing KKYB two-mirrors/hawk vision (~30 s), then original 01BNK bankbook scene (~25.22 s). Three original HUMANS travel-agency lines use held bedroom staging; original 01EAR kitchen discussion (~82.25 s) follows. |
| Cast / props | Original Ryo and Fuku; Ine joins the kitchen scene. Original `$BNKT2DBG.MT5` bankbook is named directly by the JOMO bank-scene resource cluster. Its original AMOV supplies the book trajectory; no duplicate hand-attached prop or guessed substitute. Actor ownership suppresses overlapping personal ambient copies and releases on cleanup. |
| Dialogue / audio / cameras | Original A0160, 01BNK and 01EAR AUTH camera/body/voice/SFX tracks. F1004A124/B141/B146 are coherent original FUKU HUMANS lines, not newly voiced dialogue. Lead-in poses/camera borrow A0160's first frame; holding them through those lines is an adaptation. Music for the home scenes and detailed hand/face callbacks are not reconstructed; the existing KKYB package retains its source-associated dream music. |
| Weather / personal time | Preserve ordinary personal weather/season for the house. The dream isolates its original presentation stage. Only successful dream-plus-bank completion advances to the next personal day at 08:30 and restores the established bedside arrival. No public clock mutation. |
| Effects / notebook | Home update saves its own milestone/page. Dream, withdrawal milestone/page, one ¥36,502 grant, next-day clock and bedside arrival commit together. The family discussion adds only its milestone and travel-agency notebook clue. It cannot give funds again. Existing shared economy rules remain authoritative across play modes. |
| Exit / controls | Home update and advice restore prior gameplay pose/camera/controls in JOMO. Completed sleep returns to the existing supported Ryo bedside spawn. The next objective is checking Global Travel or Asia Travel in Dobuita. |
| Leave / skip / failure / replay | Explicit leave/stay-awake, cancellation during either movie, failed preparation and stale acknowledgements settle no funds or day jump. The noninteractive presentation supports the existing explicit skip; it is not a challenge result. Reload reads committed receipts without replay or payment duplication. |
| Declared adaptations | No automatic 23:30 teleport from the warehouse, forced house/yard lock, original sleep-menu reconstruction or cinematic-minute debit. Player-confirmed home approach and sleep keep the causal order; later agency events require the saved family discussion. |

### Original assets and generation

`npm run build:home-ticket` uses the shared original activity, TEXN and audio
compilers. Sources are Disc 2 JOMO `MAPINFO.BIN` and `COMMON02.PKS`:

| Presentation | Embedded AUTH offset | Motion source and bank |
| --- | --- | --- |
| Update Fuku | `0xb7ff4` | `M_0160.MOTN`, bank 25, original sequence window 112–113 |
| Bankbook | `0xa0ef4` | `M_01BK.MOTN`, bank 24, complete four-sequence bank |
| Kitchen discussion | `0xb4460` | `M_01EAR.MOTN`, bank 25, original sequence window 144–146 |

The original embedded clips use high motion indexes despite compact files.
The established `sequenceIndexBase` parser option retains those identities;
renumbering them from zero would animate the wrong actor or fail resolution.
Package-local slot zero is not a claim about the original story selector.
The existing KKYB slot 51 keeps its reviewed resource pointers.

Fuku's advice volume ends at `z=-0.8`, inside the bedroom. The real door plane
is `z=-0.0141` and its opening alignment stops around `z=0.31` in the hall.
Including that alignment in the trigger would acquire scene ownership before
the door finished opening. Shared region tests cover both sides of this boundary.

Original resource clusters associate A0160 with `A1_HUKHE.SND`, 01BNK with
`A1_TUMIR.SND`, and 01EAR with `A1_KIKUM.SND`. The generator pins archive,
embedded-member, motion, model, texture, speech and sound hashes; it exports
4/2/28 voice records and 3/2/10 SFX respectively. The bankbook uses flat TEXN
records extracted from original JOMO `MPK00.PKF`. Binary output remains ignored;
manifests and immutable runtime-asset metadata are tracked. Publication remains
a separate authorized release step.

### Verification

The real Yarn/compiler/PostgreSQL earned-chain test passes through these
events. It checks accepted bounds, wrong-order rejection, leave, cancellation
during dream/bank, stale receipts, unchanged inventory, one award, next-morning
arrival, calendar preservation for ordinary conversations and another
character's ineligibility. Focused client ownership/catalog tests pass.

Connected rendered continuation: `NEW_YOKOSUKA_HOME_TICKET_E2E=true` with the
isolated earned-save fixture. Rendered continuations passed across an earned
save interruption: home decline/cancel/retry and natural A0160 ending; dream
and bank cancellation without funds/day jump; natural dream/bank ending with
one ¥36,502 award and next-day bedside arrival; actual bedroom-door click and
normal supported entry, advice decline/cancel/retry, original kitchen ending,
notebook, restored controls and reload without replay or another payment.
Inspected captures show Ryo/Fuku, the original Sumitomo bankbook and original
camera/subtitle presentation. Audio fidelity was not assessed by listening;
the exact hand/face callbacks and every kitchen shot were not visually audited.

The first room-entry check aimed at the moving leaf's old center, too near its
partly stacked edge for Ryo's radius. The shared test helper now derives the
vacated opening's center from the moved native boundary. No collision rule,
player radius, physical door behavior or no-clip setting was changed to pass.

## Agency quotes and Fuku's contribution

Official imports: `global-airfare`, `asia-airfare`, `fuku-travel-funds`.
The original dialogue supplies the prices and contribution. The GameSpot guide
(printed pp. 43–44) and Shotgunnova's section 2.07 supply progression order;
the latter explicitly permits either agency visit before Fuku's help.

| Field | Authored integration |
| --- | --- |
| Location / trigger | Enter Global Travel (`DSKI`, 09:00–20:00) or Asia Travel (`DAZA`, 10:00–20:00), then return to Fuku's bedroom. Small authored approach volumes are validated independently by the server. |
| Prerequisites | Saved family travel discussion for either quote. Saved bank withdrawal and either quote for Fuku's contribution. All are personal Story events, once per character. |
| Cast / assets | Ryo and Satoshi Shinoda (`SIND`, SND_L) at Global; Ryo and Etsuko Sekine (`ETKO`, the existing DAZA JOJ_L model) at Asia; Ryo and Fuku (`FUK_M`) at home. Original AUTH body, camera, prop movement and speech tracks. |
| Sequence / choices | Ask for fares or leave. Global quotes ¥198,000 for the ticket alone; Asia quotes ¥158,000. Each successful scene grants its own flyer and a shared airfare milestone. Either permits Fuku's original piggy-bank scene and his ¥39,634 contribution. No air ticket is purchased. |
| Timing / audio | Global `01MIT` lasts about 50.43 s with 20 voices and 8 effects; Asia `01ETU` about 70.98 s with 19/10; home `01MON` about 89.33 s with 22/19. Durations include the original movement/camera tail. No challenge or movie-implied victory. |
| Props / approximation | Ledger, pen and flyer roles at Global are reviewed role-based assignments, not recovered callback bindings. Asia's props now use the original CHRS image table (see below), replacing earlier inferred assignments. Original movement supplies trajectories. Global's cinematic door actor is transform-only: exploration keeps the real doorway. The intact home piggy bank uses its original trajectory; breaking debris and exact finger callbacks are omitted. |
| Personal environment | Preserve ordinary personal calendar, weather and lighting. Shop hours use personal time. Quotes and contribution do not advance the day or alter the public clock. |
| Effects / notebook | Grant the Hong Kong Flyer and Bargain Flyer separately, each once. Fuku's milestone, notebook clue and ¥39,634 commit together. Quotes cannot grant money. New flyers currently have text-only inventory slots, not invented or misidentified artwork. |
| Exit / recovery | Restore the prior exploration pose, camera and controls in the current room. Leave, preparation failure, timeout and cancellation grant nothing. Stale acknowledgements cannot settle a cancelled run. Explicit skip of a noninteractive movie uses the same one-time server settlement. Reload reads committed outcomes. |

### Asset provenance and ownership

`build:home-ticket` also exports these clips with the established shared compilers:

| Clip | Original source | Motion |
| --- | --- | --- |
| Global quote | Disc 2 DSKI MAPINFO `AUTH 0x24e90` | `M_01MIT.BIN`, bank 16, complete sequence indexes |
| Asia quote | Disc 2 ARAR MAPINFO `AUTH 0x12684` | `M_01ETU.BIN`, bank 48, complete sequence indexes |
| Fuku savings | Disc 2 JOMO MAPINFO `AUTH 0xa9588` | COMMON02 `M_01MO.MOTN`, bank 25, sequence window 96–97 |

Asia's original cinematic resource is ARAR, borrowed inside the existing DAZA
exploration shop. This does not claim original ARAR room initialization. The
generator pins source/model/motion hashes, including the actual released
standalone prop models and embedded textures. No native story flags are guessed.

Global's ordinary `F1SEKAIR.SND` location bank uses `a905` commands and cannot
satisfy `01MIT`'s `a904` sound cues. The separately extracted `S1_SEKAI.SND`
contains the exact nine playable `a904` commands; its selection is a
name/command-correspondence inference, not a recovered room-controller call.
Asia uses `A1_ETUKO.SND`, and Fuku uses `A1_CHOFK.SND`.

Two original JOMO placements share `S1_JOMO_BTAS500G.MT5`. The shared scene
object borrower now permits an explicit logical `objectTag` selector, so this
scene moves only `PIG_`, not the unrelated `fbut` ornament. Explicit world
placements restore their original transforms/visibility on cleanup. Legacy
cinematic/composite roots retain their existing hidden-after-release behavior.

### Verification

Focused scene ownership/catalog/region tests pass (43 checks). The real
Yarn/compiler/PostgreSQL earned-chain test passes through one quote, Fuku's
contribution, and the other quote. It checks shop-hour boundaries, leave,
cancellation, stale acknowledgements, independent flyer ownership, one
contribution, unchanged calendar and another character's ineligibility.
Connected rendered continuation (`NEW_YOKOSUKA_AGENCY_E2E=true`) passes across
earned-save interruptions: real physical door 60 at Global and door 25 at Asia,
leave/cancel/retry and natural quote endings, actual Fuku bedroom-door entry,
contribution cancellation/retry and natural ending, one payment and independent
flyers, restored controls, and saved reload without replay/payment. Captures
visibly confirm the original Global cast, Fuku's flyer/piggy-bank presentation,
and the Asia cast/camera in DAZA. They do not verify every shot, exact hand
callbacks or audio fidelity by listening. Flyer artwork in the inventory itself
has not been added or visually checked.

The first rendered continuation exposed a dispatch error: reusing the earlier
advice region also reused its completed-event gate, so the contribution never
started. A distinct contribution region now shares the reviewed room bounds
but has its own prerequisites and completed flag. A focused runtime regression
test verifies that completed advice does not retire this later event. No
collision or door rule was changed.

## Remaining ticket progression

The next-morning call and arcade Chai fight are implemented below. The resulting
Asia Travel confrontation/chase remains missing connected content. A payment,
promise, call or completed introduction is not a fight or chase success.

The `01MON` piggy-bank subtitle states ¥39,634; the same integer occurs in
JOMO MAPINFO at `0x71a44`. That exact amount is used by the authored settlement,
not a reconstruction of its full native controller.

## Boat fare, payment and delayed inquiry

Official imports: `nozomi-boat-lead`, `global-boat`, `boat-ticket-purchase`,
`boat-ticket-collection`. The contemporary GameSpot guide, printed pp. 44–45,
provides this causal order, the ¥69,000 fare, four-hour delay and next-day promise.
Original HUMANS/01MIT/01ETU/A0165 dialogue independently supplies the exchanges.

| Field | Authored integration |
| --- | --- |
| Locations / prerequisites | Talk to Nozomi at Aida Florist after Fuku's contribution. Enter Global or Asia during the established personal opening hours after that clue. Global's referral is optional; it must not block a player who goes straight to Asia. |
| Trigger / choices | Actual Nozomi NPC talk; reviewed shop entrance regions with separate milestone lifecycles. Explicit leave/ask/payment choices. The payment choice states the full ¥69,000 before any debit. |
| Cast / presentation | Original contiguous HRSK voices F1239A062 through A070 for Nozomi's cheaper-boat suggestion, using ordinary shared facing/camera. Original alternate 01MIT Global referral (~49.02 s), original 01ETU payment (~70.97 s), then A0165 Jimmy/thug confrontation (~69.42 s) in DAZA. Original body/camera/prop trajectories are reused; Nozomi's conversation gestures remain adapted. |
| Payment / possession | Original source price: ¥69,000. Insufficient funds show a short authored unvoiced caption and settle nothing. Successful presentation stages one debit, paid milestone, notebook and payment-minute record in the ordinary server transaction. No ticket is granted: it has not been delivered. |
| Personal time / weather | No public clock mutation, forced weather or automatic time jump. Record the authoritative whole personal calendar minute. Collection requires at least 240 calendar minutes, including across midnight, and the shop must be open. Existing personal waiting options can advance time; returning tomorrow is valid. |
| Delayed inquiry | After the delay, original Jimmy (`JIM_M`), Koji Hase (`TPL_L`) and Kazumi Minowa (`MIR_L`) replace the conversation cast for A0165. Its success records Jimmy's promise/day and notebook, not a ticket, refund, second debit, fight victory or phone-call completion. |
| Exit / failure / replay | Restore the prior gameplay pose/camera/controls in the current zone. Leave, preparation failure, cancellation and stale acknowledgements cannot take money or record the appointment. Paid progress survives reload; repeats cannot spend again. The noninteractive presentations support the existing explicit skip. |

### Source bindings and deliberate limits

Both Asia scenes use `parseChrtSceneObjectBindings` on original ARAR MAPINFO's
CHRS/DefImage table. The prior inferred quote props were incorrect: `INF1`
is `TIRT230G`, not `TIRS701G`; `MAGA` is `ZSR3H03G`, not `ARP3H01G`.
`INF2` remains `TIRS703G`. The payment table maps `INF3` → `ARP3H01G`,
`MONY` → `OSAS5LOG`, `PURS` → `SAFS500G`, and `TRAY` → `UKES500G`.
The generator uses the same structured mapping for both scenes and stores
source record offsets in their manifests. No inferred prop override remains
in the quote package. Detailed finger/attachment callbacks remain unreconstructed.

`A0165A008.str` and `A0165A009.str` are referenced by the original AUTH but
absent from the original A0165.AFS member directory. Their manifest records
explicitly mark them unavailable; no unrelated speech or invented subtitles
stand in for them. Other speech and all requested effects are exported.
The source-associated `A1_ASIAR.SND` contains the exact requested a904 commands;
the similarly related `A1_HIJYM.SND` lacks four of them.

The server's small `game_minute` / `record_game_minute` additions reuse the
existing transactional progress store. Whole UTC minute ordinals in the original
1986/1987 calendars are exactly representable by Yarn's float32 numbers; Unix
milliseconds/seconds are not. This is minute-granularity waiting, not exact
second-level original-controller timing. No new appointment database or quest
engine was introduced.

### Verification

The actual compiler/PostgreSQL earned-chain test passes through Nozomi,
Global's optional referral, payment and the delayed inquiry. It checks missing
NPC presence, cancellation/retry, explicit decline, insufficient funds,
unchanged inventory, stale payment acknowledgement, one debit, the saved minute,
rejection at 239 minutes, acceptance at 240, and no second payment/ticket grant.
Focused clock tests check exact minute storage, crossing midnight, invalid or
missing clock facts and Free-roam rejection. Focused presentation tests compare
the generated props against the original CHRS identities.

The connected rendered continuation (`NEW_YOKOSUKA_BOAT_TICKET_E2E=true`)
passes from the earned agency/funds save: actual Nozomi click/voiced start,
cancellation/retry, original Global referral, real shop-door entry, explicit
payment decline and movie cancellation, original cash/tray/flyer presentation,
one debit, reload before the delay without early collection, personal waiting
outside the shop, real return through the door, cancelled/retried/naturally
completed Jimmy scene, saved notebook, restored controls and reload without
another payment. The two browser checks (renderer preflight and continuation)
passed in about 4.4 minutes. Captures were inspected; listening-level audio
fidelity and every camera/hand pose are not claimed.

That run revealed that package-owned bodies could remain beside scheduled
copies: the Global close-up visibly contained two SIND heads. The shared
scheduled-actor runtime now lends an owner-scoped suppression lease to the
package actor runtime. Ambient updates cannot re-enable replaced models, and
completion/cancellation/world cleanup restores their previous visibility.
Jimmy's scene explicitly suppresses the absent clerk ETKO as well as replacing
any scheduled copies of its own cast. This fixes the ownership boundary for
all package bodies, not only these shops. It does not permanently phase the
ambient clerk out after the scene; persistent population changes remain
separate story content.

Ninety focused actor/package/lifecycle tests pass. A separate rendered
ownership check (`NEW_YOKOSUKA_BOAT_VISIBILITY_E2E=true`, about 52 seconds)
visibly verifies the corrected Global and Asia presentations, hides the
ambient copies through multiple rendered frames, restores their visibility and
controls after cancellation, and confirms unchanged money/inventory/flags.
These previews are renderer checks, not evidence of newly earned progression;
the connected run above supplies that evidence.

## The snow dream and Jimmy's morning call

Official imports: `jimmy-night-dream`, `jimmy-morning-call`.
The GameSpot guide, printed pp. 45–46, orders the snow-girl dream after Jimmy's
promise, then his home call and the noon You Arcade appointment. The original
`A0169` SRF independently names Jimmy, Asia Travel and the noon meeting.

| Field | Authored integration |
| --- | --- |
| Locations / prerequisites | Story Ryo, completed opening and the earned Asia/Jimmy promise. Sleep uses the established bedside region after 20:00 on the recorded promise day. The call uses the supported foyer/hall approach on any later personal day. |
| Sequence / cast | Optional, explicit sleep plays existing `KKYC/SEQDATA2.AUTH` with Shenhua in the isolated dream stage, then saves the next day at 08:30 and the established bedside arrival. Crossing the hall starts original A0169: Fuku answers, hands the conversation to Ryo, and Jimmy requests the arcade meeting. Jimmy is a remote voice, not a body in the home. |
| Original presentation | Existing KKYC assets and source-associated BGM079. The phone pack uses Disc 2 JOMO MAPINFO AUTH `0x9d7dc` (7,456 bytes), COMMON02 `M_0169.MOTN`, bank 19 and complete sequence indexes, original cameras, twelve speech lines and thirteen A1_JYTEL effects. The AUTH movement lasts 1,600 frames; its camera track makes the complete presentation 60 seconds. Source and output hashes are pinned by the pack generator. |
| Props / weather | Borrow and restore the existing `TEL_` / `S1_JOMO_TELS514G.MT5` phone; do not create a duplicate. Keep normal personal weather outside the isolated vision. Detailed receiver, finger and facial callback reconstruction is not claimed. |
| Completion / exit | Sleep saves its milestone, calendar and bedroom destination in one transaction. The call saves its own milestone and one notebook page, preserving the approach position, personal date, inventory and money. It grants no ticket, refund or fight result. Both restore camera and controls. |
| Skip / cancellation / missed timing | Existing explicit cinematic skip may complete these noninteractive scenes. Leave, cancellation, failed preparation and stale acknowledgements settle nothing and allow retry. Waiting elsewhere can bypass the optional dream; missing the exact next morning cannot strand the call. |

The foyer/bedside triggers, optional sleep choice and forgiving late-call gate
are declared adaptations, not recovered native room initialization. The shared
region dispatcher re-arms date-sensitive appointments on a new personal day.
Ordinary overnight opening-hour windows retain their entry latch across midnight;
client rechecking never authorizes a saved appointment or writes progress.
The existing waiting catalog now includes 20:00, with its ordinary server/Yarn
confirmation rather than browser-selected timestamps.

The focused real compiler/PostgreSQL test covers missing/same-day appointment
records, the 20:00 boundary, decline, cancellation, stale receipts, atomic
next-morning arrival, original inventory/money preservation and once-only call
settlement. Focused client checks cover exact presentation bindings and the
date-sensitive dispatch rule. Connected rendered validation uses
`NEW_YOKOSUKA_JIMMY_CALL_E2E=true`; visual and audio fidelity are reported
separately from those state checks.

The uninterrupted earned-save browser continuation passes (about 2.4 minutes
including GPU preflight): same-day call rejection, ordinary 20:00 waiting,
sleep decline/cancel/retry, natural dream completion, saved next-morning bedside
arrival, normal movement through the bedroom door, call cancellation/retry and
natural completion, visible notebook page, restored controls and saved reload
without another call. Funds and inventory remain unchanged throughout.
The 125 focused client presentation/ownership/controller tests pass. No assets
were uploaded and no production state was changed.

Inspected captures show Shenhua in the isolated dream stage and the original
Fuku/Ryo home-phone shots. The dream currently lacks rendered snow and is dark;
the phone receiver is not yet attached to their hands. Those are visible
presentation limitations, not missing eligibility, dialogue or save outcomes.
Audio playback fidelity has not been assessed by listening.

To regenerate only the new presentation, use
`node tools/cutscenes/build_home_ticket_pack.mjs --profile jimmy-morning-call --audio`
with the same original-disc and audio-tool prerequisites as the other ticket
packs. Omitting `--profile` retains the full deterministic batch.

## Chai at You Arcade

Official import: `chai-arcade`. The GameSpot guide, printed pp. 46–47, establishes
the noon meeting and both valid battle outcomes: victory allows a same-day
continuation; defeat brings Fuku's rescue and a day of rest at home.

| Field | Authored integration |
| --- | --- |
| Location / eligibility | Normal You Arcade (`DGCT`), entered through the existing physical Dobuita door 64. Story Ryo, completed opening and earned Jimmy call; personal noon or later. The entrance-side approach is authored, not a recovered event volume. Missing the exact appointment minute cannot strand the player. |
| Original presentation | GMCT MAPINFO AUTH `0x5edc` introduction, `0x13ce0` victory and `0x16a9c` rescue; original M_0172 bank 32, complete sequence indexes, actors, cameras and A0172/A0172A speech. The three presentations last about 73.35, 38.35 and 27.93 seconds. A1_BGAM's 43 tracks cover the requested sound commands; this bank association follows source naming and exact command coverage, not reconstructed owner execution. |
| Cast / props | Ryo and Chai (`CHA_M`); victory also uses Yuji Nito (`NITO`, GAT_L, corroborated by the existing scheduled actor and character inventory); rescue uses Fuku (`FUK_M`). Shared ownership suppresses overlapping ambient bodies. The original CHRS identifies DOOR → DR17_001 and SLOT → GAMT101G. Their timeline references are retained, but normal DGCT scenery remains fixed: cabinet knock-over and detailed ticket/finger callbacks are omitted. |
| Fight / timing / cameras | Original introduction-ending positions feed the existing server-controlled fight. Physical movement, punch/kick/throw/guard inputs drive real health, hits, basic opponent AI and outcomes. Shared generic animations, 100/120 health, speeds and rectangular arena padding are adaptations; Chai's original low-kick moveset is not reconstructed. The normal orbit camera remains player-controlled. Environment/weather stays personal; no new battle music is asserted. |
| Victory | Only server victory selects the original victory ending. Its acknowledgement atomically saves the won flag, chapter milestone and Asia Travel notebook clue; stay in the arcade that personal day with prior controls/camera restored. |
| Defeat | Only a genuine zero-health knockout selects the original Fuku rescue. After its acknowledgement, atomically save the lost flag, same chapter/clue, next-day 08:30 and established bedside arrival. Offscreen travel and the remaining rest day are condensed; the separate A0173 home-recovery scene is not yet connected. |
| Failure / cancellation / replay | Timeout or lost heartbeats offer retry/leave, never the rescue or progress. Continue/skip cannot win the fight. Noninteractive movies support ordinary explicit skip. Cancelling an introduction, fight or ending settles nothing and remains retryable. Reloading a completed chapter does not start another ambush. |

Both endings preserve money, inventory and persistent HP. Story-fight health
uses the existing temporary encounter model; this chapter grants no refund,
ticket item or guessed native flag. The notebook is a lightly adapted lead to
Asia Travel. The subsequent connected chase is documented below.

`TestChaiChapterRequiresRealOutcomeAndEndingAcknowledgement` compiles the actual
generated chapter and runs original shared fight simulation under a controlled
clock. It covers call/hour/bounds gates, victory, knockout, timeout, cancelled
endings, no pre-ending settlement, the exact loss date/destination and stale
inputs. Real browser/database validation uses `NEW_YOKOSUKA_CHAI_ARCADE_E2E=true`
and `NEW_YOKOSUKA_CHAI_ENDING=win` or `defeat`, separately from the same earned
pre-fight save. No future milestone or client-supplied outcome is injected.

Both separate rendered/database continuations pass (about 1.9 minutes each
including GPU preflight). They enter through the real arcade door, cancel/retry
the introduction, verify unchanged state before the ending, let the original
ending complete naturally, read the new notebook and reload without replay.
Victory uses physical guard/kick/movement keys and preserves the same-day
arcade location; the unguarded attempt is genuinely knocked out and saves
next-morning home recovery. Money and inventory remain unchanged in both.
Inspected captures show the original Chai/Ryo confrontation, shared live fight
and distinct Chai aftermath shots. Detailed Nito/Fuku choreography and audio
fidelity have not been exhaustively reviewed. The saved loss and win branches
remain separate local backups; no assets or production data were published.
The 142 focused client presentation, actor ownership, controller and combat
checks pass, as do the Go scripting/content suites with the real Yarn compiler.
Those Go commands do not claim unconfigured database integration coverage;
the two connected browser runs supply the real PostgreSQL outcome checks here.

## Jimmy chase and interrogation

Official imports: `jimmy-chase`, `jimmy-interrogation`.
The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed pp. 47–48, supplies the order: knock at closed Asia Travel, catch
Jimmy, question him inside, then seek harbor work to investigate the Mad Angels.
The original winning inputs are Left, Right, Left, Right, Left, Right, A,
Left, Left, Right, Left, Right, A.

The outside approach asks for an explicit knock; it does not override normal
shop-door hours. The original `CTERMO1.PKS/SEQDATA3.AUTH` opening uses the
`CTERMO2.PKS` motion ordering. Capture (`SEQDATA1.AUTH`) and escape
(`SEQDATA2.AUTH`) use the differently ordered `CTERMO3.PKS` bank. Their ordered
casts come from AUTH, not the alphabetically sorted research inventory.
The generator pins every source hash and retains exact camera, body and voice
cues. Two referenced voice members absent from the original AFS directories
are explicitly unavailable, never replaced with plausible speech.

The running section is deliberately authored, not reconstructed DYNAMICS:
thirteen moving beats follow a reviewed original civilian street corridor
(`MTRI:e18c81dc1131:59400:0x4af60`, selected road-point SHA256
`ed8fd50b876e089584c436bfecead4df7f0ad836ef155b43c9a66d2b85cb2b83`).
Shared native-curve evaluation moves the actors and follow camera. One
actor/camera lease continues between beats, with ordinary running followed by
standing at each two-second input window. The corridor, follow camera,
held input beats and generic biped motion are adaptations; exact original
obstacles and stunt animations are not claimed. Door references DOR1/DOR2
remain virtual rather than guessing a moving-world-door binding. CAR_ uses
the original C85N305G covered delivery truck as an explicit authored choice,
not a recovered native actor/model association.

Only all thirteen real server-timed inputs and the acknowledged capture film
settle `story.s1.jimmy-chase.completed` and the office destination together.
Wrong inputs/timeouts show the escape film and permit a fresh attempt. Stale
prompt tokens, leaving and cancellation grant no progress. The original
A0174 first-frame Ryo pose is the saved DAZA arrival. A separate office event
plays the original interrogation and grants the Mad Angels/harbor-work
notebook clue. Cancellation or reload after capture retries that conversation,
not the whole chase. There is no refund or Philippines-ticket grant.

Interrogation presentation comes from Disc 2 ARAR AUTH at `0xaa6c`
(member SHA256 `be90144b021082280a7fba68f69870fafd332e6df3c4061603d5119dc873cb1f`);
the byte-identical scene also occurs on Disc 3. Its English A0174 voice archive
is on Disc 3. This reuse does not depend on a guessed native story flag.

Reproduce the data with `tools/cutscenes/build_jimmy_chase_pack.mjs --audio`,
`tools/scripting/build_jimmy_chase.mjs`, then the existing investigation
generator and server-contract sync. The latter tools require
`NEW_YOKOSUKA_SERVER_DIR`. Native audio extraction uses the existing documented
DTPK/vgmstream toolchain; generated raw assets remain ignored.

Verification: the real Yarn/compiler/server test checks all thirteen inputs,
wrong-input/timeout retry, stale tokens, prerequisites, cancellation and atomic
capture effects. The connected `NEW_YOKOSUKA_JIMMY_CHASE_E2E` continuation
passed against the isolated PostgreSQL server: decline, opening cancellation,
escape/retry, both complete road attempts, capture cancellation, saved DAZA
return, interrogation cancellation/reload, original actor/dialogue captures,
saved notebook and no replay after reload. Money and inventory were unchanged.
Rendered road captures show Ryo and Jimmy; truck and interrogation scenes were
inspected. Exhaustive audio/stunt/door fidelity is not claimed.
