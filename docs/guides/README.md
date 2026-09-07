# Guides

These are workflows to follow, not a second description of application architecture.
Commands run from the repository root unless a guide explicitly says otherwise.

## Assets and extraction

- [Runtime asset setup and publication](runtime-assets.md)
- [Shenmue I isolated extraction](shenmue1-extraction.md)
- [Shenmue II models: extraction, staging, and integration](shenmue2-models.md)
- [Asset and texture extraction commands](tooling/asset-extraction.md)

## Investigation and authoring

- [Emulator research and capture](emulator-research.md)
- [Native script recovery](native-script-recovery.md)
- [Script authoring and editor workflow](../implementation/scripting/script-authoring.md)
- [Scripting debugging and validation](../implementation/scripting/debugging.md)

## Tool command reference

- [Scheduled actors](tooling/scheduled-actors.md)
- [Animation, character diagnostics, and placement](tooling/animation-and-placement.md)
- [Scene and event analysis](tooling/scene-and-event-analysis.md)
- [Dialogue extraction](tooling/dialogue-extraction.md)

Disc images, emulator saves, and large captures are local prerequisites; they
are not supplied by a clean clone or by the runtime-asset restore command.
See each workflow's input requirements before running a corpus-wide job.
