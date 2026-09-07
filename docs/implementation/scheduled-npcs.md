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
node --test \
  tests/PlayScheduledActors.test.js \
  tests/ScheduledActorNetworkState.test.js \
  tests/ScheduledActorRuntime.test.js \
  tests/ScheduledActors.test.js
```
