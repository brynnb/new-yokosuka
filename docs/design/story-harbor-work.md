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
Paid crate quotas, the workday calendar,
morning races and later Mad Angels encounters remain missing. Existing
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
the exploration race's local best-time record. The client clock display appeared
to keep extrapolating during this event although the saved personal time paused;
verify that display boundary before relying on workday appointments.
