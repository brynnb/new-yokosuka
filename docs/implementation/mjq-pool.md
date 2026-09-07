# MJQ native nine-ball

New Yokosuka runs Lucky Break's gameplay code directly inside the MJQ Jazz Bar.
There is no iframe, second Babylon scene, GLB table, or Lucky Break UI.

## Ownership boundary

`@brynnb/lucky-break-engine` owns:

- continuous billiards physics and the Shenmue table collision mesh;
- the nine-ball referee, fouls, scoring, turn changes, and ball in hand;
- shot input, simulation snapshots, prediction primitives, and AI planning;
- renderer-neutral events and serializable numeric state.

New Yokosuka owns:

- loading `S1_DJAZ_BOLK5DYG.MT5` and `S1_DJAZ_CYUW1H1G.MT5`;
- mapping the ten native MT5 ball nodes to engine ball numbers;
- translating engine-local positions by the native table center
  `[-3.1459919, 0, -8.7110184]`;
- the MJQ interaction anchor, camera, input, HUD, and movement lock;
- presenting the native cue and hiding pocketed native ball meshes.

The runtime is in `play/pool/MjqPoolRuntime.js`. Room equipment and interaction
coordinates are in `play/config/pool.js`.

## Updating from Lucky Break

Until the engine is published, New Yokosuka commits a reproducible package
tarball containing compiled JavaScript and type declarations, not private source
or source maps. New Yokosuka publishes its own debugging maps; these can expose
the already-distributed engine JavaScript, not the engine's original TypeScript.
Refresh it from a private Lucky Break checkout with:

```sh
# In Lucky Break, bump package.json's version for behavior changes first.
npm run sync:lucky-break-engine -- /path/to/lucky-break
npm test
npm run build
```

The sync command builds and packs Lucky Break's public engine entry, then
atomically replaces `vendor/lucky-break-engine.tgz` and updates the installed
dependency plus `package-lock.json`. No source directories are copied by hand.
Every behavior-changing engine update must use a new package version; otherwise
npm may retain its cached copy of the same-version tarball.

After `@brynnb/lucky-break-engine` is published or the Lucky Break repository
has a release tag, replace the `file:` dependency in `package.json` with the
pinned release. A dependency-update bot can then open the version bump in New
Yokosuka automatically.

## Controls

- Click the pool table while standing nearby to start.
- Drag horizontally, or use Left/Right or A/D, to aim.
- Use Up/Down or W/S, the mouse wheel, or the HUD slider to set power.
- Adjust English with the HUD slider.
- Press Space or the Shoot button to strike.
- Press Escape or the close button to leave the table.

The opponent uses the shared Lucky Break AI. Normal character movement and the
third-person camera are suspended only while the pool session is active.
