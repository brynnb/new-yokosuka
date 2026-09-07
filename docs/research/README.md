# Reverse-engineering research

Our research records native formats, captured behavior, evidence chains,
hypotheses, disproven candidates, and unresolved boundaries. It does not prove
that a corresponding browser feature is complete. Current application behavior
belongs in [implementation](../implementation/README.md), and proposed work in
[design](../design/README.md).

## Shared formats and methods

- [Dreamcast music and ambient banks](dreamcast-music.md)
- [Scene-script bytecode reference and format boundary](scene-script-bytecode.md)
- [Emulator investigation workflow](../guides/emulator-research.md)

## Shenmue I

- [Archive, model, texture, and scene formats](shenmue1/file-formats.md)
- [Scheduled actors and native controllers](shenmue1/scheduled-actors.md)
- [Dialogue extraction and native state layouts](shenmue1/dialogue-extraction.md)
- [Dialogue gameplay effects](shenmue1/dialogue-gameplay-effects.md)
- [Runtime object placement](shenmue1/runtime-object-placement.md) and
  [animation](shenmue1/runtime-object-animation.md)
- [Dobuita placement](shenmue1/d000-object-placement.md),
  [BETD placement](shenmue1/betd-object-placement.md), and
  [JOMO placement coverage](shenmue1/jomo-placement-coverage.md)
- [JOMO operation trace](shenmue1/jomo-object-operation-trace.md) and
  [interaction coverage](shenmue1/jomo-interaction-coverage.md)
- [Map transitions and reconstruction evidence](shenmue1/map-transition-trace.md)
- [Native collision](shenmue1/native-world-collision.md)
- [Combat](shenmue1/martial-arts-combat.md)
- [Collection model naming](shenmue1/collection-model-names.md)
- [Native world audio](shenmue1/native-world-audio.md)
- [OP00 introduction assets](shenmue1/op00-introduction-assets.md)
- [Cutscene corpus diagnostics](shenmue1/cutscene-corpus-diagnostics.md),
  [scene inventory interpretation](shenmue1/player-facing-cutscene-scene-inventory.md),
  and [D0W0/BUSS music boundaries](shenmue1/selectable-d0w0-buss-music.md)

## Shenmue II

- [Animation research and native capture findings](shenmue2/animation.md)
- [Model extraction and staging workflow](../guides/shenmue2-models.md)
- [Current animation implementation](../implementation/shenmue2-animation.md)

## Evidence and provenance

Retain source identities, hashes, offsets, capture conditions, and the distinction
between observation and inference. Historical measurements describe their cited
sample, not the whole current application. Consult generated inventories for
changing coverage counts and label missing local capture prerequisites explicitly.

Machine-readable evidence remains in `tools/evidence/`. Preserved wiki text and
original-source examples are indexed separately under
[external references](../reference/external/README.md); they are not our own research.
