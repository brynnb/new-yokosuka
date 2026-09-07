# Shenmue I storefront travel

Dobuita's physical door-table index and its transition coroutine's resumed
argument are different identifiers. Never join them by numeric equality.
For example, physical door **30** (`DR02_016`, below street level) belongs to
Heartbeats Bar, while coroutine argument **30** selects `DCHA` (Ajiichi).
Physical door **28** (`DR15_013`) is the restaurant entrance.

`tools/worlds/build_browser_map_transitions.py` builds 22 entrance associations from
original interior return routes: the return names a Dobuita Entry, whose exact
authored position is matched to the nearest physical doorway within 2.5 units.
These are spatially inferred entrance associations, not a recovered native
door-to-coroutine dispatch table. The exit destinations and Entry positions
come from original MAPINFO data. Destination arrivals use authored Entry data
where available, otherwise the documented interior-door-derived spawn.

`src/MapTransitions.js` binds clicks only through
`reverseMatchedD000Transitions`. `d000DirectTransitions` retains recovered
script destinations for research/arrival data, with `source.dispatchValue`;
it does not expose a physical `doorSelector` or clickable model.

## Clock layers are not access rules

An older timed-access generator joined dispatcher numbers to physical doors.
That overrode Heartbeats with Ajiichi, disabled Ajiichi's real door, and excluded
the barbershop. It also assigned an unverified 08:00–19:30 access window.
Those rules are retired in both the client and server generators. Original
clock-driven visual layers remain unchanged, but horizontal containment within
an overlay does not prove player access, a destination, or absence of a portal.

The timed authorization framework remains tested with synthetic fixtures.
Publishing new rules requires evidence linking the physical entrance, actual
destination, and access condition; do not revive the historical selector join
from older research snapshots. Deploy the client and separate server together
when changing these rules, since the server independently validates access.

Focused checks:

```sh
node --test tests/MapTransitions.test.js tests/NativeMapTransitions.test.js tests/TimedTransitionAccess.test.js tests/D000ScriptedStoreState.test.js tests/TravelTransitions.test.js
```

In the server repository, run `go test ./internal/travelaccess ./internal/realtime`.
