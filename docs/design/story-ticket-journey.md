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
| Props / approximation | Ledger, pen and flyer roles at Global and the two pamphlets/magazine at Asia are reviewed role-based assignments, not recovered callback bindings. Original movement supplies their trajectories. Global's cinematic door actor is transform-only: exploration keeps the real doorway. The intact home piggy bank uses its original trajectory; breaking debris and exact finger callbacks are omitted. |
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

Next are the cheaper boat lead, payment/collection delay, Jimmy's call, the arcade Chai
fight and the resulting Asia Travel confrontation. These are not completed by
the home-preparation flag.

The `01MON` piggy-bank subtitle states ¥39,634; the same integer occurs in
JOMO MAPINFO at `0x71a44`. That exact amount is used by the authored settlement,
not a reconstruction of its full native controller.
