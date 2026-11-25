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
| Dialogue / audio / cameras | Original A0160, 01BNK and 01EAR AUTH camera/body/voice/SFX tracks, speech deformation and recovered hand/expression callbacks. F1004A124/B141/B146 are coherent original FUKU HUMANS lines, not newly voiced dialogue. Lead-in poses/camera borrow A0160's first frame; holding them through those lines is an adaptation. Home-scene music and callback gaze/head tracking remain omitted; the existing KKYB package retains its source-associated dream music. |
| Weather / personal time | Preserve ordinary personal weather/season for the house. The dream isolates its original presentation stage. Only successful dream-plus-bank completion advances to the next personal day at 08:30 and restores the established bedside arrival. No public clock mutation. |
| Effects / notebook | Home update saves its own milestone/page. Dream, withdrawal milestone/page, one ¥36,502 grant, next-day clock and bedside arrival commit together. The family discussion adds only its milestone and travel-agency notebook clue. It cannot give funds again. Existing shared economy rules remain authoritative across play modes. |
| Exit / controls | Home update and advice restore prior gameplay pose/camera/controls in JOMO. Completed sleep returns to the existing supported Ryo bedside spawn. The next objective is checking Global Travel or Asia Travel in Dobuita. |
| Leave / skip / failure / replay | Explicit leave/stay-awake, cancellation during either movie, failed preparation and stale acknowledgements settle no funds or day jump. The noninteractive presentation supports the existing explicit skip; it is not a challenge result. Reload reads committed receipts without replay or payment duplication. |
| Declared adaptations | No automatic 23:30 teleport from the warehouse, forced house/yard lock, original sleep-menu reconstruction or cinematic-minute debit. Player-confirmed home approach and sleep keep the causal order; later agency events require the saved family discussion. |

The authored hall and bedside regions do not overlap: the saved Fuku
conversation position remains outside the sleep region, while the established
bedside arrival is inside it. This prevents the sleep choice from interrupting
the player immediately after the conversation. The client and server use the
same bounds; this is an authored trigger adjustment, not a recovered native
volume. A rendered cloned-checkpoint regression covers the conversation,
separate bedside approach, cancellation/retry and saved next morning.

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

### Original home presentation callbacks

The [retained original callback evidence](../../tools/evidence/home-ticket-callback-ir.json)
comes from Disc 2 JOMO MAPINFO, SHA-256
`6a4e6e8d8e71aa450fef6922ebe0036776a94cb498710a562e4418a9338037fe`.
The generator verifies each owner's coroutine launch and original SCEX slot,
then uses the shared hand, expression and object compilers:

| Scene | Owner | Callback | Original slot |
| --- | --- | --- | --- |
| Home update | `0x706a0` | `0x70b18` | 19 |
| Bankbook | `0x70d24` | `0x71190` | 10 |
| Kitchen discussion | `0x730dc` | `0x7353c` | 17 |
| Fuku's contribution | `0x718e8` | `0x71f20` | 13 |

Slots count empty eight-byte TRCK records too; dropping them selects the wrong
callback. Shared OP00 hand assets are reused only after verifying byte identity
against the Disc 2 originals. The FACE installer clamps its signed 16-bit
duration to at least one tick, so zero-duration expression setup is valid.
The shared compiler now follows that source rule rather than rejecting it.

The bankbook keeps its original AUTH trajectory. Its original node `152` opens
at frame 270 (rotation `[-23718,0,0]`) and closes at 665. No guessed wrist
attachment is added. `PIG_` attaches to Fuku's right controller `18` at frame
345, transfers to Ryo's left controller `12` at 890, and returns to original
world motion at 1134. The original later motion parks the intact model below
the floor. Breaking debris is still omitted. FACE gaze and LKPT head tracking
are retained in the evidence but deliberately not assigned inferred targets;
the family scene's terminal expression reset is covered by actor cleanup.

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
The October 23 presentation recheck plays all four home-update, two bankbook
and 28 kitchen recordings naturally. Rendered mouth controls and face vertices
change for both home-update speakers, Ryo at the bankbook, and all three kitchen
speakers. Reviewed shots show the opening Sumitomo book and detailed hands;
native and diagnostic kitchen/home captures were inspected. Every gesture,
gaze, expression and shot is not certified, and audio fidelity was not assessed
by listening.

The connected recheck starts from an isolated save with the earlier mirror
prerequisites, then earns home update, dream/withdrawal and family advice across
saved interruptions. It rechecks decline/cancel/retry, the one ¥36,502 award,
next-day 08:30 arrival, notebook, controls and reload. This is not a fresh
uninterrupted full-game playthrough.

This check exposed two shared entry problems: optional lessons/pickups had
higher priority than required Story routes, and movement continued during the
server's event-selection request. Optional entry offers now use the lower
100-series priority band. The region runtime latches all simultaneously eligible
overlapping bounds and holds a scoped movement lock until the presentation
takes ownership or the request terminates. Focused tests cover rejection,
cancellation, timeout, reset and safe retry. Same-room cinematic reloads treat
the server's already-dispatched automatic-event receipt as expected, without
running native fallback effects. The scroll's distinct earlier approach can
still offer normally; the connected test declines it through the actual UI.

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
| Props / approximation | Ledger, pen and flyer roles at Global are reviewed role-based assignments, not recovered callback bindings. Asia's props use the original CHRS image table (see below). Original movement supplies trajectories. Global's cinematic door actor is transform-only: exploration keeps the real doorway. The home piggy bank uses its original hand transfers and world trajectory, with recovered detailed hand poses/components. Breaking debris remains omitted. |
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
flyers, restored controls, and saved reload without replay/payment. The October
23 rerun passes this chain after the newly reviewed home events and ordinary
Twin Blades pickup/Read/mode round trip. Fuku's contribution increases the save
from ¥38,502 to ¥78,136 exactly once. Reviewed captures show the original Global
cast, piggy bank in Fuku's hands and its transfer to Ryo, and the Asia cast/camera
in DAZA. A separate full/cancel presentation recheck plays all 22 contribution
recordings, verifies attachment ownership/release and restores avatar, pose,
view and controls without progress changes. Contribution-specific facial
deformation was not instrumented in that pass. Every shot, finger contact and
audio fidelity by listening remain unverified; flyer inventory artwork is not
added or visually checked.

The first rendered continuation exposed a dispatch error: reusing the earlier
advice region also reused its completed-event gate, so the contribution never
started. A distinct contribution region now shares the reviewed room bounds
but has its own prerequisites and completed flag. A focused runtime regression
test verifies that completed advice does not retire this later event. No
collision or door rule was changed.

## Remaining ticket progression

The next-morning call, arcade Chai fight and connected Asia Travel chase are
implemented below, with their individual fidelity and verification limits.
A payment, promise, call or completed introduction is not a fight or chase success.

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

The October 23 connected rerun continues the same isolated save that earned
the home withdrawal, agency quotes and Fuku contribution. It passes Nozomi's
referral, real storefront entry, quote/payment decline and cancellation,
natural endings, one ¥69,000 charge (¥78,136 to ¥9,136), the enforced
collection delay, Jimmy's promise and reload without another payment or
scene. It takes about 4.4 minutes including GPU preflight. Earlier mirror
prerequisites were seeded; this is not a fresh full-game playthrough.

An October 23 presentation-only recheck of ticket collection also verifies
Koji's original `TPL_L` mouth moving with his recorded line. Its stored mouth
targets differ from the resting face; the shared resolver now follows original
source ordering instead of looking for an identical closed shape. Native-shot
and diagnostic frontal captures were reviewed, then cancellation/replay and a
natural ending restored the avatar, camera and controls without altering the
isolated save. This does not rerun the payment/progression chain or establish
all body gestures and props. See the [shared facial implementation](../implementation/cutscenes.md#character-faces).

## Nozomi's flowers for Iwao

After Jimmy promises the ticket at Asia Travel, Ryo can visit the family altar
on the same personal Story day. Walk along the corridor toward the altar room.
Ryo notices the new flowers and Ine-san explains who brought them. The visit
is optional. The snow dream, morning call and ticket storyline proceed independently.
The original visit and its day window are documented in the
[recorded altar encounter](https://www.phantomriverstone.com/2018/11/the-hazuki-family-altar-part-one.html).

Disc 2 JOMO function `0x41a72` checks Ryo inside the rectangle, sets bank bit
`2:924` and dispatches room command 32. The browser uses the original XZ bounds
and restricts height to the ground floor. Yarn checks the saved day of Jimmy's
promise and the two original exclusion bits, `2:924` and `2:380`. It commits
the scene receipt and `2:924` together after completion or explicit skip.
Cancellation leaves both available for a retry. Bit `2:924` also has another
writer later in the game, so the named receipt records this particular visit.

The room selects native slot 36. The 1,248-frame film uses the original
Ryo and Ine-san motion, camera, five English lines with lip cues, ten distinct
sound effects and BGM070. The animated `BUTM409G` lilies carry both original
textures. During playback the scene hides the everyday `BUTM408G` arrangement,
then restores the room when control returns. Two gaze requests lack verified
timing. The exact native stage effects and persistence of the bouquet after
the encounter remain open. The existing audio and asset tools rebuild the
private package with `npm run build:nozomi-flowers`.

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
| Props / weather | Borrow and restore the existing `TEL_` / `S1_JOMO_TELS514G.MT5` phone; do not create a duplicate. Its handset follows the original left-Fuku/right-Ryo handover and receiver-local transforms. Original detailed hand poses/components are recovered. Keep normal personal weather outside the isolated vision. Cord simulation and exact gaze remain omitted. |
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
Fuku/Ryo home-phone shots. The initial dream capture exposed a missing backdrop
and inherited bedtime lighting; the presentation repair below addresses those.
At that review, rendered snow remained absent, independently of eligibility,
dialogue and saves. The later cinematic-snow approximation is described below.
Audio playback fidelity has not been assessed by listening.

The October 23 earned-save rerun passes the same chain after the connected
boat-ticket rerun (about 2.4 minutes including GPU preflight). Both cancelled
and naturally completed phone scenes restore controls; reviewed original
camera captures show the restored handset in Fuku's and Ryo's hands.
An independent local database read confirms the dream/call and notebook
milestones, December 11 morning in the house, and unchanged ¥9,136. No
appointment or completion flags were injected for these two continuations.

### Snow-dream stage presentation

The retained JOMO owner calls `0x4891c` and `0x463e4` immediately before slot
52. The [original helper evidence](../../tools/evidence/jomo-snow-vision-setup-ir.json)
shows `0x463e4` loading `sprite/SCROLL19.SPR` and calling `0x4b358`, which
selects native light preset 6 and configures fog/background colors. The sprite
is a blue/pink horizon matte, **not** a snowflake particle texture. Its bytes
are identical on Discs 1 and 2 (SHA-256
`9c462d2ce4cc5ee3f53a527221d934d943d21c6994e893e9400af7a464531fa0`).
The canonical vision generator now includes it and verifies the owner, setup
calls, resource name and hash.

Standalone AUTH playback now owns the existing shared scroll renderer just as
native programs do, with independent control state and cleanup. The solid
stage background is drawn behind prepared scroll layers; previously it hid
them. Rendered cancellation, replay and natural completion pass with the
original matte visible, ordinary world/camera/avatar restored, and no changes
to saved flags, funds or inventory. Captures at frames 180, 450 and 900 were
reviewed. The shared native quad draws V1 at screen top and V0 below, so its
orientation intentionally differs from a top-down exported PNG; no manual
flip or snow-dream-only texture offset was introduced.

Lighting uses the existing neutral browser preset 0 to avoid inheriting the
player's bedtime darkness. This is an explicit approximation, **not** native
light preset 6: the full original light types, fog/color-slot projection and
adjacent `0x0174/0x0176/0x0178/0x0179` presentation controllers remain unmapped.
The exact native particles remain unmapped. A later browser approximation uses
the shared weather renderer's bounded cinematic profile: a camera-relative
snowfall that does not apply outdoor fog or surface collisions. Rendered tests
show flakes in this dream and confirm cancellation removes them before the
phone scene; the profile is not a reconstruction of the original particles.
Neither this repair nor the passing progression test certifies exact native
lighting or presentation.

### Shared handset presentation

The [original Jimmy callback](../../tools/evidence/jimmy-telephone-callback-ir.json)
is Disc 2 JOMO owner `0x74dc8`, callback `0x7535c`, native SCEX slot 4.
It binds receiver render control 3 to Fuku's left endpoint at frame 160,
adjusts the receiver-local grip at 170, transfers to Ryo's right endpoint at
521, and releases at 1135. The shared callback compiler also retains the
original detailed hands. The telephone base stays in its authored scene.

The original executable's receiver setup `0x0c16ba08` resolves the formerly
unimplemented TELM modes 11/12: receiver-local XYZ float translation, followed
by fixed-turn Z/Y/X rotation. The fixed hand correction is `(0.075, 0.025, 0)`;
the earlier evidence incorrectly used literal-address order instead of
FR4/FR5 argument order. The [source-checked evidence](../../tools/evidence/tagged-telm-control-operation-evidence.json)
now guards that instruction flow. Both AUTH calls and Goro's existing scripted
telephone use the same adapter; there are no per-scene guessed offsets.

`NEW_YOKOSUKA_STORY_FACES_E2E=true NEW_YOKOSUKA_STORY_FACE_SET=telephone`
on the isolated saved fixture verifies Jimmy cancellation after a Space skip
across the handover, immediate replay, and natural completion; it also runs the
Nozomi call. Reviewed rendered captures show the held handset upright rather
than sideways. All 12 Jimmy and 19 Nozomi voices play; FUK/INE/YKC mouth and
face geometry change over multiple rendered frames. Handset ownership, avatar,
location, camera and controls restore without changing money, inventory or
Story flags. This is presentation verification, not a new end-to-end earned
story playthrough or rendered certification of Goro's separate call. Exact
cord physics and every finger contact remain unverified.

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
| Cast / props | Ryo and Chai (`CHA_M`); victory also uses Yuji Nito (`NITO`, `GAT_L`); rescue uses Fuku (`FUB_M`). The generator reads these package-owned bodies from original GMCT CHRS/DefImage records, rather than inferring filenames from image or actor names. Shared ownership suppresses overlapping ambient bodies. The original CHRS identifies DOOR → DR17_001 and SLOT → GAMT101G. Their timeline references are retained, but normal DGCT scenery remains fixed. The original ticket follows Chai's hand using an authored grip and visibility window; detailed finger and eating callbacks remain omitted. |
| Fight / timing / cameras | Original introduction-ending positions feed the existing client-simulated fight. Physical movement, punch/kick/throw/guard inputs drive real health, hits, basic opponent AI and outcomes. Shared generic animations, 100/120 health, speeds and rectangular arena padding are adaptations; Chai's original low-kick moveset is not reconstructed. The normal orbit camera remains player-controlled. Environment/weather stays personal; no new battle music is asserted. |
| Victory | The client combat result selects the original victory ending. Its acknowledgement atomically saves the won flag, chapter milestone and Asia Travel notebook clue; stay in the arcade that personal day with prior controls/camera restored. |
| Defeat | Only a genuine zero-health knockout selects the original Fuku rescue. Its acknowledgement saves the loss, chapter/clue, pending recovery and established bedside arrival. The original A0173 recovery plays at the bedside; its acknowledgement clears the pending receipt and advances the personal clock to next-day 08:30. Offscreen travel and the remainder of the rest day are condensed. |
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

### Arcade presentation review (2026-10-23)

GMCT binds the image named `FUK_M` to the actual model `FUB_M` (CHRS-relative
character record 376, image property 404, DefImage record 72). A global
`FUKU → FUK_M` assumption previously selected the wrong body. All three GMCT
packages now preserve their serialized model bindings, including
`NITO/GAT_M → GAT_L`. Rescue reuses TGMA's exact FUB FACE, FTBL and original
TALK-pose assets through the shared face catalog; no duplicated face assets or
actor-name-based compatibility fallback are added.

The isolated rendered review (`NEW_YOKOSUKA_STORY_FACE_SET=arcade`) passes
cancel/replay of the introduction, natural completion of all three films,
all 11 introduction / 4 victory / 3 rescue recordings, and restored avatar,
location, camera mode, movement and actor ownership. Money, inventory and
Story flags remain unchanged. Native shots and diagnostic face closeups were
inspected; FUB, YKC, and the existing generic CHA_M/GAT_L speech geometry change
over multiple rendered frames. Chai already had working generic mouth animation;
this does **not** claim an original detailed CHA FACE/expression reconstruction.
The review takes about 2.5 minutes including GPU preflight, one browser at a time.
It complements, rather than repeats, the connected fight-outcome tests above.

Original CHRS names `TIK1`–`TIK4` as `TIKHIA1G`–`TIKHIA4G`. The first original
ticket model and its embedded texture are now packaged and follow Chai's right
hand through the gesture toward his mouth. The grip and frame 515–870 visibility
window are authored from rendered motion review, not recovered callbacks. It
disappears as he eats it; intermediate bite deformation and exact finger contact
are not implemented. One rendered check cancelled during the scene, replayed
it to its natural ending with all eleven original voice clips, and verified
restored state. Captures show the textured ticket in his hand and near his
mouth; this is not a fresh connected battle or exact-fidelity claim.

GMCT uses the older
SCN3 instruction stream (`0x00000100`, entry file offset `0x20cb`), not the
compiled SH-4 format handled by the current callback extractor. See the
[source-format inventory](../../tools/evidence/scn3-container-encoding-evidence.json).
The existing community bytecode decoder is not yet a validated source of the
ticket/hand frame guards; the authored attachment is not presented as recovered
behavior. Cabinet knock-over and exact ticket manipulation remain unfinished.

### Home recovery after an arcade knockout

Disc 2 JOMO `MAPINFO.BIN` contains the original 600-frame A0173 at `0xb3634`
(SHA-256 `345482a8010ea23f04e26016f3fe65a2bac701559a7f951446af75940b6779e8`).
It uses `M_0173.MOTN`, Fuku and Ryo, four A0173 voice clips and seven effects.
The adjacent source resource cluster names A1_FUKAN and BGM101. The package
reuses those exact original assets, camera, timing and the existing character
faces. The bedroom trigger and pending receipt are authored; this does not
establish every original situation that could invoke A0173.

Only newly acknowledged losses set the pending receipt, so old completed loss
saves cannot unexpectedly play the scene or advance another day. Cancellation
or a failed load leaves the receipt and same-day clock intact for retry. The
scene's final acknowledgement clears the receipt and advances to the following
personal morning without changing money or inventory.

An isolated connected run used an earlier seeded Jimmy prerequisite, the real
arcade door and an actual unguarded fight to reach defeat, played the original
rescue, then naturally triggered A0173 at home. Cancelling and re-entering the
bedside region retried it; its natural completion saved the next morning and
the notebook without changing inventory or currency. A separate reload on that
same saved character confirmed no replay, no second date advance and restored
controls. The test skipped the repeated arcade introduction; this is not an
uninterrupted new-game playthrough. A separate rendered scene review observed
all four voice cues and cancellation/replay. Exact facial detail, original
trigger ownership and blanket motion remain unverified. New extracted assets
must be published before a future deployment.

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
obstacles and stunt animations are not claimed. The original `CTERST.PKF`
`CHARA.CHRT` binds DOR1 to `DR07_001` and DOR2 to `DR08_001`; their exact
models and texture pack are extracted from `CTERST.PKS`/`CTERST.PKF`. The
separately placed exploration door at transition `d000-door-25-to-daza-reverse-matched`
is hidden under a scoped replacement lease and restored when the movie ends or
is cancelled. `CAR_` now
resolves to `CARO101G` through the original `CTERBASE.PKF/CHARA.CHRT` record
(character offset 2068, image offset 2076, definition offset 2028).
The earlier guessed `C85N305G` truck actually belongs to `CAR4`. Both capture
and escape now package the exact `CAR_` model; the pinned source archive and
record offsets are retained in each manifest.

Only all thirteen real client-timed inputs and the acknowledged capture film
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

The 2026-10-23 rendered follow-up completes all four original films, checks
opening cancellation/replay, changing Ryo/Jimmy speech geometry, all 39 available
recordings and restored avatar/location/camera/controls without progress grants.
After replacing the vehicle, the connected chase test also passes on the
newly earned Chai-win save, including actual keyboard input, failed chase,
cancelled capture, interrogation cancellation/reload and saved harbor-job clue.
The keyboard test observes the client's current QTE step rather than the
obsolete server `button` field. Earlier mirror prerequisites on this isolated
save were seeded; this is not an uninterrupted new-character playthrough.
On 2026-11-07 a presentation-only GPU run verifies that both source door models
render and rotate through cancellation/replay and natural completion; the
exploration door is hidden during playback and restored afterwards. Sampled
frames show Ryo knocking at the shutter and Jimmy emerging. A separate isolated
server check seeds the Chai win and earlier clue, then passes actual approach,
decline, cancellation, failed chase and retry, all thirteen keyboard inputs,
cancelled capture, office arrival, interrogation, saved notebook and reload.
The earlier story was not played in this run. Raw door assets are ignored and
must be published before deployment. Exact hand contact, every camera shot,
and original chase obstacles remain unverified or approximated.
