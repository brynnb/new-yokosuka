# Harbor work and the Mad Angels

This chapter continues the earned Jimmy interrogation through the ordinary
server/Yarn event system. It does not execute the original room controller.
The [story event template](story-event-template.md) defines the shared contract.

## Hiring

The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed pp. 49–51, establishes the sequence: find Goro near Warehouse No. 12,
meet him at Warehouse No. 1 the next day at noon, meet Yada at Alpha Trading
at 2 p.m., then meet Mark and learn forklift work. Guard/foreman inquiries
are optional guidance and have not been added as mandatory gates.

| Event / location | Eligibility / trigger | Presentation | Saved outcome |
| --- | --- | --- | --- |
| `goro-job-lead`, harbor street near Warehouse No. 12 | Earned Jimmy interrogation; personal 08:30–20:00; approach original Ryo starting position | `GOROCOOP/SEQDATA1.AUTH`, Ryo/Goro, original 01GOHA speech | Job promise, notebook and personal promise day |
| `goro-job-appointment`, Warehouse No. 1 blue door | Promise saved; a later personal day, 12:00–17:00; approach | `MGOR/SEQDATA0.AUTH`, Ryo/Goro/Mai, original 01GORA speech | Yada appointment and notebook |
| `harbor-job-hiring`, Alpha Trading entrance | Appointment saved; 14:00–17:00; explicit meet/leave choice | `MARU/SEQDATA0.AUTH` interview, then `SEQDATA1.AUTH` Mark introduction, original 01MAK speech | Hired milestone and training notebook; no training result or pay |

Each scene pauses ordinary movement, borrows the local Ryo and suppresses
overlapping ambient actors through shared ownership. Original AUTH supplies
body motion, cameras, shots and voice timing. Speech and effects come from
the original AFS/SND archives. Preserve the personal weather and lighting;
these conversations require no special weather. No QTE or fight occurs here.
The player returns to the approach location with camera and controls restored.

All completion effects settle together after the final acknowledged scene.
Explicit X-skip accepts a noninteractive presentation; cancellation, failed
preparation or timeout grants nothing. Hiring requires both films, including
after a cancelled Mark introduction. Saved completion prevents automatic replay.
Missing an appointment permits return during its hours on a later day; this
forgiving window is an adaptation, not a recovered native condition.

## Original assets and declared adaptations

`tools/cutscenes/build_harbor_job_pack.mjs --audio` pins Disc 3 archive hashes,
checks every extracted member and uses the shared activity/audio compilers.
The resulting manifests record source hashes, ordered actors and outputs.
The selected SND banks are A1_GOH, A1_GOROU and A1_MARK: matching names and
complete requested sound-command coverage support these associations. This
is not a claim of reconstructed native resource-owner selection.

The resident harbor does not load the Alpha Trading office. The interview
temporarily loads the original `ALPHA.PKS/MAPALP.MAPD` HRCM model and
`ALPHA.PKF` textures as a scene-owned room at its original origin; shared
cleanup releases it after the film or cancellation. No extra permanent map
or second travel system is introduced.

GORO, HINA, TMRA and MARK use their existing scheduled character models.
MARU's original SGG_L/SGJ_L worker models supply ETC1/ETC2, and FOKS502G supplies
the forklift. Their exact tag associations are authored choices requiring
rendered inspection. DOOR and HAKO remain explicit unmapped references;
moving door/crate geometry is not claimed. Activation volumes are authored
around original actor poses and the Alpha entrance, not recovered EVNT regions.

## Coverage and remaining work

The actual generated Yarn passed the focused server/compiler tests for
prerequisites, personal day/hour gates, missing date records, later-day retry,
Free roam exclusion, repeat prevention, decline, cancellation during either
hiring film and once-only staged effects. Those tests do not use a database;
the connected browser run supplies the PostgreSQL evidence.

`NEW_YOKOSUKA_HARBOR_HIRING_E2E=true` continues the genuine Jimmy-earned save
through physical approaches, Goro cancellation/re-entry, same-day appointment
rejection, normal wait-menu advancement, Goro/Mai cancellation/retry, hiring
decline, cancellation during Mark's introduction, reload/retry, its natural
ending, saved notebook
and reload without replay. Currency and inventory remain unchanged. Rendered
captures show Goro, Mai, the original Alpha office/Yada, and Mark seated in the
original forklift. Exhaustive gesture, prop and audio fidelity is not claimed.
The shared presentation, package ownership/readiness and scene-object suites
pass 56 checks, including failure/cancellation cleanup for the reused room lease.

Forklift training now passes the connected three-delivery browser check,
including cancellation/retry, saved completion, controls and reload.
The subsequent evening chicken race is also connected and browser-verified.
The following morning's three-lap race and five-crate first batch are connected
and browser-verified, as are Mark's noon rescue, the afternoon batch/attack,
once-only payday and Goro's warning. The return-home dream and second morning's
race also pass their connected rendered continuation.
The second day's cargo/ambush/payday also pass connected rendered checks;
the subsequent Mark rescue and brother explanation also pass their connected
rendered continuation. The third-day daytime continuation and its evening biker
chase, both fights and original interrogation also pass connected rendered
verification. The Lan Di dream and fourth morning through lunch also pass their
connected continuation; the afternoon and later workdays remain missing. Existing
forklift driving, cargo and racing must be reused; neither film completion
nor a client-reported win may grant a shift's salary or story outcome.

## Forklift practice

Event: `forklift-training`, after the saved hiring chapter. An authored approach
near the original Mark introduction offers practice or leaving, between 14:00
and 17:00 on the personal clock. Missing the afternoon permits another day.
The original hiring film already supplies Mark's instructions and introduction;
the practice HUD adds unvoiced instructions rather than invented voice lines.

The ordinary forklift assembly supplies the original vehicle, crate model,
Havok movement, lift controls, driver animation, sounds and gameplay camera.
The exercise leases one server-created vehicle and one crate at a time. Other
players can see these ordinary world entities, but cannot drive or claim a
different player's assigned equipment. Their progress and calendars are separate.
No additional NPC is needed. Preserve the personal weather and scene lighting.

Three lift/carry/drop deliveries complete the exercise. The server watches
accepted vehicle/cargo updates: bounded movement, the assigned driver, lifted
cargo, at least three seconds carrying, an upright stationary drop inside the
destination and a one-second settled interval. Completed crate IDs are removed
and cannot count again. The next crate appears only after returning to the
starting position, so it cannot materialize in the reversing vehicle's path.
A fixed jitter allowance cannot be farmed by sending
extra position updates. This validates observations from the existing client
physics; it is not a claim of fully server-simulated vehicle physics.

Original MARU's forklift begins at browser `[-11.376,0,120.5845]` with a converted
facing of approximately 74.61 degrees. The exercise uses the same street and
facing with nearby authored spawn/pickup/drop coordinates. A raw geometry ray
showed the first draft's north-facing position had a wall only 2.16 metres ahead;
the current corridor follows the original facing. Its two-by-three-metre
delivery pad leaves clearance before the wall. Exact cargo placement,
three deliveries, the marked outdoor loading pad and a fifteen-minute real-time
limit are adaptations. The original has work inside Warehouse No. 3 until 17:00;
opening that warehouse's native work-room setup is not required for this
condensed lesson. The destination marker uses the actual rendered terrain.

The existing Story run pauses the personal clock. Only observed success lets
Yarn atomically save training, its day, the next notebook page and a 17:00
finish. This practice grants no salary or quota bonus. Paid shifts are separate.
Expiry offers retry/leave; cancellation, failed loading and stale responses
cannot settle progress. Every exit releases the attempt's entities, restores
the prior player pose/camera and returns controls. Reload after a committed
result preserves the note and avoids replay.

Focused server tests cover the actual generated Yarn and its service boundary,
movement limits, carry/drop evidence, duplicate delivery prevention, character
and mode fencing, failure and cancellation. Client checks cover resource leases,
late loading, missing terrain, keyboard releases after UI focus changes and
vehicle removal. The connected hardware-rendered check resumes the actual
hiring-earned save, declines once, cancels an entered vehicle, retries, then
uses normal keyboard input and Havok cargo for all three deliveries. PostgreSQL
saves the milestone, day, notebook page and 17:00 finish; yen and inventory stay
unchanged. Controls, camera and location restore, and reload preserves completion
without another prompt. No delivery evidence or future flags are injected.

The check also exposed a shared fleet bug: mounting another vehicle re-enabled
removed forklifts, including their colliders at the same spawn. The authoritative
fleet IDs now fence visibility and entry, and a finished removal fade disposes
the retained model. This repair applies to ordinary forklifts as well as training.
Desktop keyboard gameplay is verified; mobile controls have not been assessed.

## Evening chicken race

The GameSpot guide, printed pp. 51–52, places the riders' harassment of Shozo
near Hokuhoku Lunches after 19:00 following forklift training. The winning
inputs are A, Down, Left, Right. This encounter precedes the first paid workday
in the guide; it is not a wage or an automatic success from watching a film.

| Field | Authored event |
| --- | --- |
| ID / location | `chicken-race`, personal Story mode, `MFSY` harbor. |
| Prerequisites / trigger | Completed forklift practice; 19:00–23:00 personal time; approach around original Ryo position `[1.7274,0,88.9241]`, then choose help or leave. The bounds and later-evening retry window are authored. |
| Setup / actors / props | Borrow Ryo; privately stage Shozo, Takashi and Takahiro with original character models. Original RACE motorcycle models supply the bikes; their particular BIK1/BIK2 associations are authored choices. |
| Sequence / audio / camera | Original `RACE/SEQDATA1.AUTH` introduction with original body motion, camera and 01CRA voices/effects. Then an authored side-by-side riding tableau and server-timed A/Down/Left/Right prompts. Captions describe the outcome without inventing voiced dialogue. |
| Timing / challenge | Introduction may finish or be explicitly skipped. Only four timely server-accepted inputs win. Two-second windows, stationary riding staging and a fresh attempt after failure are declared adaptations. |
| Weather / lighting | Preserve the personal evening environment; no additional date, season or weather gate. Separate lamp, headlight and reflection reference actors retain transforms but have no newly rendered geometry. |
| Completion | Atomically save the race milestone, day and notebook entry after the acknowledged success caption and presentation cleanup. No pay, possession, move reward or calendar jump. |
| Exit / cancellation / replay | Restore the prior avatar pose/camera and ordinary controls. Decline, failure, interrupted loading and cancellation (including after the last input but before the ending) grant nothing and remain retryable. Saved completion prevents automatic replay. |

`tools/cutscenes/build_harbor_chicken_race.mjs --audio` pins the Disc 3 RACE
archive, texture bank, 01CRA stream and A1_CRA sound bank. The existing activity
and audio compilers validate the introduction. `M_MBQC.MOTN` supplies the
original riding loops. Authored tableaus now borrow the same standalone
scene-object runtime as native cinematics, rather than misusing the hand-prop
attachment path. Their resource lease also owns failed/late-load cleanup.

The moving native chicken-race course, opponent's fall into the sea and
post-race combat-move teaching are not reconstructed here. Rider/handlebar contact
is approximate. The outcome caption does not claim those effects are animated.
Focused compiler/engine tests cover
eligibility, real input order, stale tokens, timeout, retry and cancellation
before final settlement. The connected hardware-rendered check resumes the
training-earned save, verifies the early-hour gate, declines, cancels the original
introduction, lets it finish naturally on retry, fails an input, retries, wins but
cancels the unacknowledged ending, then earns the actual completion. Position,
first-person camera and controls restore; PostgreSQL saves the milestone, note
and day; money/inventory are unchanged and reload does not replay the event.
The authoring compiler now rejects anonymous or untagged dialogue lines before
generation, preventing an outcome caption from failing only after the QTE.

The next connected sequence is the first paid workday. The guide, pp. 53–55,
places the morning race before ten deliveries to Warehouse No. 18, a noon rescue
of Mark, an afternoon attack, payday and Goro's warning. Quota completion alone
must not mark that whole narrative day complete. Reuse existing racing,
delivery, combat and transactional payment; do not infer story success from
the exploration race's local best-time record.

The personal-clock display mismatch found during the chicken-race check is
fixed through the shared world-state protocol. Paused snapshots freeze game
time without freezing server wall time, and event entry/exit publishes the
transition immediately. Focused clock/realtime tests and a connected rendered
sidebar check verify a stationary HUD during a choice, cancellation/resume,
normal next-morning advancement and unchanged money, inventory and story flags.
Use `NEW_YOKOSUKA_CALENDAR_E2E=true` with the earned-save harness to repeat it.

## First working morning: verified race and saved harbor return

`workday-one-race-entry` offers a race-grid transfer near Mark's training
corridor on a later personal day after the chicken race, from 08:30 to noon.
This explicit approach, the forgiving hours and the project's 08:30 waking-day
start adapt the guide's automatic 07:30 wake/harbor arrival. The short briefing
is an unvoiced authored caption, not an invented original recording. Boarding
grants no race outcome, salary or prize and remains repeatable until a race is
completed. Leaving the choice has no durable effect.

The race-grid region is scoped to `ma00race`; the separate practice world also
uses native area `MA00` and must not select this encounter. Both the browser and
the server's accepted-position bounds apply the world fence.

`workday-one-race` uses the existing original-asset MA00 course, forklift physics,
arrows, timer, camera and controls. A temporary server-owned vehicle appears just
ahead of the existing starting row at `[66,0,105]`. The earlier authored z102
spawn was beside a course barrier; rays against the actual Havok terrain show
the forward lane at z105 is clear. The approach is beside the captured MGDM
position, not inside that NPC's collision cylinder. The resource adapter is now
shared with deliveries rather than duplicating vehicle loading or input rules.

The five grid positions are now `raceGrid` templates in the shared vehicle
catalog, not permanent `forklifts` spawns. The connected check reached the next
lap and exposed the unused vehicles blocking the finish straight. Ordinary
exploration entry already supports requesting a vehicle when the grid is empty;
it now uses those same original templates on demand. This fixes the shared
course rather than hiding colliders only for Story mode. Practice-world
forklifts are unchanged. Export vehicle catalog updates with
`scripts/check-server-contract.mjs --sync-vehicles`.

The same versioned course supplies the exploration HUD and the server: thirteen
ordered gates per lap, three laps. Its centers come from the existing native AI
TASK recording; gate radii remain authored tolerances. The three-second
countdown starts only after the assigned driver enters, so loading cannot spend
it. Accepted, bounded vehicle observations cross gates; walking, repeated polls,
skipped gates, another driver, another mode or a stale lease cannot finish.
The thirty-minute real-time limit is deliberately forgiving. Personal Story
time pauses; the race and its lease use advancing wall time.

An acknowledged course finish atomically saves a separate race milestone,
notebook page and workday date, establishes a minimum 09:00 work start, and
returns to the already tested harbor loading corridor. It does not complete the
paid shift. Finishing rank and rank-based collectible prizes are not yet
implemented; neither the local best-time record nor a film can grant them.
Cancellation, failed preparation or timeout grants no completion, releases the
vehicle, and restores the prior camera/pose/controls. Reload must preserve a
committed outcome without replay.

Focused server/compiler checks cover the actual generated Yarn, full three-lap
observations, identities, countdown/loading, incorrect ordering, cancellation,
retry, expired sessions and atomic effects. Client checks cover the shared
resource lease, authoritative HUD and world-scoped trigger. The connected
hardware-rendered check resumes the genuinely earned chicken-race checkpoint,
uses normal keyboard driving and Havok physics, cancels/retries and completes
all thirty-nine gates over three laps. The driver follows the pinned original
AI driving-line recording; it cannot inject vehicle positions or race results.
The run verifies the ending acknowledgement, saved notebook/day/09:00 minimum,
harbor arrival, restored controls and unchanged money/inventory. A separate
short reload check verifies that completion persists without replay or another
race prompt. This is a verified morning race, not a completed paid workday.

Use `NEW_YOKOSUKA_MORNING_RACE_E2E=true` with the earned-save harness and
`NEW_YOKOSUKA_RACE_ROUTE_CSV` pointing to the original recording identified in
`tools/evidence/ma00-forklift-race-course.json`. Use
`NEW_YOKOSUKA_MORNING_RACE_RELOAD_E2E=true` only with an already earned race
checkpoint; it checks reconnect without repeating the eleven-minute drive.

## First morning cargo batch

`workday-one-morning` requires the earned race and a 09:00–12:00 approach to
the same loading corridor. An unvoiced briefing explicitly explains that five
crates are dispatched here before lunch, another five remain for the afternoon,
and wages come later. This is a declared outdoor loading-pad adaptation of the
original Warehouse No. 18 job, not a reconstructed warehouse interior.

The existing observed delivery challenge requires five actual lift/carry/drop
deliveries. The shared Yarn batch template presents a completion caption before
atomically saving the morning milestone, notebook and noon personal clock.
Cancellation before that acknowledgement settles nothing. No wages, quota bonus,
fight result or full-workday completion is granted. A failed batch can be tried
again in a later morning window rather than forcing the original workday controller.

The connected hardware-rendered check resumes the genuine race-earned save,
declines, cancels/retries and physically delivers all five crates using normal
keyboard input and Havok cargo. It checks that the unacknowledged ending has no
effects, then verifies noon, the saved note, unchanged inventory/yen, restored
controls and reload without another batch. Run
`NEW_YOKOSUKA_MORNING_CARGO_E2E=true` against the isolated earned checkpoint.
Compiler tests cover the real generated Yarn, missing race, hours, partial
delivery counts, driving/ending cancellation and the three atomic effects.

## Mark at lunch: presentation assets

The next workday encounter borrows Disc 3 `MFSY/MIZUMARK.PKS` (SHA256
`6a1cd83fe0df231e4faa6294a5436aa2175c309815fd864a0603ffc2a085c08f`).
`SEQDATA1.AUTH` contains the confrontation; `SEQDATA2.AUTH` supplies the
aftermath. Both use the original `M_01MAD.MOTN`, `STREAM/01MAD.AFS` voices
and `SOUND/A1_MAD.SND` effects. The existing original actor catalog binds
Mark to `GIC_L`, Shingo Murasaki to `PPL_L` and Minoru Okayasu to `OKA_L`.
The introduction's `BENB` prop is provisionally associated with the archive's
`BNMS301G.CHRM`; its visible identity still needs a rendered check.

The introduction requests sound command `a9041500`, path
`/p16/prj16m5/AUTH01/01MAD/SE/body/ikepocha.aiff`. The pinned original
`A1_MAD.SND` contains only `a9040000` through `a9041400` (SHA256
`b76ce9d7ad7f386a45001adcbf12a855718b0254ca72475dfdec78c4bfb38890`).
Keep this exact absent reference explicitly unavailable in the audio manifest;
do not invent a substitute. Other available voices/effects use their exact
source identities. These are asset-preparation facts, not proof of a playable
paid shift or a won fight.

### Connected noon rescue

`mark-lunch-rescue` requires the saved morning batch and a 12:00–14:00
approach around the original Mark/Ryo scene positions. Its original introduction
leads to the existing server-controlled combat system. Only a genuine victory
can play the original aftermath and atomically save the rescue and Chen/Mad
Angels notebook clue. A defeated or timed-out fight offers retry/leave; cancelling
the introduction, fight or aftermath grants nothing. No wages, afternoon outcome,
item or calendar jump belongs to this encounter. Saved completion prevents replay.

The guide specifies three opponents. MRSK and OKYS reuse their existing original
model bindings and the aftermath's original positions. The third fighter is
explicitly anonymous (`THG3`), borrowing the existing `KMD_L` thug model and an
authored nearby position. This does not identify the original third fighter.
Shared combat moves, basic AI, health/balance and arena bounds are adaptations.
Uncontrolled ambient harbor bystanders can still appear in the original shots;
their cinematic choreography and the precise bento prop identity remain unverified.

The connected hardware-rendered check resumes the earned five-crate checkpoint,
walks into the approach, cancels/retries the original film, lets it finish
naturally, wins using normal keyboard movement/guard/kicks, and lets the
aftermath finish naturally. It verifies the saved clue, unchanged yen/inventory,
restored controls and reload without replay. Run `NEW_YOKOSUKA_MARK_LUNCH_E2E=true`
with the earned-save harness. Real compiler/simulation tests cover missing
prerequisites, hours, actual victory/defeat, timeout/retry and cancellation before
the final acknowledgement. No fight outcome or future flags are injected into
the connected save.

## First afternoon and payday: verified connected continuation

The first-day continuation uses four ordinary Yarn events. It adds no payroll
API, parallel quest state or database migration. The existing transactional
yen grant, flags and progress store remain authoritative.

| Event | Eligibility and presentation | Saved outcome |
| --- | --- | --- |
| `workday-one-afternoon` | Earned morning batch and Mark rescue; 14:00–17:00 approach to the tested loading corridor. Explicit choice, unvoiced instructions, five real lift/carry/drop deliveries through the shared vehicle/cargo systems. | Acknowledged quota/notebook only. No pay or calendar jump. |
| `workday-one-attack` | Completed afternoon batch; 14:00–23:00 in the same corridor. Authored warning/choice and three original-model opponents through the shared server combat. | Acknowledged actual victory saves attack clearance/notebook and a minimum 17:00 finish; no currency. |
| `workday-one-payday` | Both five-crate batches and attack clearance; approach outside Alpha Trading. Explicit collection choice, original paired salary motions, borrowed Yada encouragement voices, authored camera and final amount caption. | Atomically grant ¥3,000, save the payday/date and notebook. No pay before the final acknowledgement or again on replay. |
| `after-work-goro` | Saved payday; approach outside Alpha. Original `GOROMA/SEQDATA2.AUTH`, `M_01GOJ.MOTN`, 01GOJ voices/effects and cameras. | Warning notebook and first-workday completion, without another salary, item, time jump or forced travel. |

The guide's first quota is ten crates, paid at ¥300 each. Fixed five/five
batches and the outdoor dispatch pad are authored condensations. Extra crates
and quota-based pay raises are not implemented. The attack follows the saved
afternoon batch instead of interrupting a crate in transit. Its cast/formation
borrows the existing noon-rescue models and is rigidly relocated along the
tested loading corridor; this does not identify the original afternoon cast.
Combat balance is unchanged. Defeat/timeout permits retry without the original
theft penalty; cancellation grants no attack result. This bounded adaptation
does not invent an unverified theft amount.

The salary resource is original `ALP_PAY.PKS`, SHA256
`e5a5096542be5c9cd50e4a0d1ab3042efcaee09667b5b68f558702a48ff6f709`.
It contains `M_MO01.MOTN` and a banknote model, but **no AUTH film**.
The builder exports the motion bank without manufacturing a native activity.
The authored handover waits for both original 764-frame salary clips and
borrows the already tested, scene-owned Alpha office map. Placement, camera,
amount caption and encouragement-line ordering are authored; physical
banknote/finger choreography is omitted. Presentation never authorizes pay.

`GOROMA.PKS` is SHA256
`906e93a9d55a9d60a5f1fd91ef8ded61ada192462e8e7fe3262753cf0bb77c1c`.
Its AUTH declares 2,410 frames; the last command at frame 2,323 is not the
scene's duration. Keep the original declared duration and actor/camera tracks.
Its animated door remains a reference-only object. Explicit cinematic skip
completes only the warning, while cancellation leaves it retryable without
undoing the independently committed payday.

All phases preserve the personal weather/lighting and restore the prior player
camera, pose and controls after their owned presentation. A failed or cancelled
delivery batch remains retryable; a saved batch survives later fight or payday
cancellation.

The connected hardware-rendered check resumes the genuinely earned Mark-rescue
save, uses the normal wait menu for 14:00 and physically delivers all five
afternoon crates through keyboard/Havok cargo. The acknowledged batch remains
unpaid. A real three-opponent victory unlocks 17:00 and the Alpha approach;
the film or an acknowledgement cannot win the fight. The check cancels the
original salary-motion handover, verifies no payment, retries, then acknowledges
the final caption. The saved balance changes from ¥9,636 to ¥12,636 exactly.
Inventory is unchanged. Rendered captures show the loading-area fight, original
Alpha office/Yada/Ryo salary staging and original Goro warning; exact hand/note
contact is not claimed.

Cancelling Goro's scene does not roll back the independently committed salary.
A reload retains the pay and offers no second collection. Reapproach and natural
Goro completion save the chapter/notebook; another reload neither replays the
warning nor pays again. Controls restore. Run
`NEW_YOKOSUKA_FIRST_AFTERNOON_E2E=true` with the earned-save harness against an
isolated Mark-rescue checkpoint. Compiler tests cover both five-crate batches,
partial/cancelled delivery, payroll prerequisites, original-motion and final
caption cancellation, exact grant and already-paid rejection. The shared
combat, cancellation, prop/room lease and presentation tests remain applicable.

These are local development assets and checks, not production/R2 publication.
The first workday is verified through Goro's warning. The continuation below
does not complete the second workday or later narrative.

## Return-home dream and second working morning

The GameSpot guide, printed pp. 55–56, places a Phoenix Mirror dream after the
first working day and another morning forklift race before an eight-crate
Warehouse No. 3 quota. These ordinary authored routes reuse the existing sleep,
travel, original-activity and observed-race systems; no new room controller or
parallel workday engine is involved.

| Event | Eligibility / presentation | Saved outcome |
| --- | --- | --- |
| `workday-one-night` | Completed first workday, actual Phoenix Mirror possession, bedroom bedside approach after 20:00; choose sleep or stay awake. Play original `KKYA/SEQDATA0.AUTH`. | After the acknowledged dream, atomically save its milestone/notebook, next personal morning at 08:30 and the established harbor loading-area arrival. No money or items. |
| `workday-two-race-entry` | Completed first workday, a personal day later than the recorded first payday, harbor approach from 08:30 to noon; choose race or leave. | Repeatable reward-free transfer to the race grid. The optional dream is not a prerequisite: ordinary waiting can also reach the next day. |
| `workday-two-race` | Saved second-day boarding, approach inside `ma00race`. Use the same ordinary forklift, course, physics and three-lap/thirty-nine-gate server-observed challenge. | A separately acknowledged second-day race result/notebook/date, minimum 09:00 and harbor return. A first-day win cannot substitute. No wages, rank prize or completed paid shift. |

KKYA's Disc 3 archive SHA256 is
`c5f1253ccac0592eea434af73254a0a5e73db6a3a8e24c2ad511459990b4e8a9`.
The already extracted package supplies the Phoenix Mirror actor, original
stage maps, motion/camera timeline and BGM079. It differs from the earlier
two-mirror/hawk KKYB dream. Associating KKYA with this walkthrough milestone is
authored, not proof of the original native owner's selection rule. Explicit
20:00 bedside sleep, the project's 08:30 waking hour and the condensed automatic
commute are adaptations. These events impose no new weather condition.

Declining or cancelling the dream changes neither calendar, destination nor
economy. A saved dream cannot replay automatically. Race cancellation, loading
failure and timeout release the owned vehicle and remain retryable; only a fresh
actual course completion can settle the second-day result. The shared event
transaction owns the flags, time and destination together.

Focused real-Yarn tests cover dream prerequisites, missing mirror, early hour,
decline, cancellation and exact next-day/arrival effects; boarding tests reject
same-day and missing payday dates despite a prior race win. Both workdays run
the same actual race test cases for ordered observations, cancellation, retry,
stale tokens and atomic ending. Client checks verify KKYA's exact existing slot
and binding and that presentation cannot write durable effects.

`NEW_YOKOSUKA_SECOND_MORNING_E2E=true` continues the genuine first-workday save.
The connected hardware-rendered check passes: stay awake, cancel the visible
original Phoenix Mirror dream without saving time/travel, retry and let it end
naturally, save next-day 08:30 harbor arrival, decline boarding and reload without
replaying the dream. It then declines/retries boarding, cancels an entered race,
retries and physically drives all three laps/thirty-nine gates through normal
keyboard/Havok input. Only the acknowledged ending saves the separate race
milestone/date, 09:00 and harbor return. Reload restores controls without another
race prompt; the ¥12,636 balance and inventory are unchanged throughout. Captures
show the original mirror/stage and saved harbor return; exact lighting and
audible playback fidelity were not assessed. No future flags, checkpoint
positions or wins were injected during the challenge.

## Second workday: cargo, lunch, two-wave ambush and payday

The connected rendered continuation is verified through wage collection.
This does **not** complete the later Warehouse No. 17
Mark rescue or the second workday's narrative milestone.

| Event | Trigger / important conditions | Saved outcome |
| --- | --- | --- |
| `workday-two-morning` | Its own saved morning race, loading-area approach 09:00–noon; choose deliveries or leave; four real lift/carry/drop deliveries, then original coworker lunch. | After the acknowledged ending, batch/notebook and noon together. Cancelling the lunch does not save an unfinished batch. |
| `workday-two-afternoon` | Saved morning batch, approach 14:00–17:00; four more actual deliveries. | Eight-crate quota/notebook, no pay or clock jump. |
| `workday-two-attack` | Saved afternoon batch; approach and explicit fight choice. Win against five opponents, acknowledge the interval, then win against four; Ryo starts the new attempt with full health. | After the final acknowledged clue, Warehouse No. 17 notebook, cleared ambush and minimum 17:00. No wages. |
| `workday-two-payday` | Both saved batches and cleared two-wave ambush; Alpha entrance and explicit collection; original shared salary motions. | Final caption atomically saves exactly ¥2,400, its own payday/day/notebook. No second payment on re-entry or reload. |

The guide, printed pp. 55–56, establishes the eight-crate Warehouse No. 3
assignment, coworker lunch, five/four ambush with health restoration, Warehouse
No. 17 lead and subsequent Mark rescue. The four/four split and already tested
outdoor dispatch pad condense the warehouse work. The attack occurs after the
saved batch rather than interrupting carried cargo; the original closing-door
trap and thug riding a crate are not reconstructed. Exact quota grants no
over-quota raise, so the prototype's ¥300 rate remains: eight crates earn ¥2,400.
Optional extra crates/raises and the optional lunch-time Shozo/Goro inquiries
remain omitted, not invented mandatory prerequisites.

The original `HIRUAUTH.PKS` SHA256 is
`e740397e02958441010345d34d1369b20bbad9bc2ebdf397b413251b20a9a97e`.
Its selected `SEQDATA1.AUTH` declares 450 frames, approximately 15 seconds,
and has no original audio commands. The generator asserts that silence rather
than hiding missing sound/voice data. `M_01BEN.MOTN`, original camera tracks,
Ryo and the five correctly named coworker models are reused. BTF/BTS tags use
the two original bento-piece models in an authored pairing; exact lid/hand
choreography is not claimed. Repeated bento instances share unique archive
members and texture output through the existing scene-object lease.
The rendered lunch capture shows the coworkers, but the resident exploration
fence partly crosses the original camera view. Native scene-specific scenery
visibility/framing is not reproduced; this remains a presentation limitation,
not a claim that the original lunch shot is visually matched.

The ambush uses original donor thug models, not claimed original harbor attacker
identities. Their parking-lot cinematic end poses placed two attackers within
half a metre of Ryo and were not suitable combat starts. The combat authoring
compiler now accepts an explicit complete local formation before ordinary rigid
world placement. Both waves start in the proven open loading corridor.
The shared combat AI now reserves close-engagement slots: waiting fighters stay
beyond the longest strike range plus the existing body spacing rather than
crowding Ryo and blocking targeting. Larger crowds (these waves and the earlier
parking-lot fight) use two simultaneous attackers as an explicit balance choice
for the simplified controls, with unchanged opponent counts, health and actual
victory requirements. Delayed guard/jab inputs are checked across realistic
100–150 ms network intervals, not just immediate ideal timing. These placements, captions and
basic combat remain adaptations rather than original free-battle reconstruction.

Whole-encounter cancellation grants nothing and restarts both waves; defeat or
timeout offers retry of the current wave, with a fresh token/health. First-wave
inputs cannot affect the second. A won wave or the interval caption cannot save
the clue or grant pay by itself. Presentation restores the prior camera/pose and
ordinary control through the same owned cleanup used elsewhere.

Focused actual-Yarn tests cover both days' quotas, partial delivery, cancellation
during driving/ending/lunch, prerequisites/hours, two actual combat victories,
full second-wave health, stale tokens, timeout/retry, interval/ending cancellation
and separate once-only salary. Client checks cover original lunch bindings,
reviewed donor models, explicit formation and shared acquisition/cleanup.
Use `NEW_YOKOSUKA_SECOND_WORKDAY_E2E=true` with the genuine second-race-earned save.

Rendered/full-stack verification continues the same genuinely earned character
across saved checkpoints, without injecting future flags, crate positions,
damage or victories. It passes the four physical morning deliveries, visible
original coworker lunch, saved noon/notebook and reload; normal waiting until
14:00, four physical afternoon deliveries and a saved quota without wages;
then both actual keyboard-driven fights, full health/fresh state for wave two,
acknowledged Warehouse No. 17 clue/17:00, salary-motion cancellation/retry,
one ¥2,400 credit (¥12,636 → ¥15,036), restored controls and saved reload without
a second payday. A failed pickup and failed fights during verification saved
neither the unfinished batch nor an unearned clue/payment. The shared keyboard
driver now observes shifted pickup bodies and makes bounded real control
adjustments rather than assuming its initial crate coordinate cannot change.
The lunch-camera occlusion above remains. This payday check does not itself
complete Mark's later rescue or the second-day story flag.

## Warehouse No. 17: Mark rescue

`mark-after-work-rescue` continues the saved second payday and Warehouse No. 17
lead. The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed p. 56, establishes the after-work rescue, real fight and Mark's account
of his missing brother and the Mad Angels' dealings with the Chi You Men.
Implementation, focused checks and connected rendered/full-stack verification pass.

| Field | Event contract |
| --- | --- |
| Location / eligibility | Personal Story Ryo in `MFSY`, completed second payday and ambush, 17:00–24:00; approach behind Warehouse No. 17 near the original cast. Bounds and forgiving evening retry window are authored, not recovered native EVNT/controller predicates. |
| Original sequence | `BOKOMARK/SEQDATA2.AUTH` confrontation, actual shared combat, `SEQDATA3.AUTH` aftermath, then `SEQDATA4.AUTH` brother explanation. Original camera/body tracks and 01MKB voice/effect timing are reused. |
| Characters / challenge | Ryo, Mark, MRSK, OKYS, DEB1, DEB2 and BTC_ appear in the introduction. The five visible thugs supply an authored fighting roster; this is not proof of the original free-battle roster. All five must actually be defeated, with two simultaneous close attackers and the established basic controls. No QTE. |
| Props / weather / timing | No new pickup or handover. Preserve personal weather/lighting and time; no calendar jump. Native track extents determine presentation duration, not a guessed whole-event timer. |
| Completion | After the real victory and both acknowledged ending films, atomically save the rescue, whole second-workday milestone, brother/deal notebook pages and personal finished-day record. No money, items or repeated salary. |
| Exit / skip / failure | Restore the approach pose/camera and normal control in the same harbor. This return differs from adopting the last film's waterside pose. Explicit cinematic skip acknowledges only presentation; it cannot win combat. Defeat/timeout offers a fresh fight; whole-event cancellation or failed loading grants no clue and leaves the event retryable. Saved completion prevents automatic replay. |

`build_harbor_job_pack.mjs` pins the original BOKOMARK archive hash
`f074ed751b0000c66357087fc8ed23c0a343080723bb511567b92c2d0ed96164`,
texture bank, 01MKB stream and A1_MKB sound bank. The three AUTH records declare
520, 700 and 1,961 frames. AMOV/ACAM extents are also preserved; the compiled
durations are approximately 18.90, 23.35 and 65.38 seconds. This package uses
**motion bank 21**, not the bank 16 used by the earlier harbor profiles.

MRSK/OKYS/Mark retain the established original character models. BTH_L, BTN_L
and BTC_L come directly from BOKOMARK, with its own textures. DEB1→BTH_L and
DEB2→BTN_L are explicit authored associations, not recovered native binding
proof; BTC_→BTC_L has direct filename-prefix support. The original Ryo pose at
`y=-2` is an off-shot cinematic placement, not a grounded arrival. The fight
uses an explicit floor-level formation near the original cast instead.

Native presentation and combat share those source-qualified model records from
the same package manifest. The ordinary actor loader now resolves a registered
model/texture pair consistently for prefetch and assembly; it rejects incomplete
or unregistered pairs rather than guessing a global HUMANS filename. Existing
global characters and model overrides retain their normal path. Archive-only
characters are not copied into a second global model pool.
For an already-declared world actor using the same ordinary model/texture pair,
the combat producer reuses that reviewed definition. The first browser run
exposed redundant package fields creating a competing MRSK definition and
preventing harbor startup. The producer now rejects differing sources and a
corpus-level scene/fight composition check covers every combat world; the shared
collection's conflict rejection was not relaxed.

The English 01MKB archive lacks the introduction's `01MKBD003.str` and
`01MKBD004.str` references, and A1_MKB ends at `a9041b00` while the introduction
requests footstep `a9041c00`. These exact missing calls remain explicit unavailable
records, without invented subtitles, replacement speech or a guessed effect.
The two ending films' voice/effect requests are available in the pinned banks.

Focused actual-Yarn tests reuse the earlier Mark-rescue boundary checks for
prerequisites/hours, completed-event rejection, cancelled introduction, actual
victory/defeat, timeout/retry, cancellation during either ending, and atomic
clue/chapter/day settlement without economy or calendar changes. Client checks
cover exact bank/bindings, explicit audio holes, shared source models, paired
asset validation and unchanged ordinary actor loading.
Use `NEW_YOKOSUKA_MARK_AFTER_WORK_E2E=true` with the genuine second-payday save.
The connected check passed from that earned save: physical entry into the
authored approach area, cancellation during the introduction, actual five-thug
victory, both original endings, cancellation during the brother explanation,
reload into the still-uncommitted trigger and a fresh real fight, then natural
ending and saved completion. Cancelled attempts saved no clue or chapter result.
Reloading inside an eligible unfinished trigger correctly retries the encounter;
the completed version does not replay. Controls restore, the personal date stays
December 27, currency stays at ¥15,036 and inventory stays unchanged. PostgreSQL
confirms both notebook flags, the rescue/second-workday flags and finished-day
record `6204`, matching the already-earned payday.

Rendered captures show the package-owned thugs on the supported harbor floor,
the original confrontation and Mark/Ryo in the explanation. Test setup starts
near the trigger rather than proving a full walking route from Alpha Trading.
This does not establish the speculative DEB1/DEB2 associations as native truth,
exact scenery/prop staging, exhaustive gesture fidelity or missing intro audio.
All 78 new local runtime records pass their hash/size check; no asset publication
or deployment has been performed. The following sections cover the connected
third workday and its evening; the later harbor days and finale remain missing.

## Third workday: sleep, cargo and Nozomi's photographs

Implementation, focused actual-Yarn checks and connected rendered/full-stack
verification pass. The earned Mark-rescue save is the starting point, not
a new fixture with future progress filled in.

The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed p. 57, places the daily race and eight-crate Warehouse 11-to-18 job before
the lunch photograph encounter. Payroll precedes a separate evening biker/Charlie
sequence. The following implementation preserves that order, using the existing
server/Yarn, private calendar, race, cargo and presentation systems.

| Event | Eligibility / interaction | Saved result |
| --- | --- | --- |
| `workday-two-night` | Completed Mark-rescue chapter, bedroom approach 20:00–24:00; stay awake or sleep, then acknowledge an unvoiced rest caption. | Next personal day 08:30, tested harbor arrival and morning notebook together. Decline/cancel changes neither date nor location. This uneventful sleep has no invented dream film; ordinary waiting can bypass it. |
| `workday-three-race-entry` / `workday-three-race` | Completed second day, later personal date than its finished-day record, harbor boarding approach, then the shared real three-lap/39-gate course. | Independent third-day result/date/notebook, minimum 09:00 and harbor return. Earlier race wins do not count. No pay or rank prize. |
| `workday-three-morning` | Its own saved race, 09:00–noon; explicit choice and four real lift/carry/drop deliveries, followed by the original HIRUAUTH lunch. | Acknowledged batch/notebook/noon. Cancellation during lunch grants nothing. |
| `nozomi-photos` | Saved morning/lunch, 12:00–14:00; approach the original NZMPHOTO cast near Alpha Trading. | After the picture-taking film, a genuine apart/together choice and acknowledged original Canada/keepsake continuation save the choice, notebook and meeting together. No money, inventory grant or time jump. |
| `workday-three-afternoon` | Saved morning and photograph event, 14:00–17:00; four more real deliveries. | Quota/notebook/minimum 17:00, not wages or the evening story. |
| `workday-three-payday` | Both actual batches and photograph meeting, Alpha entrance after 17:00; shared original salary motions and final caption. | Exactly one ¥2,400 grant, payday date and notebook. No evening-chase win, Lan Di clue or whole-third-day flag. |

Ordinary original assets supply Nozomi/Eri's cameras, body motion, voice and effect
timing. `NZMPHOTO.PKS` hash is
`c1b2ba44ca7111fb9e85237a775b253c0bcef99e7a4bbb3ed3c64e00bc46be1e`;
`SEQDATA1.AUTH` and `SEQDATA2.AUTH` declare 1,220 and 1,940 frames, and their
movement extents compile to approximately 40.68 and 64.68 seconds. Both use
bank 16 / `M_01PHO.MOTN`. The original first film ends after Eri asks which
photograph Ryo wants; the next opens with his choice response. Yarn owns the
choice between those films. The 01PHO archive provides all seven/seventeen
requested voices and A1_NZPHO provides the nine/seven requested effects.

Eri uses registered `RFD_L`; Nozomi uses the existing reviewed `NZM_L` full body.
The name CSV's `NZM_M` reference is not a registered/shipped full-body asset here.
The first rendered attempt exposed that invalid reference before world entry;
the package producer now validates every shared model/texture pair at generation
time instead of breaking the account-menu module import.

PHT1→SHAS503G, PHT2→SHAS506G and POLA→POCS500G are declared package-prop
associations, not recovered native controller bindings. Their original models
and NZMPHOTO texture bank are retained. BLC0/BLC1 flash planes remain explicit
reference-only actors: their effect visibility is not reconstructed, so they
are not rendered as permanent opaque planes. Both authored choice branches use
the same original continuation; native photograph model-switching and a 2D
inventory-photo display remain unimplemented. The selected identity is still
saved per character and cannot settle before the ending acknowledgement.

As on earlier days, the four/four delivery split and tested outdoor dispatch pad
condense the original warehouse route. Exactly-quota work earns the unchanged
base ¥300 per crate; no over-quota raise system is claimed. Preserve personal
weather/lighting. Presentation restores the approach pose/camera and controls;
failure/cancellation is retryable, and saved events do not automatically replay.
The evening chase/fights are separate from this payday; see the connected
continuation below. The following section covers the return-home dream and
fourth working morning.

Focused checks extend the existing sleep, boarding, race, cargo and payday
boundary tests rather than duplicating their runtime. Photo checks exercise
both actual choices, ineligible hours/Free roam, cancellation during either film
and no durable choice/notebook before the final acknowledgement. Run
`NEW_YOKOSUKA_THIRD_WORKDAY_E2E=true` with the earned Mark-rescue save and the
original recorded driving line; the optional `NEW_YOKOSUKA_THIRD_MORNING_ONLY`
stops at an intermediate earned checkpoint, not a complete day.

The connected checks use the same earned character through ordinary sleep
decline/cancellation, saved next-morning arrival/reload, another real three-lap
race, four/four physical deliveries, original lunch, both photo films and
payroll. The race's saved arrival correctly starts the next cargo briefing;
the shared browser driver now verifies that handoff instead of requiring an
idle frame. An earlier interrupted assertion did not erase the earned race,
and the continuation resumed it rather than replaying or injecting a win.

The photo check cancels the introduction and a selected-together ending, then
naturally completes the apart branch. Only the latter identity and notebook
are saved; cancelled choices grant nothing. The original Eri camera, Nozomi,
Ryo and photo-handling presentation are rendered. Payroll cancellation grants
nothing, its acknowledged ending adds exactly ¥2,400, inventory is unchanged,
controls restore and the final reload neither replays the photos nor pays again.
PostgreSQL confirms race/payday on the same personal day (`6205`) and no
`story.s1.workday-three.completed` flag; the evening story is not bypassed.

These checks reset near approaches, not along a proven full walking route.
The coworker lunch still has the documented exploration-fence occlusion. Exact
photo grips/model selection, flash geometry and inventory-photo art are not
claimed. All 57 new local asset records pass hash/size verification; publication
and deployment have not been performed.

## Third evening: bikers and Charlie

The GameSpot guide, printed p. 57, places the Tomato-store biker chase after
19:00, followed by five thugs, Charlie and the Lan Di shipping clue. These are
connected through ordinary authored Yarn, timed inputs, server combat and the
original interrogation. The chase and fights have separate receipts so a
reconnect after the chase can continue at the fight instead of repeating it.

| Field | Authored encounter |
| --- | --- |
| Location / trigger | `biker-chase`: approach outside Tomato/Harbor Lounge after the third payday, 19:00–24:00 personal time. Bounds surround original MFSY return entry 19 `[84.2,0,60.4]`; the guide backs the location/hour, not this activation volume. `charlie-harbor`: separate approach around the original BAT_MBQC interrogation near Warehouse No. 17, only after a saved chase. |
| Player / actors / props | Story Ryo on foot; Charlie uses original BIK_L. Original BIKK5DYG motorcycle and M_MBQC riding bank are byte-identical in MBQC and the already loaded RACE pack. One privately staged rider represents the group; rider/handlebar contact is approximate. Five-fighter staging uses BAT_MBQC's BTK_S/BTH_S/BTA_S plus explicit MRSK/OKYS donors, not a recovered native roster. |
| Action / camera / timing | Twelve continuous moving actor, prop and follow-camera beats along reviewed HANA/DJUN/HTSI harbor road corridors, at the existing run pace. Each stops at its endpoint for an actual two-second prompt. Route, framing, held beats and unvoiced introduction/failure captions are adaptations; original DYNAMICS/chase cameras and obstacle stunt choreography are not reconstructed. |
| QTE / combat | Left, Right, A, Left, Left, A, Right, Right, Right, Left, then Left, Right. Every input needs the current server token and receipt-time window. After arrival, actually defeat five thugs, then Charlie. Shared combat/AI, explicit arena/health/speeds and a full-health new Charlie attempt are declared adaptations. Charlie is tougher than each ordinary thug. |
| Dialogue / audio / weather | Original BAT_MBQC SEQDATA0.AUTH/M_01CBK supplies the 52.02-second interrogation, cameras, body motion, twelve 01CBK voices and eighteen distinct A1_CBK effects. Preserve personal weather/season/lighting; no new weather/date gate or invented music selection. Detailed hand/facial callback fidelity is not claimed. |
| Saved effects / exit | All twelve accepted inputs plus scene cleanup atomically save `story.s1.biker-chase.completed` and `s1.work.biker-alley` arrival. Both actual victories and acknowledged original interrogation save the Lan Di notebook, `story.s1.charlie-harbor.completed`, `story.s1.workday-three.completed` and its day together. No money, items or time jump. Return to the saved alley approach with prior camera mode and controls. |
| Failure / skip / replay | Wrong/late chase input offers a fresh chase or leaving; cancelled movement grants nothing. Saved chase survives reload. Fight defeat/timeout retries the current fight; cancelling the whole fight event restarts both fights but retains the chase. Ending cancellation grants no clue. Original film completion or explicit X-skip can acknowledge its presentation, never win a challenge. Completed events do not automatically replay. |

The original MBQC archive hash is
`39623d989642b19fbe99f7285e8a5a852410324e3bd39b6ccbc68ece7798bcc1`;
BAT_MBQC is
`52867cbea1dd59044282ee476405026a769a909eab8bbcced955f94975d470e0`.
`build_harbor_job_pack.mjs --profile charlie-harbor-interrogation --audio` uses
the shared asset/audio compiler. `build_harbor_biker_chase.mjs` pins the original
road records and shared MBQC model/motion identities, then produces ordinary
scene data, Yarn and closed presentation capabilities. Its authoring-time path/
curve helper is shared with Jimmy's chase; the extraction leaves Jimmy's
generated scenes and Yarn unchanged. No second chase engine is introduced.

Moving authored scenes now support `sceneObjectTracks`, keyed by the tags in
their existing `sceneObjects` definitions. They use the same six native-coordinate
pose channels and curve evaluation as actor movement. Consecutive beats retain
one actor/camera/prop lease only when their cast, prop definitions and tracked
tags match. A changed model is rejected rather than silently replacing an owned
resource. The shared scene-object adapter preserves scale and explicit visibility;
final release or cancellation clears the props and restores the player.

Focused headless checks cover endpoint clamping, continuous resource ownership,
malformed tracks, source-coordinate rotation, cancelled asynchronous preparation
and isolation from a newer scene. Actual compiler/engine checks also cover the
twelfth input failing, stale readiness/input, timeout/retry, ineligible players,
fight defeat/timeout, cancelled final presentation and exact atomic outcomes.

`NEW_YOKOSUKA_HARBOR_BIKERS_E2E=true` continues the genuine third-payday save.
The connected hardware-rendered check passes decline, moving-scene cancellation,
wrong-input retry, all twelve physical inputs, saved arrival/reload, both actual
fights, original interrogation cancellation, retained chase/reload, repeated
actual fights, natural film ending and final reload without replay. Captures
show moving Ryo/Charlie/motorcycle, combat and the original interrogation.
Combat framing does not show every opponent simultaneously; exact camera/stunt/
grip fidelity is not claimed. The first test approach hit the lounge's north
wall at z=66.51; the driver now approaches along the original street instead of
changing application collision to accommodate an invalid test start.

PostgreSQL confirms ¥17,436, unchanged inventory, personal 1986-12-28, and the
race/payday/finished records on day 6205. The clue and whole-day flag are absent
after cancelling the ending and present only after its acknowledged retry.
All 38 new local asset records (2,143,412 bytes) pass size/hash verification.
Nothing has been published or deployed. The following section continues through
the Lan Di dream and fourth morning. The remaining Mad Angels workdays, Nozomi
rescue and departure still need connected progression.

## Third-night Lan Di dream and fourth working morning

These ordinary Yarn events continue the acknowledged Charlie chapter. The
GameSpot guide, printed pp. 58–59, places the Lan Di dream before the next
morning's forklift race, eight-crate Warehouse No. 15-to-18 shift and lunch.
The current implementation connects through that morning batch and the
separately saved lunch inquiry, afternoon Goro trap, quota, wages and Mark
explanation below. Each retains its own acknowledged outcome.

| Event | Eligibility / presentation | Saved outcome |
| --- | --- | --- |
| `workday-three-night` | Saved third-day completion and Charlie clue, tested bedroom approach after 20:00; sleep/stay-awake choice. Reuse original KKYF/SEQDATA5.AUTH, Lan Di and Dragon Mirror, original motion/camera and the existing BGM201 package association. | Acknowledged ending atomically saves its milestone/notebook, next personal day at 08:30 and tested harbor arrival. No reward. Cancellation changes neither destination nor personal date. |
| `workday-four-race-entry` | Previous chapter completed, a later personal date than its saved finish, loading-area approach 08:30–12:00. | Existing repeatable race-grid transfer, no win or salary. The dream is optional: ordinary personal waiting can also reach this date. |
| `workday-four-race` | Saved fourth-day boarding, original `ma00race` grid. | Independently earn all three laps/39 ordered gates with ordinary forklift physics; acknowledged result saves its notebook/day, minimum 09:00 and harbor return. Earlier wins cannot count. |
| `workday-four-morning` | Saved fourth-day race, loading-area approach 09:00–12:00. Four newly observed physical deliveries, then the shared original HIRUAUTH coworker lunch. | Acknowledged batch/lunch saves its own notebook and noon. No spying clue, trap victory, wages or whole-fourth-day flag. |

KKYF's original Disc 3 archive hash is
`cff01c6ed68be4f5055426e2e8840b74c3f456c0997c68b3bee6f8163b42f56a`.
Its existing exact activity is slot 55, pointers 614348/614361, declaring 240
frames. The clip's longer movement extent in the generated manifest is not an
instruction to extend the eight-second AUTH ending. Associating this existing
Lan Di vision with the walkthrough milestone is authored, not proof of a
recovered native dream predicate. The explicit 20:00 sleep choice, project
08:30 waking time and condensed commute remain adaptations. Preserve personal
weather/lighting outside the isolated vision; no new seasonal gate is added.

The four/four quota split and existing outdoor dispatch pad condense the
original warehouse route. Reusing HIRUAUTH's first lunch film does not claim
original day-specific film selection. Its previously documented resident-fence
occlusion remains. The coworker-spying clue and afternoon Goro encounter must
not be granted by this lunch presentation or by earlier workday receipts.

Real compiler/engine checks extend the existing working-night, boarding, race
and delivery cases. They cover decline, early hours, ineligible/completed
states, cancelled presentation, no late replay after the following race,
same-day/missing-date rejection, fresh observed challenges and acknowledged
atomic effects. The shared browser drivers accept this later day rather than
copying the sleep/race/cargo implementations.

`NEW_YOKOSUKA_FOURTH_MORNING_E2E=true` continues the genuinely earned Charlie
save through those shared drivers. Connected hardware-rendered checks pass
staying awake, cancelling the visible Lan Di vision with BGM201 selected, retrying
its natural ending, next-day 08:30 harbor arrival, all three real race laps/39
gates, independent fourth-day race settlement, four fresh physical deliveries,
original lunch, saved noon and reload. Currency remains ¥17,436 and inventory
is unchanged. PostgreSQL confirms personal 1986-12-29, race day 6206, the three
new notebook flags and no fourth-day wage or whole-day completion.

The first attempt let the short vision finish naturally before an old
nine-second cancellation delay; that earned morning is preserved. The corrected
check cancels while the scene is still active, using the genuine pre-dream
backup in a separate disposable database rather than rewinding the earned
character. A test-only chapter/date variable collision then interrupted the
notebook assertion after a valid morning settlement. The continuation kept that
earned save and verified the notebook, race, cargo and reload; it neither
replayed the dream nor injected a result. The browser checks BGM201 selection,
not an auditory mix comparison; exact lighting, hand and facial fidelity remain
unverified. No new asset export, push or deployment was performed.

The continuation below connects afternoon cargo/Goro trap, once-only payday
and Mark's Long Zha explanation, separately from the morning and warning
receipts. The fifth workday and finale remain next.

## Fourth-day coworker warning

`workday-four-spying` is another ordinary authored Yarn conversation, not a
new event interpreter. The contemporary GameSpot guide, printed p. 59, describes
speaking with the coworker who leaves lunch around 12:45 and learning that Ryo
is being watched. Original Disc 3 `FREE03.AFS/F1109.SRF` identifies the speaker
as `TYMK` (Tsuyoshi Murakami), with both the watched-workers and watched-Ryo
lines. Archive SHA256:
`97cd342a00004d39b14fa47731a69487d4fedf5663a0a5c5a9f94448a82912c4`.

| Field | Implementation |
| --- | --- |
| Eligibility / trigger | Story-mode Ryo, completed fourth morning and Charlie clue; approach the tested Alpha-side walkway between 12:45 inclusive and 14:00 exclusive. Missing lunch allows returning during a later personal lunch break rather than permanently stranding the chapter. |
| Actors / camera | Original `TYMK/RFA_L`, privately staged with Ryo. Standing near the original lunch location instead of reproducing the coworker's patrol and repeated inquiries. Positions, held original idle motions, inward-facing poses and two-person camera are authored approximations. |
| Dialogue / audio | Six original English lines: F1109B087, A039, B095, B096, B099, A044. Condensed authored order; only one version of each warning, not every alternate wording in the archive. Original speech is exported through the shared voice pack; preserve normal environment/weather, no invented scene music or props. |
| Outcome / exit | Acknowledged ending saves only its milestone and `notebook.s1.harbor-spying`. Remain at the approach, restoring camera and controls. No clock jump, payment, inventory, trap result, Long Zha clue or whole-day completion. |
| Failure / replay | Cancellation at staging, dialogue or release saves nothing; physical re-entry retries. Once completed, re-entry/reload does not replay or add another note. |

Real compiler/engine checks cover the precise lunch-hour boundary, missing
prerequisites, wrong region, Free roam, incomplete opening, completed state,
cancellation at four presentation stages and exactly the two allowed effects.
The connected browser continuation uses the earned noon save and ordinary
personal waiting, approaches on foot, cancels/retries, completes the voiced
exchange and reloads. The first captured pass exposed outward-facing actors;
their authored angles were corrected before visual acceptance. Its earned save
is preserved, and revalidation starts from a separate copy of the genuine noon
backup, not injected future flags or a replayed workday.

Run that bounded continuation with `NEW_YOKOSUKA_FOURTH_LUNCH_E2E=true` through
the existing isolated `first-allowance.spec.js` harness. This is not a new
character bootstrap or production operation. The corrected captured pass shows
Ryo and Tsuyoshi facing one another and passes saved reload, with ¥17,436 and
unchanged inventory. PostgreSQL confirms only the warning/notebook were added;
no fourth-day wage, Long Zha or whole-day completion. All six new voice files
(68,135 bytes) pass immutable hash/size verification; audio was not compared by
listening. The afternoon continuation is described below. No push, deployment
or asset publication was performed.

## Fourth afternoon: Goro's trap and Long Zha

Four ordinary Yarn records continue the earned lunch warning. Contemporary
GameSpot guide p. 59 establishes the Goro encounter near Warehouse No. 13,
the nine inputs, continued deliveries, separate payday and Mark's explanation.
No native controller, original patrol or new quest engine is required.

| Event | Prerequisites / presentation | Atomic outcome |
| --- | --- | --- |
| `goro-trap` | Morning cargo and spying warning; Warehouse13-area approach 14:00–17:00, explicit help/leave choice. Original 019RN Goro/Tony dialogue, real B,A,B,A,A,B,Left,Down,A inputs, original paired success/failure motions, then the original MB9Q ending. | Only acknowledged victory ending saves trap/notebook. Failed input/timeout retries the whole trap with fresh tokens; cancelled presentation grants nothing. No wages, cargo credit or completed day. |
| `workday-four-afternoon` | Saved morning and trap; loading approach 14:00–17:00. Four newly observed physical forklift deliveries. | Acknowledged quota saves its receipt/notebook and minimum17:00. The earlier morning deliveries and QTE cannot substitute for these crates. |
| `workday-four-payday` | Morning, trap and afternoon complete; tested Alpha entrance after17:00. Reuse original salary motions and explicit collection. | Exactly ¥2,400 once, payroll day and notebook together. Base300-per-crate remains the adaptation used by preceding workdays; optional overtime/raises are not implemented. |
| `mark-long-zha` | Saved fourth wages; harbor-side approach after17:00, around original Ryo [13.121,0,70.779]. Original RYUSATSU/01MKJ actors, motion, camera, seven voices and twelve effects. | Acknowledged explanation saves Long Zha notebook, fourth-day completion and finished date. It cannot pay wages again, award an item or start the fifth day. |

### Original resources and authored choices

`MB9Q/MPK00.PKS` SHA256:
`70a419eb5544dade0c62f3b2ca0a8d747eaf79e11e9df5c467b728d753b22f7c`.
Its M_MB9Q2 motion bank supplies six individual Ryo/attacker action pairs and
the final two-attacker GH family. The final Left/Down/A prompts therefore lead
to one GH action, not three repeats of the same clip. Original M_019RN and
SEQDATA1 supply the 880-frame threats ending. Its 019RN stream explicitly
mentions Goro's beating and threats against Ryo's family and friends. The
original room's literal resource strings identify A1_QRENQ.SND; all eight
ending voices and nine effects resolve from those pinned sources.

The shared harbor asset builder exports those originals. A deterministic
`build_harbor_goro_trap.mjs` translates seven motion families into ordinary
tableaux and Yarn, retaining one actor/camera lease. The shared staging runtime
now honors explicit `presented:true` as well as `false` on retained beats,
allowing the next attacker to appear without reacquiring the cast. The two-second
server input windows, outdoor formation, model-to-fighter assignments, held
Goro introduction and camera are declared adaptations. Original paired-clip
durations drive the action beats; animation completion never supplies an input.
The last pair borrows the original Tony/Smith bodies. YKB_M is Ryo's reference
body, not an attacker; exact native role-to-body assignment is not claimed.
There is no newly recovered fight-music selection, forced weather, scene prop
or exact injury/gesture choreography.

`RYUSATSU.PKS` SHA256:
`385fd95a064964da1723afade848a3673e5632d56c1536460df9be7acd03686c`.
Its 1,000-frame film and 01MKJ speech confirm Mark's explanation. Preserve his
original cinematic Y offset rather than assuming an off-ground pose is a bad
arrival. The trigger uses grounded Ryo; presentation returns to the approach
and restores the saved camera/controls. Existing personal weather and shared
audio policy are retained, without claiming recovered original BGM selection.
Optional waterfront Tony/Smith and guard/cafeteria follow-ups remain separate
content, not facts silently unlocked by Mark's first explanation.

### Verification boundary

Real compiler/engine tests cover nine accepted inputs, wrong/late final input,
stale tokens, explicit decline, cancelled introduction/motion/ending, and only
the permitted trap effects. Existing observed-delivery and payday cases now
include the fourth afternoon and reject missing trap/quota or cancelled
acknowledgement. Mark's film cannot finish the day before saved wages and its
own acknowledgement. Related Go packages pass sequentially.

Rendered verification uses `NEW_YOKOSUKA_FOURTH_AFTERNOON_E2E=true` with the
existing isolated earned-save harness. It resumes the lunch warning, not a
replayed race/morning. The initial startup check caught a duplicate Tony
definition; the generator now reuses his established identity, verified against
the byte-identical original body, without weakening the conflict guard.
Captures led to reframing Goro and correcting the last fighter pair instead of
mistaking the archive's Ryo reference body for an enemy. State outcomes and
corrected visual acceptance are recorded separately below.

One original reference coat exposed a too-strict cloth invariant: MB9Q's
YKB_M paired vertices coincide within 0.000004, but their authored normals reach
dot -0.8360 rather than the previously scanned corpus's -0.9313. The shared
guard now requires finite, opposite-hemisphere normals, not near-exact
negation. An original-model regression test still rejects same-facing and
zero-length normals. This fix is retained independently of which fighters
are cast in the authored scene.

The earned-save continuation reaches the saved fourth-day ending: all nine
inputs and natural original threats film, four actual dispatch deliveries,
salary cancellation/retry and final acknowledgement, Mark cancellation/retry
and natural explanation, then reload without another wage or film. PostgreSQL
confirms ¥19,836, unchanged inventory, personal 1986-12-29, the trap/quota/payday/
Long Zha flags and fourth-day completion. A pickup attempt that did not acquire
real fork support saved no cargo outcome; the next ordinary attempt completed
all four crates without injected poses, credit or a changed assertion. Mark's
first test approach was over water and invoked normal fall recovery to
[53,0,36.53]; the corrected check walks along the quay from [18,0,70.8]. No
application collision or recovery behavior was changed for the test.

The original Mark capture shows both actors with the native close camera; the
original threats capture and first/final paired motions were inspected. A
separate copy of the genuine pre-trap save is used to revalidate the corrected
Tony/Smith final pair: the full nine-input path and inspected final-pair capture
pass, then ending cancellation saves nothing. The actual earned database and
backups remain preserved. Related Go packages and 72 focused client checks pass, with
tests/browsers run sequentially. Voice/effect assets pass immutable local
hash/size verification; the audio mix was not compared by listening. No push,
deployment or R2 publication was performed.

## Fifth working morning and Goro/Mai's announcement

Five ordinary Yarn records continue the saved Long Zha chapter. The
[GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed pp. 59–60, places the next morning race before the two-leg cargo job,
noon lunch and Goro/Mai encounter. These records do not complete the fifth day
or grant its later sailor, warning-letter or Master Chen outcomes.

| Event | Eligibility / presentation | Saved outcome |
| --- | --- | --- |
| `workday-four-night` | Completed fourth day and acknowledged Long Zha explanation; existing bedside approach after 20:00. Ordinary unvoiced sleep/stay-awake choice and final acknowledgement, not a newly invented dream. | Next personal day at 08:30, tested harbor arrival and fifth-morning notebook together. Cancellation changes neither date nor location. Optional; ordinary calendar waiting can also reach the next day. |
| `workday-five-race-entry` | Previous day complete and a later personal date than its saved finish; tested loading corridor 08:30–12:00. | Repeatable, reward-free transfer to the original race grid; no fifth result from an earlier race receipt. |
| `workday-five-race` | Independent fifth-day boarding, actual `ma00race` course. | Three physically driven laps/39 ordered server-observed gates, then acknowledged fifth-day result/date/notebook, minimum 09:00 and harbor arrival. No salary or rank prize. |
| `workday-five-morning` | Saved fifth race, dispatch approach 09:00–12:00. Five new physical deliveries followed by the original shared HIRUAUTH coworker lunch. | Morning receipt, notebook and noon together. No afternoon quota, red-cargo return credit, sailor chase, wages or complete-workday milestone. |
| `goro-mai-marriage` | Saved fifth morning; separate lunch approach 12:00–14:00 around original Ryo [36.425,0,58.455]. Original GOROKEKN/01GHO actors, motion, camera, twelve voices and eight effects. | Only its acknowledged meeting and notebook. Remain at the approach, restoring camera/controls; cancellation is retryable and completed entry/reload does not replay. |

### Provenance and approximations

Original `GOROKEKN.PKS` SHA256:
`b46218e928a21665463da0a39bc956eb9799d89b81554fdd39f722c84cf89c71`.
Its `SEQDATA0.AUTH` declares 1,234 frames and the HINA/AKIR/GORO cast;
M_01GHO supplies the original motion bank. The longer 42.4667-second movement
extent is not a reason to extend the declared AUTH ending. The room's literal
resource strings identify A1_GKEKN.SND and 01GHO; pinned original AFS speech
confirms the marriage announcement and Goro's intent to work honestly. Reuse
the existing Mai/MIB_L and Goro/KMB_L bindings rather than inventing identities.
All 24 locally generated asset records pass immutable hash/size checks; no
publication is implied by those local records.

Original job descriptions distinguish outbound crates to Warehouse No.8 and
red-marked return cargo to No.18, with a ten-delivery quota. The fixed five/five
split, condensed outdoor dispatch pad, ordinary morning crates, shared first
lunch film, forgiving boarding hours and 08:30 commute are adaptations. The
afternoon return leg and red-cargo presentation remain unimplemented here; the
morning must not masquerade as the complete two-leg job. Keep existing personal
weather/lighting; no new music selection, exact patrol or native controller
predicate is claimed. The meeting's approach/hour window is authored, while
its actual scene presentation remains original.

### Verification boundary

Existing real-compiler tests now cover fourth-night decline/cancellation/final
acknowledgement and missing Long Zha, next-day boarding with same-day/missing
finish-date rejection, a separately observed fifth race, and five newly
observed deliveries plus acknowledged lunch. A shared milestone-film check
covers missing fifth morning, early hour, completed state, cancellation and
only the two allowed announcement effects. The related Go packages pass
sequentially. The existing browser drivers are extended to this day, not
replaced by direct flag/date or race/cargo-result injection.

`NEW_YOKOSUKA_FIFTH_MORNING_E2E=true` continues the genuinely earned fourth-day
character. Connected local browser checks now pass across earned save
checkpoints: ordinary sleep decline/cancellation/final acknowledgement,
next-day harbor arrival/reload, a new actual three-lap/39-gate race, five
physical deliveries, original coworker lunch, cancelled/retried Goro/Mai
announcement, natural ending and saved reload without replay. The final save
is personal day 6207, December 30 at noon, still ¥19,836 with unchanged
inventory. All four new notebook pages are saved; fifth-afternoon, payday and
whole-day milestones remain absent.

The first cargo attempt exposed an X-only test-driver assumption: crate
contacts changed the vehicle's yaw and lateral position, so pickup three
missed the box. The shared driver now steers from observed two-dimensional
positions, lowers the forks before backing out and retries through actual
keyboard/physics input. No vehicle/cargo pose or delivery credit is injected,
and gameplay physics/validation are unchanged. The saved race was retained;
the successful continuation repeated only the unfinished cargo and meeting.

Inspected captures show the physical pickup and the original meeting shot
with Ryo and Goro; Mai is partly occluded behind Goro in the captured shot.
This does not establish clear visibility in every shot, and automated playback
was not assessed by listening for audio-mix fidelity. No assets were published.

## Fifth-afternoon sailor chase

The `sailor-chase` Yarn record continues the earned fifth-morning and Goro/Mai
receipts. The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed p. 60, establishes the encounter before payday and the warning letter.
[Shotgunnova's Runner's High section](https://www.neoseeker.com/shenmue/faqs/1593059-l.html)
supplies the detailed forks and both pursuit routes. These are authored
walkthrough-based conditions, not a recovered Dreamcast trigger controller.

| Field | Implementation |
| --- | --- |
| Location / eligibility | Story Ryo, saved fifth morning and marriage meeting, lounge-side street approach in MFSY, 14:00–17:00 personal time. Free roam and completed characters decline. |
| Entry / actors / props | Explicit question/leave choice. Original `PK_CTS/SEQDATA0.AUTH` introduction with Ryo, Tony, Smith and its original forklift model. |
| Action / timing | Real timed Left, B, B, Left, A inputs; choose a road fork (left adds another Left); then choose Tony or Smith. Tony's six inputs are Left, Right, A, Right, Left, Right; Smith's are Right, A, Left, Right, Left, Right. Original branch interrogation follows only accepted inputs. |
| Motion / cameras | Original introduction and interrogation motions/cameras. The intervening chase uses the original DJUN street corridor joined to original movie endpoints, generic biped running and an authored follow camera. |
| Dialogue / audio | Original 01CTS introduction and 01CTSA/01CTSB endings, exact native voice identities and SND cues. Both sailors identify Terry as the boss; neither supplies an invented date for the deal. |
| Weather / lighting | Preserve the personal environment; no forced weather or newly inferred original music. |
| Completion | Acknowledged ending atomically saves the chase receipt, Terry notebook page and that sailor's original final Ryo arrival. No cargo credit, wages, clock jump, warning letter or completed workday. |
| Failure / skip / replay | Wrong/timed-out input offers a fresh whole-chase retry or exit. Cancellation/preparation failure saves nothing. Ordinary cinematic skip can acknowledge a film, never a QTE input. A completed chase does not replay on entry/reload. Camera, avatar and controls use the existing transaction cleanup. |

The broader afternoon window, on-foot approach instead of an exact loaded-forklift
NW approach, untimed fork choices, two-second prompts and condensed roadway are
declared adaptations. Source references describe the original trigger around
15:30–16:30 with cargo on the forklift. They also differ on some alternate
input/failure routes; this implementation follows Shotgunnova's explicit
successful routes and retries the complete chase on failure rather than
reconstructing every original recovery branch. Remaining cargo, wages, letter
and Chen are separate progression; the chase cannot complete the shift.

### Original assets and audio boundaries

- `MA00/PK_CTS.PKS`: SHA256 `286c088071aaea7bb3764a410ab526e4db8243442b80d3e9024ec6ff05811ae0`, introduction declares 1,140 frames, AKIR/SMTH/TONY/FORK, `M_01CTS.MOTN`.
- `MA00/PK_CTS2.PKS`: SHA256 `b9ffa3ac9287ace6094cb02bb05c855150ff33aa17826e0025b858182de94ed9`, both endings declare 1,500 frames, `M_01CTSA.MOTN`. SEQDATA1 is Tony; SEQDATA0 is Smith, confirmed by cast and original speech.
- The pinned English introduction omits requested `01CTSA001.str` and `01CTSB003.str`. The Smith ending omits `01CTSBB001.str`. Preserve explicit unavailable records; no invented voice/subtitle.
- The original endings share exact Ryo AA voice members across their two AFS archives; Tony also references a Smith-archive groan. The shared audio builder now resolves explicitly pinned additional archives, retaining each member's real source. Duplicate names with different bytes or presentation metadata are rejected; it never searches unrelated archives or substitutes an approximate filename.
- A1_CTSA.SND lacks the requested Tony `a9041800:SUBERU4` and Smith `a9041900:SUBERU5` cloth effects. These exact incidental cues remain explicitly unavailable, not silently remapped.

`tools/scripting/build_harbor_sailor_chase.mjs` generates ordinary scenes and
Yarn through existing shared primitives. The real-compiler server test covers
both road forks and both sailors, missing prerequisites, wrong hours/bounds,
free roam, repeat protection, decline, stale input, wrong/late input and
cancelled introduction/movement/ending.

Rendered checks now cover original introduction cancellation, a wrong timed
input/retry, the actual left-road/Tony route and cancelled Tony interrogation,
then the actual right-road/Smith route and natural original ending. Captures
show the pursued actors on the road and Ryo with each sailor in their original
interrogation shots. The successful post-fix continuation used a clone of the
genuinely earned morning, not injected challenge results or future flags.
Reload preserves the Terry clue, notebook and Smith's original X/Z/facing
(grounded at y=0); a subsequent physical re-entry does not replay. Currency
remains ¥19,836, inventory is unchanged, and no afternoon/payday/day-complete
flag is awarded. Twelve focused reload checks also pass. Audio-mix fidelity
was not assessed by listening.

The same-world settlement exposed a shared arrival race, independently
reproduced by a failing server regression: old presence could consume the
first arrival reservation and subsequent old poses could rewind it. The
[arrival handoff](storyline-gameplay.md#committed-story-arrival-handoff) now
requires the exact loaded-pose revision before accepting any reserved Story
arrival. The post-fix browser continuation verifies the original ending
position survives the handoff and reload. A separate earned-save browser check
now drops the actual Smith completion reply and closes its socket. Ordinary
reconnect (without a page reload) restores the saved same-world pose before the
first outgoing presence, preserves the clue/money/inventory and does not replay
the interrogation; the subsequent full reload also matches. A deterministic
concurrent PostgreSQL test reproduced mixed old-header/new-flag reads; shared
read snapshots now keep character, flags and inventory coherent. An earlier
intermittent `no_script` startup rejection was not reproduced by the twelve
focused reload checks; retained diagnostics do not imply that its cause is
resolved. Source assets remain local (113 verified records, 5,696,751 bytes);
none were published.
