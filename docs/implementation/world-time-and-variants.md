# World time, lighting, seasons, and variants

This document is the canonical description of New Yokosuka's current world
clock and its browser presentation on `main`. It covers the Shenmue I
reconstruction. Shenmue II time, season, weather, and scene-variant behavior
must remain game-specific until its original data and runtime rules are
established.

This public clock is deliberately not a player's Shenmue story timeline. The
[MMO narrative adaptation policy](../design/shenmue1-narrative-adaptation.md)
requires native story-date predicates to be converted into named personal
narrative phases rather than evaluated against this synchronized calendar.

The implementation deliberately separates three kinds of claim:

- **Shenmue I evidence** comes from original files, executable behavior, or
  retained runtime captures.
- **Project policy** defines the authoritative shared clock used by New
  Yokosuka's server and clients.
- **Browser presentation** controls lighting, skies, texture packs, and visible
  MAP layers. Several presentation values are tuned approximations rather than
  recovered native light-field constants.

## Sources of truth

Server paths below are relative to the standalone
[`new-yokosuka-server`](https://github.com/brynnb/new-yokosuka-server)
repository.

| Responsibility | Source |
| --- | --- |
| Authoritative clock, calendar, season, and rollover | `internal/worldstate/clock.go` |
| Clock boundary broadcasts | `internal/worldstate/manager.go` |
| HTTP world-state API | `internal/httpapi/world_state.go` |
| Network snapshot schema | `internal/protocol/messages.go` |
| Browser clock projection and phase blending | `src/WorldTime.js` |
| `/play` clock ownership and per-world overrides | `play/world/WorldClock.js` |
| Time, season, sky, and lighting presets | `src/constants.js`, `src/lighting.js` |
| Asset-viewer variant filtering | `src/variants.js` |
| Shared MAP-layer switching | `src/rendering/WorldMapLayerState.js` |
| Evidence-backed D000 layer rules | `src/rendering/NativeMapLayerState.js`, `play/data/native-map-layer-states.json` |
| Reviewed timed player access | server `internal/travelaccess/rules.json`, evaluated by the realtime server |

When prose disagrees with these files and their tests, the implementation is
the authority for current New Yokosuka behavior. That does not automatically
make every implementation value a proven original Shenmue constant.

## Authoritative server clock

The Go server owns the shared calendar used by `/play`. `Clock.Snapshot()`
publishes the server and game timestamps, active-day bounds, day progress,
time-of-day classification, season, and a revision number through both
`GET /api/world-state` and the multiplayer protocol.

The implemented clock constants are:

| Setting | Current value |
| --- | --- |
| Initial game date and time | June 9, 1986 at 08:30 UTC |
| Active game-time window | 08:30 inclusive to 23:30 exclusive |
| Normalized 24-hour duration | 96 real minutes |
| Compression rate | One game hour per four real minutes |
| Active-window duration | 60 real minutes |
| Rollover | 23:30 skips to 08:30 on the next calendar date |

The distinction between normalized and active duration matters. The
`dayLengthMs` protocol field is `5,760,000` milliseconds, representing a
compressed 24-hour day. New Yokosuka exposes only 15 game hours per calendar
date, so `15 / 24 * 96 minutes` produces a 60-minute playable day.

The clock starts a new date every 60 real minutes. Time between 23:30 and 08:30
is skipped rather than simulated. Scheduled NPCs receive the same normalized
day length and server game time, keeping their routes aligned with clients.
Calendar rollover can restart ordinary daily routines, but it must not advance
personal story progress or activate a native story-specific schedule.

### Epoch and restart behavior

`WORLD_EPOCH_UNIX_MS` is the real-world Unix timestamp at which the New
Yokosuka calendar begins at June 9, 1986, 08:30. If it is absent or invalid,
the server uses its startup time as the epoch. A restart then begins the
calendar again at June 9, 08:30.

Set a stable `WORLD_EPOCH_UNIX_MS` in production only when the calendar should
continue across server restarts. The 96-minute rate is a gameplay constant and
cannot be changed through an environment variable.

The local development fallback follows the same rule. Without a server
snapshot, the browser begins at June 9, 1986, 08:30 and advances locally at the
default 96-minute normalized rate.

### Authoritative and local time changes

The local debug UI can use a browser-only hour override for inspecting lighting
without changing the server. It preserves the current calendar date.

It can also send `PATCH /api/world-state` with a `gameSecond`. The server
accepts times from 08:30 through 23:29, adjusts the epoch while preserving the
current calendar day, increments the clock revision, and broadcasts the new
snapshot. Times outside the active window are rejected.

## Browser synchronization

The browser obtains an initial snapshot from `/api/world-state` and receives
later snapshots through multiplayer messages. A snapshot contains both
`serverTimeMs` and `gameTimeMs`, allowing the browser to extrapolate between
messages instead of advancing an unrelated local game clock.

`WorldClock` corrects its view of server wall time using the snapshot's arrival
time. `gameDateFromWorldState()` then advances the game timestamp at the
configured compression rate and performs the 23:30-to-08:30 rollover locally.
The playable runtime checks this clock every 250 milliseconds.

The server manager samples once per second and broadcasts when the calendar
day, discrete time-of-day index, season index, or revision changes. Continuous
lighting does not require continuous network updates because every client
derives the blend from the synchronized game timestamp.

The clock currently drives:

- the loading screen and in-world date/time HUD;
- sky, clear-color, and light interpolation;
- time-controlled MAP-layer visibility;
- server authorization for the reviewed public-hours shop entrance;
- the day-rollover loading transition;
- scheduled NPC timing and client-side route projection; and
- time-specific presentation such as the daily 21:00 music cue.

## Time-of-day phases

New Yokosuka has four visual presets: day (`0`), sunset (`1`), evening (`2`),
and night (`3`). The browser blends continuously between them while the server
also reports a discrete index chosen at each blend's midpoint.

| Game time | Browser presentation | Discrete index |
| --- | --- | --- |
| Before 08:30 | Night | Night |
| 08:30–09:15 | Sunset to day sunrise blend | Sunset before 08:52:30, then day |
| 09:15–18:00 | Day | Day |
| 18:00–19:00 | Day to sunset blend | Day before 18:30, then sunset |
| 19:00–19:45 | Sunset to evening blend | Sunset before 19:22:30, then evening |
| 19:45–20:30 | Evening to night blend | Evening before 20:07:30, then night |
| 20:30 onward | Night | Night |

Sunset currently begins at 18:00 on every calendar date. Seasonal sunset times,
continuous native weather, and story-controlled calendar restrictions are not
implemented.

### Visual presets

| Index | Name | Sky | Clear color |
| ---: | --- | --- | --- |
| 0 | Day | `air00.png` | `[0.4, 0.6, 0.9, 1]` |
| 1 | Sunset | `air18.png` | `[0.8, 0.4, 0.2, 1]` |
| 2 | Evening | `air25.png` | `[0.05, 0.03, 0.1, 1]` |
| 3 | Night | `air25.png` | `[0.01, 0.01, 0.05, 1]` |

`src/lighting.js` interpolates the clear color and every configured Babylon
light property across a transition. A shader blends the two sky textures at
the same progress. Interiors do not render an exterior sky dome.

These presets are browser presentation choices informed by Shenmue footage and
extracted assets. They are not claimed to reproduce the complete original
lighting engine or native light-field data.

Opted-in Shenmue I worlds also load the enabled records from the initial
`LGHT` child in their native `MAPINFO.BIN`. These provisional point-light
representations are grouped in one clustered-light container per world so the
full baseline is not truncated by per-material light limits. You Arcade keeps
its separately authored fixture lighting, while Cinema and worlds without a
valid `LGHT` baseline retain their existing presentation lighting.

### Per-world policies

Exterior worlds normally use the live clock. World definitions can override
that behavior:

- ordinary generated Dobuita interiors are fixed to the day preset;
- You Arcade is fixed to the evening preset;
- the Hazuki Residence interior opts into dynamic time-of-day lighting, while
  remaining an interior with no exterior sky; and
- a local debug hour can temporarily override the live hour for presentation.

A fixed world index takes precedence over both live and debug time.

## Seasons

The project currently defines only summer (`0`) and winter (`1`). The server
validates `WORLD_SEASON`, defaults it to `summer`, and publishes both the name
and index. Changing a server `Clock` season increments its revision, although
there is currently no HTTP season-change endpoint.

The asset viewer has a manual season toggle. For a winter day it selects the
overcast `air07.png` sky and a `[0.5, 0.55, 0.65, 1]` clear color, and it chooses
winter MAP layers in areas with configured season groups.

### Known `/play` season gap

`/play` currently initializes the shared renderer season to summer and does not
copy `worldState.seasonIndex` into `state.currentSeason`. Consequently,
configuring the server with `WORLD_SEASON=winter` reports winter to clients but
does not yet switch the playable world's sky or seasonal model variants. This
is an implementation gap, not supported winter behavior.

## Texture-pack selection

The extraction pipeline recognizes zone archives whose names begin with
`MAP0`, `MAP1`, `MAP2`, or `MAP3` and builds corresponding browser packs named
`<prefix>_textures_0.bin` through `<prefix>_textures_3.bin`. `YORU` archives are
assigned to index `3`. Other extracted textures enter the zone's base pack.

At load time, `src/assetLoader.js` maps the four presentation indices directly
to texture-pack indices `0` through `3`. It tries the indexed pack first and
then the base pack. This describes New Yokosuka's extraction and lookup policy;
the numeric mapping should not be presented as a complete reconstruction of
the original game's runtime archive-selection rules.

## MAP-layer variants

Numbered `MAP*.MT5` files are independent scene layers, not the same thing as
the four indexed texture packs. New Yokosuka currently has two related layer
systems.

### Asset viewer

`ZONE_VARIANTS` in `src/constants.js` groups mutually exclusive layers by time
or season. It currently covers:

| Area | Configured behavior |
| --- | --- |
| BETD and JHD0 | Summer/winter ground, plants, trees, and foliage |
| JU00 | Day/evening window sets plus seasonal scenery and trees |
| JD00 | Day/evening window sets, seasonal scenery and trees, and winter snow |
| D000 | Day/evening backgrounds and windows plus summer/winter roads |
| MFSY | Day/evening ground, scenery, and activity layers |

Entries can name one suffix, several simultaneously active suffixes, or `null`
when a state has no layer. `alwaysHide` marks conflicting layers that should
never be shown by this presentation.

Inactive variants are excluded during scene loading. Changing time or season
in the asset viewer therefore reloads the scene so the required model files and
indexed textures can be fetched. Single-model mode bypasses variant filtering
so an individual file cannot disappear because of the current preset.

### Playable worlds

`/play` loads its world meshes and uses `WorldMapLayerState` to enable or
disable controlled roots without reloading the world:

- JU00 and JD00 use the three configured day/evening layer pairs;
- MFSY and the Forklift Playground use four harbor day/evening pairs;
- D000 uses generated, source-hashed native clock-window rules rather than a
  single broad day/evening switch; and
- MKSG spatial tiles are explicitly not classified as timed variants.

The generic pairs consider day and sunset indices to be the daytime set, and
evening and night indices to be the evening set. D000 is more precise: its
half-open time windows are evaluated per game minute and retain their original
06:00 day-boundary normalization and source evidence in
`tools/evidence/d000-time-window-evidence.json`.

Dobuita `MAP25.MT5` and `MAP26.MT5` are excluded from `/play` as optional
holiday-decoration layers. Their exact holidays remain unidentified, so they
are not assigned to a time or season by appearance alone.

### MAP layers do not authorize travel

The D000 layer-14 closed overlay and selector-30 door have an exact geometric
association. Their shared native half-open window, `[08:00, 19:30)`, is used
to generate the first server-readable timed access rule for travel from
Dobuita to `DCHA`. This is a reviewed cross-reference between two evidence
sets, not a general rule that every hidden overlay opens a portal.

The browser continues to evaluate MAP operation `0x0098` evidence for visual
layer state from the synchronized clock. The realtime server separately
samples its authoritative clock when it receives a transition request. A
client cannot authorize travel by hiding layer 14, changing local time, or
reporting `dcha` directly. Conversely, an active layer is presentation state;
it does not mutate the server's player membership.

Layer 13 keeps its exact `[08:00, 17:30)` visual behavior, but its associated
selector 63 is a native non-transition. No destination is synthesized for it.
The shared rule projection is generated with
`npm run build:timed-transition-access` and deliberately contains only the
selector-30 `DCHA` entry.

Public-hours authorization also carries a reviewed 24-hour exclusion list.
The four worlds currently both marked as interiors and exposed in the
Shenmue sidebar—Hazuki Residence Interior, Cinema, You Arcade, and MJQ Jazz
Bar—remain accessible at every public-clock time. The shared policy source is
`play/config/world-access-policy.json`; generated browser/server access data
and tests keep it synchronized with the menu. This affects player access only:
it does not change MAP-layer visibility, shutter schedules, or native evidence.

### Shenmue I scheduled scene objects

The production controller and generated manifest are per-zone. The complete
current Shenmue I schedule inventory contains 41 operation-`0x2a` commands,
all targeting Dobuita's `BS01` through `BS16`; no other area has a command that
can be activated safely. Those objects have an exact
one-to-one mapping to the same-numbered `DBS99xxG.MT5` roll-door assets. Their
area entry preserves native placement, facing, lower/upper Y endpoints,
animation rate, all commands, and current default-variant membership.
`shenmue1-scheduled-scene-objects.json` also records all catalogued asset areas
and runtime-placement manifests; an unreviewed area has zero definitions
rather than a filename-based guess.

This is client-coordinated presentation. `WorldClock.gameDate()` projects the
server's synchronized public clock, and `ScheduledSceneObjectRuntime` uses it
to select the latest reviewed command. Crossing a boundary during normal play
starts a local native-speed animation. Loading Dobuita after the boundary,
reconnecting, rolling into the next day, or receiving a stale clock correction
snaps directly to the endpoint. Clients therefore converge without streaming
per-frame object transforms.

Definitions carry a movement axis and per-control target/state mapping. The
generic controller can therefore host future reviewed horizontal or vertical
objects without assuming that another map's modes 4 and 5 mean D000-style
open and closed.

The runtime deliberately remains independent from both timed MAP layers and
travel authorization. Hiding a closed-overlay layer does not move a shutter;
moving a shutter does not authorize a portal; and the shutter meshes do not
add collision. Schedule-variant IDs can be supplied per actor as reviewed
story/date selection becomes available, while the current production fallback
uses each actor's generated default variant.

## Validation

The focused regression suite is:

```bash
node --test \
  tests/WorldTime.test.js \
  tests/WorldClock.test.js \
  tests/Jhd0SeasonVariants.test.js \
  tests/WorldMapLayerState.test.js \
  tests/NativeMapLayerState.test.js \
  tests/ScheduledSceneObjectCatalog.test.js \
  tests/ScheduledSceneObjectState.test.js \
  tests/TimedTransitionAccess.test.js

(cd ../new-yokosuka-server && \
  go test ./internal/worldstate ./internal/httpapi ./internal/travelaccess)
```

These tests cover clock compression and rollover, phase boundaries and blends,
authoritative debug updates, seasonal variant selection, generic and native
MAP-layer rules, and the world-state HTTP contract.

## Known boundaries

- The clock and most current research in this document are Shenmue I-specific.
- The browser sky, clear-color, and global lighting presets remain
  approximations. Recovered `LGHT` records are currently treated as point
  lights regardless of native type, and scripted child patches are not yet
  applied.
- Sunset does not vary by date or season.
- Server-configured winter is not yet connected to `/play` rendering.
- The original story-constrained calendar and weather system are not
  reproduced. This is intentional for personal story progression; original
  date predicates are narrative-authoring evidence, not public runtime gates.
- Not every numbered MAP layer has a proven time, season, or story-state owner;
  unresolved layers must not be classified from appearance or proximity alone.
