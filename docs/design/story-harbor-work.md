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
verification. The subsequent dream and later workdays remain missing. Existing
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
continuation below. The subsequent dream remains missing.

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
Nothing has been published or deployed. The next connected milestone is the
return-home Lan Di dream and fourth working morning, followed by the remaining
Mad Angels workdays, Nozomi rescue and departure.
