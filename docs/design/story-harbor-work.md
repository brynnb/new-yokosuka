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

Forklift training, authoritative crate quotas/pay, the workday calendar,
morning races and subsequent Mad Angels encounters remain missing. Existing
forklift driving, cargo and racing must be reused; neither film completion
nor a client-reported win may grant a shift's salary or story outcome.
