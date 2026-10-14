# Implementation Notes

This section documents the current browser/server architecture, runtime
behavior, configuration, controls, validation, and safe extension points.
Reverse-engineering evidence and original-game findings belong under
[`../research/`](../research/).

## Runtime domains

- [Audio](audio.md)
- [Audio archive browser](audio-archive.md)
- [Asset browser and shared scene rendering](asset-browser.md)
- [World loading and transitions](world-loading-and-transitions.md)
- [Prepared scenery experiment (local lab)](../guides/tooling/scenery-bundle-lab.md)
- [World time, lighting, seasons, and variants](world-time-and-variants.md)
- [Multiplayer server and persistence](multiplayer-server.md)
- [Story mode and Free roam](play-modes.md)
- [Scheduled NPCs](scheduled-npcs.md)
- [Shenmue II models](../guides/shenmue2-models.md)
- [Shenmue II animation system](shenmue2-animation.md)
- [TV and video surfaces](tv-video-surfaces.md)
- [Alpha-texture antialiasing](alpha-texture-antialiasing.md)
- [Shenmue I character rendering and surface diagnostics](shenmue1-character-rendering.md)
- [Native cloth](native-cloth-runtime.md) and [secondary motion](native-secondary-motion.md)
- [Native turn mirroring](native-turn-mirroring.md)
- [Storefront travel](storefront-travel.md)
- [Scene compositions](scene-compositions.md)
- [Cutscenes](cutscenes.md)
- [Dialogue and scripting](scripting/README.md)
- [MJQ pool integration](mjq-pool.md)

Extraction instructions belong in [guides](../guides/README.md). Plans for
remaining story-event integration belong in [design](../design/README.md).

## Play runtime ownership

`play/play.js` starts `PlayApplication`. The application constructs its runtime
on the first `start()` call and owns shutdown. Its composition function keeps
cross-domain wiring in one place; mutable application references are scoped to
that lifetime rather than created during module import.

| Responsibility | Owner |
| --- | --- |
| Player model, controller, animation, emotes, character switching | `characters/PlayerRuntime.js` |
| World selection, readiness, and load ordering | `world/WorldRuntime.js`, using `WorldSessionRuntime.js` for cancellation |
| World-specific setup, teardown, and travel adapters | `world/PlayWorldLifecycle.js` |
| Clock, weather, and environment changes | `world/WorldEnvironmentRuntime.js` |
| Dialogue, room scripts, events, and cutscene lifecycle | `scripts/NativeStoryRuntime.js` |
| Native player presentation, room transactions, and event bindings | `events/NativeEventAssembly.js` |
| Multiplayer connection and presence; gameplay message mapping | `multiplayer/PlayMultiplayerRuntime.js` and `PlayMultiplayerAdapter.js` |
| Fixed simulation and per-frame presentation | `PlaySimulationRuntime.js` and `PlayPresentationRuntime.js` |
| Render scheduling, observers, resizing, and loop shutdown | `PlayLoopRuntime.js` |
| Menu cutscene loading, completion, and isolated dialogue state | `cutscenes/CutscenePreviewRuntime.js` |

Paths in the table are relative to `play/`. The domain assembly modules connect
existing components; they are not alternate state stores or general service
registries. Keep related integration code together and split only when a new
responsibility warrants it. There is no per-file line limit.

For changes to these boundaries, run the relevant `tests/*Runtime.test.js` tests,
then `npm test` and `npm run build`. Browser startup/disposal is covered by
`tests/e2e/application-lifecycle.spec.js`; the cutscene preview test exercises
real asset loading, playback, and returning to the menu.

## Settings input and modal lifetime limitation

The current Settings dialog force-mounts its content while `open=false` so its
hidden legacy checkbox/slider inputs retain the identity held by `play/ui/dom.js`
and preference bindings. Radix's modal content still calls `hideOthers` while
mounted, leaving the visible sidebar with `aria-hidden=true` even when settings
and story dialogue are closed. This is an existing accessibility limitation,
not a story-event save or control-lock failure. Inventory and notebook remain
visually usable, but role-based sidebar discovery is affected.

The correct follow-up is to separate persistent legacy input ownership from
visible modal ownership. Simply removing `forceMount` or switching the Root's
`modal` prop with `open` replaces those inputs when content changes type and
leaves cached bindings pointing at detached nodes. Do not repair this by
globally removing `aria-hidden` or disabling the open dialog's modal behavior.
