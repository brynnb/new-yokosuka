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

## Remaining ticket progression

Next are original agency fare quotes and flyers, Fuku's piggy-bank contribution,
the cheaper boat lead, payment/collection delay, Jimmy's call, the arcade Chai
fight and the resulting Asia Travel confrontation. These are not completed by
the home-preparation flag.

The already identified original `01MON` piggy-bank scene at JOMO `0xa9588`
states ¥39,634 in its subtitle archive; the same integer occurs in the source
MAPINFO at `0x71a44`. This is a useful input for the later contribution, not a
grant or a claim that its full native controller is implemented.
