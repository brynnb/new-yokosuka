# Scheduled and room-owned NPCs

New Yokosuka separates NPC authority from browser presentation. The standalone
[`new-yokosuka-server`](https://github.com/brynnb/new-yokosuka-server) selects
daily schedule variants, advances routes against the shared world clock, and
sends world-scoped NPC snapshots. This repository loads the required character
assets and renders those states.

The server's
[scheduled-NPC guide](https://github.com/brynnb/new-yokosuka-server/blob/main/docs/implementation/scheduled-npcs.md)
is the source of truth for timetable interpretation, obstruction, persistence,
and network publication. This page describes the browser-owned half.

## Browser data

The extracted Shenmue I schedule projection lives at
`play/data/scheduled-actors.json`. The client generator splits render data into
31 small world shards under `play/data/scheduled-actors/`. A world loads only
its own actor definitions through
`src/PlayScheduledActorShardLoaders.generated.js`; the complete schedule corpus
does not enter the production bundle.

Each shard retains only what presentation needs:

- stable actor and program identities;
- models, textures, and motion requirements;
- route geometry and native movement speeds;
- model overrides, actor-local objects, and secondary attachments; and
- the native source contexts allowed to render in that world.

The server independently embeds its runtime projection. Neither repository
reads or writes the other's checkout during an ordinary build.

## Runtime ownership

`ScheduledActorNetworkState` accepts newer server revisions for the active
world and projects walking progress from the message timestamp. Corrections are
blended briefly instead of snapping. `ScheduledActorRuntime` evaluates the
native character rig and motion clip, presents attached objects, and removes
actors omitted from an authoritative snapshot.

The browser never chooses an actor's daily timetable or publishes an NPC as
authoritative. Conversely, the server does not own meshes, animations, camera
presentation, or picking.

## Presentation cost and lifetime

The runtime retains GPU skinning and cached motion clips. Actor-level frustum
and optimistic GPU occlusion queries skip hidden bodies; the query proxy stays
enabled independently so a previously hidden actor can become visible again.
Its shared material is cached only while live. World disposal invalidates that
cache, and partial/cancelled model cleanup preserves materials and textures
still referenced by another mesh, including disabled cached variants.

Visible pose updates use camera-distance tiers, measured in browser world units:

| Distance | Pose sampling |
| --- | --- |
| Up to 12 | Every rendered frame |
| 12–28 | Up to 30 Hz |
| Beyond 28 | Up to 15 Hz |

These are client quality settings, not reconstructed Dreamcast timetable rules.
Network placement, facing, schedule selection and the animation clock continue
every frame. A sampled pose uses the current clip time, so distant actors do not
walk in slow motion. Secondary-motion and cloth solvers receive the accumulated
visible time between samples. Becoming visible, changing models/motions, returning
from an activity, and approaching the camera force an immediate update; hidden
time is not replayed as a large catch-up. Active dialogue and forklift riders use
full cadence. Script/cutscene presentation keeps its existing exclusive ownership.
Between samples, retain the whole pose, including the render-root translation
used by S2 motions. Secondary-object placement may restore a driver's translation
when releasing its forklift seat; it must not reset ordinary NPC animation roots.

### Repeatable performance comparisons

Use one local browser workload at a time, with the same canvas size, graphics
preferences, date, server snapshot and camera. Fix snapshot positions for the
comparison without stopping the animation clock. Measure warmed frames rather
than downloads/shader compilation, and repeat after Dobuita → Hazuki Grounds →
Dobuita. Check camera turns and visible actors as well as timings. Babylon's
draw-call counter is cumulative: record its per-frame difference.

The October 2026 check used a 1160 × 900 canvas, dynamic resolution disabled,
December 3, 1986 noon schedule states (38 present actors in Dobuita, one at Hazuki
Grounds), and the Dobuita street view at `(-16, 0.07, 27)`, camera yaw `3π/2`,
pitch `0.12`, distance `4`. Four NPCs were visible. With unrelated animation work
held constant, fixing the query-material lifetime kept four visible actors after
returning, instead of nineteen erroneously uncullable bodies. Subsequent scaled
world batching reduced that view from 1,528 to 1,446 draw calls (Hazuki: 380 to
366). Reversible pose-cadence checks reduced distant sampling from approximately
170–186 calls/second to 105–106 without changing draw calls or visible counts.

CPU frame times varied with machine load; these are not production FPS promises.
At a 4× CPU slowdown the frame rate fell below the farthest pose tier, so cadence
could not skip work reliably. Draw submission remains substantial, and real
lower-end hardware still needs testing. Reducing resolution alone does not remove
the CPU work needed to submit many meshes.

## Interior NPCs

Daily-routine actors and room-owned actors use the same browser loading entry
point but have different evidence:

- scheduled actors come from timetable programs and can move between exterior
  and supported interior worlds;
- room-owned actors come from a room's native actor records and may exist only
  while that room is loaded, without a daily timetable.

`play/data/nativeRoomActors.js` records the reviewed room-owned
actors. For example, the fortune teller in DURN is room-owned, so she is merged
into that room's actor definitions without pretending she has a street
schedule. This is a reusable data path, not a fortune-teller-specific runtime
special case. It covers the catalogued records; it is not evidence that every
room script on all discs has been exhaustively recovered.

## Scene-object schedules

Scheduled scene objects are a separate presentation system. The generated
catalog at `play/data/shenmue1-scheduled-scene-objects.json` currently contains
the reviewed Dobuita roll-door mappings. It does not grant player travel or
turn every native schedule command into a generic movable object.

## Regeneration and tests

After changing extracted schedule inputs, regenerate client data from this
repository:

```sh
npm run build:scheduled-actors
npm run build:scheduled-actor-motions
```

Regenerate server data from the server repository:

```sh
cd ../new-yokosuka-server
npm run generate:npcs
go run ./cmd/npc-audit
go test ./...
```

The client shortcut `npm run build:server-npcs` delegates the first server
command to the configured standalone checkout. Review and commit changes in
the repository that owns each output.

Focused browser checks are:

```sh
node --test --test-concurrency=1 \
  tests/PlayScheduledActors.test.js \
  tests/ScheduledActorNetworkState.test.js \
  tests/ScheduledActorRuntime.test.js \
  tests/ScheduledActors.test.js
```
