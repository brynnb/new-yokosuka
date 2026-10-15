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
once-only payday and Goro's warning. Subsequent workdays and later Mad Angels
encounters remain missing. Existing
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
The first workday is verified through Goro's warning; the return-home dream,
second workday and later narrative are separate unfinished continuations.
